import { OpenAIChatCompletionsProvider } from '../../../providers/openaiChatCompletionsProvider.js';
import { registerProvider } from '../../../providers/providerFactory.js';
import { withProviderResilience } from '../../../providers/resilientProvider.js';

let registered = false;

/**
 * xAI (Grok) Provider Plugin
 *
 * Registers the xAI provider with hardened error handling for:
 * - Network failures (premature close, connection reset)
 * - Stream errors (gunzip, decompression failures)
 * - Rate limiting with exponential backoff
 * - Circuit breaker for cascading failure prevention
 */
export function registerXaiProviderPlugin(): void {
  if (registered) {
    return;
  }

  registerProvider('xai', (config) => {
    const baseProvider = new OpenAIChatCompletionsProvider({
      apiKey: requireEnv('XAI_API_KEY'),
      model: config.model,
      baseURL: 'https://api.x.ai/v1',
      providerId: 'xai',
      timeout: 120000,
      maxRetries: 3,
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
      ...(typeof config.maxTokens === 'number' ? { maxTokens: config.maxTokens } : {}),
    });

    // Wrap with resilience layer
    return withProviderResilience(baseProvider, 'xai');
  });

  registered = true;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}
