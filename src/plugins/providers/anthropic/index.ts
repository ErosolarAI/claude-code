import { AnthropicMessagesProvider } from '../../../providers/anthropicProvider.js';
import { registerProvider } from '../../../providers/providerFactory.js';
import { withProviderResilience } from '../../../providers/resilientProvider.js';

let registered = false;

/**
 * Anthropic (Claude) Provider Plugin
 *
 * Registers the Anthropic provider with hardened error handling for:
 * - Network failures (premature close, connection reset)
 * - Stream errors (gunzip, decompression failures)
 * - Rate limiting with exponential backoff
 * - Circuit breaker for cascading failure prevention
 */
export function registerAnthropicProviderPlugin(): void {
  if (registered) {
    return;
  }

  registerProvider('anthropic', (config) => {
    const options = {
      apiKey: requireEnv('ANTHROPIC_API_KEY'),
      model: config.model,
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
      ...(typeof config.maxTokens === 'number' ? { maxTokens: config.maxTokens } : {}),
      // Pass thinking configuration for extended thinking models (Claude 4/3.7)
      ...(config.thinking ? { thinking: config.thinking } : {}),
    };
    const baseProvider = new AnthropicMessagesProvider(options);

    // Wrap with resilience layer
    return withProviderResilience(baseProvider, 'anthropic');
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
