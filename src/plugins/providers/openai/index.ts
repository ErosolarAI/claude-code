import { OpenAIResponsesProvider } from '../../../providers/openaiResponsesProvider.js';
import { registerProvider } from '../../../providers/providerFactory.js';
import { withProviderResilience } from '../../../providers/resilientProvider.js';
import type { ProviderId } from '../../../core/types.js';

let registered = false;

/**
 * OpenAI Provider Plugin
 *
 * Registers the OpenAI provider with hardened error handling for:
 * - Network failures (premature close, connection reset)
 * - Stream errors (gunzip, decompression failures)
 * - Rate limiting with exponential backoff
 * - Circuit breaker for cascading failure prevention
 */
export function registerOpenAIProviderPlugin(providerId: ProviderId = 'openai'): void {
  if (registered) {
    return;
  }

  registerProvider(providerId, (config) => {
    const options = {
      apiKey: requireEnv('OPENAI_API_KEY'),
      model: config.model,
      providerId,
      ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
      ...(config.textVerbosity ? { textVerbosity: config.textVerbosity } : {}),
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
      ...(typeof config.maxTokens === 'number' ? { maxTokens: config.maxTokens } : {}),
    };
    const baseProvider = new OpenAIResponsesProvider(options);

    // Wrap with resilience layer
    return withProviderResilience(baseProvider, 'openai');
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
