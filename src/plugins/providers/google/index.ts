import { GoogleGenAIProvider } from '../../../providers/googleProvider.js';
import { registerProvider } from '../../../providers/providerFactory.js';
import { withProviderResilience } from '../../../providers/resilientProvider.js';

let registered = false;

/**
 * Google (Gemini) Provider Plugin
 *
 * Registers the Google provider with hardened error handling for:
 * - Network failures (premature close, connection reset)
 * - Stream errors (gunzip, decompression failures)
 * - Rate limiting with exponential backoff
 * - Circuit breaker for cascading failure prevention
 */
export function registerGoogleProviderPlugin(): void {
  if (registered) {
    return;
  }

  registerProvider('google', (config) => {
    const options = {
      apiKey: requireEnv('GEMINI_API_KEY'),
      model: config.model,
      providerId: 'google',
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
      ...(typeof config.maxTokens === 'number' ? { maxOutputTokens: config.maxTokens } : {}),
      // Pass thinking configuration for Gemini 2.5/3 models
      ...(config.thinking ? { thinking: config.thinking } : {}),
      // Pass thinking level for Gemini 3 Pro
      ...(config.thinkingLevel ? { thinkingLevel: config.thinkingLevel } : {}),
    };
    const baseProvider = new GoogleGenAIProvider(options);

    // Wrap with resilience layer
    return withProviderResilience(baseProvider, 'google');
  });

  registered = true;
}

function requireEnv(name: string): string {
  // Check primary key first, then fallback
  const value = process.env[name] || process.env['GOOGLE_API_KEY'];
  if (!value) {
    throw new Error(`Missing required environment variable ${name} or GOOGLE_API_KEY.`);
  }
  return value;
}
