import { OpenAIChatCompletionsProvider } from '../../../providers/openaiChatCompletionsProvider.js';
import { registerProvider } from '../../../providers/providerFactory.js';
import { withProviderResilience } from '../../../providers/resilientProvider.js';

let registered = false;

/**
 * Ollama Provider Plugin
 *
 * Registers the Ollama provider with hardened error handling.
 * Ollama provides an OpenAI-compatible API, so we can reuse the OpenAI provider
 * with a custom base URL. By default, Ollama runs on http://localhost:11434.
 *
 * Note: Ollama is local so circuit breaker is disabled, but retries are still useful
 * for handling temporary resource constraints.
 */
export function registerOllamaProviderPlugin(): void {
  if (registered) {
    return;
  }

  registerProvider('ollama', (config) => {
    const baseURL = process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434/v1';

    const options = {
      apiKey: 'ollama', // Ollama doesn't require an API key for local instances
      model: config.model,
      providerId: 'ollama' as const,
      baseURL,
      timeout: 300000, // 5 minutes - local models can be slow
      maxRetries: 2,
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
      ...(typeof config.maxTokens === 'number' ? { maxTokens: config.maxTokens } : {}),
    };

    const baseProvider = new OpenAIChatCompletionsProvider(options);

    // Wrap with resilience layer (circuit breaker disabled for local)
    return withProviderResilience(baseProvider, 'ollama');
  });

  registered = true;
}

/**
 * Query available models from local Ollama instance.
 * Returns an array of model names that are currently available.
 */
export async function getAvailableOllamaModels(
  baseURL: string = 'http://localhost:11434'
): Promise<string[]> {
  try {
    const response = await fetch(`${baseURL}/api/tags`);
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

/**
 * Check if Ollama is running and accessible.
 */
export async function isOllamaAvailable(
  baseURL: string = 'http://localhost:11434'
): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}
