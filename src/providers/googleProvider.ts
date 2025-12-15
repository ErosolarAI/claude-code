/**
 * Google AI Provider - Secure Gemini API Integration
 *
 * Security features:
 * - API key validation and protection
 * - Error message sanitization to prevent credential leakage
 * - Rate limiting integration
 * - Safe JSON parsing with prototype pollution protection
 * - Retry logic with exponential backoff
 */

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';
import type {
  Content,
  GenerateContentParameters,
  GenerateContentResponse,
  FunctionDeclaration,
  Part,
  GenerateContentResponseUsageMetadata,
  GenerateContentConfig,
  Tool,
} from '@google/genai';
import type {
  ConversationMessage,
  LLMProvider,
  ProviderId,
  ProviderModelInfo,
  ProviderResponse,
  ProviderToolDefinition,
  ToolCallRequest,
  ProviderUsage,
  StreamChunk,
  JSONSchemaObject,
} from '../core/types.js';
import { sanitizeErrorMessage, safeErrorMessage } from '../core/secretStore.js';
import { logDebug } from '../utils/debugLogger.js';
import { securityLogger, globalRateLimiter } from '../utils/securityUtils.js';
import { safeJSONParse } from './openaiChatCompletionsProvider.js';

const REQUEST_CHAR_LIMIT = 800_000; // Hard cap to avoid provider 413 errors

// ============================================================================
// Error Types for Detection
// ============================================================================

const RECOVERABLE_ERROR_PATTERNS = [
  'premature close',
  'premature end',
  'unexpected end',
  'aborted',
  'fetcherror',
  'invalid response body',
  'gunzip',
  'decompress',
  'econnreset',
  'econnrefused',
  'epipe',
  'socket hang up',
  'network',
  'timeout',
] as const;

/**
 * Custom error class for provider-specific failures
 */
export class GoogleProviderError extends Error {
  readonly isRetryable: boolean;
  readonly originalError?: Error;
  readonly providerId: string;

  constructor(message: string, providerId: string, originalError?: Error, isRetryable = true) {
    // SECURITY: Sanitize the error message to prevent token leakage
    super(sanitizeErrorMessage(message));
    this.name = 'GoogleProviderError';
    this.providerId = providerId;
    this.originalError = originalError;
    this.isRetryable = isRetryable;

    // SECURITY: Sanitize stack trace to prevent token leakage
    if (originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${sanitizeErrorMessage(originalError.stack)}`;
    }
  }
}

/**
 * Check if an error is recoverable (should be retried)
 */
function isRecoverableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const errorName = error.name?.toLowerCase() ?? '';
  const errorCode = (error as { code?: string }).code?.toLowerCase() ?? '';

  // Check all sources for recoverable patterns
  const allText = `${message} ${errorName} ${errorCode}`;

  return RECOVERABLE_ERROR_PATTERNS.some(pattern => allText.includes(pattern));
}

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Security audit: Google API key validation and protection
 * Enhanced with comprehensive validation and security controls
 */
function validateAndProtectApiKey(apiKey: string): string {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Google API key is required and must be a string');
  }

  // Remove whitespace
  apiKey = apiKey.trim();

  // Comprehensive format validation
  const validation = validateGoogleKeyFormat(apiKey);
  if (!validation.isValid) {
    throw new Error(`Invalid Google API key: ${validation.reason}`);
  }

  // Security logging (redacted)
  const redactedKey = apiKey.length > 8 ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : '[REDACTED]';
  logDebug(`[SECURITY] Using Google API key (type: ${validation.keyType}, redacted: ${redactedKey})`);

  // Check for known revoked/compromised key patterns
  if (isPotentiallyCompromisedKey(apiKey)) {
    console.warn('SECURITY WARNING: Google API key matches patterns associated with compromised keys. Rotate immediately.');
  }

  return apiKey;
}

/**
 * Comprehensive Google key format validation
 */
function validateGoogleKeyFormat(apiKey: string): {
  isValid: boolean;
  reason?: string;
  keyType: 'gemini' | 'oauth2' | 'service_account' | 'unknown';
} {
  // Length validation
  if (apiKey.length < 30 || apiKey.length > 5000) {
    return { isValid: false, reason: `Invalid key length: ${apiKey.length} chars (expected 30-5000)`, keyType: 'unknown' };
  }

  // Google AI API key format (starts with AIza)
  if (apiKey.startsWith('AIza')) {
    // Typical format: AIzaSyA... (39 chars for standard keys)
    if (apiKey.length < 39 || apiKey.length > 100) {
      return { isValid: false, reason: `Google AI key should be 39-100 chars, got ${apiKey.length}`, keyType: 'gemini' };
    }
    return { isValid: true, keyType: 'gemini' };
  }

  // OAuth2 token format (starts with ya29. or 1//)
  if (apiKey.startsWith('ya29.') || apiKey.startsWith('1//')) {
    // OAuth2 tokens can vary in length
    if (apiKey.length < 100 || apiKey.length > 2000) {
      return { isValid: false, reason: `OAuth2 token length ${apiKey.length} outside expected range`, keyType: 'oauth2' };
    }
    return { isValid: true, keyType: 'oauth2' };
  }

  // Service account JSON key (starts with {)
  if (apiKey.trim().startsWith('{')) {
    try {
      // Validate it's valid JSON
      const parsed = safeJSONParse<Record<string, unknown>>(apiKey, { maxDepth: 10, maxProperties: 50 });
      if (parsed.type === 'service_account' && parsed.private_key) {
        return { isValid: true, keyType: 'service_account' };
      }
    } catch {
      // Not valid JSON
    }
  }

  // Unknown format but might be valid (custom deployments, etc.)
  console.warn(`Unrecognized Google API key format: ${apiKey.substring(0, 12)}...`);
  return { isValid: true, keyType: 'unknown' };
}

/**
 * Check for patterns associated with compromised keys
 */
function isPotentiallyCompromisedKey(apiKey: string): boolean {
  // Check for test keys or placeholder patterns
  const compromisedPatterns = [
    'test_',
    'demo_',
    'example_',
    'placeholder',
    'changeme',
    'your-api-key-here',
  ];

  const lowerKey = apiKey.toLowerCase();
  for (const pattern of compromisedPatterns) {
    if (lowerKey.includes(pattern)) {
      return true;
    }
  }

  // Check for sequential or repeating patterns
  const sequentialPattern = /(\d{3,})/;
  const match = sequentialPattern.exec(apiKey);
  if (match) {
    const sequence = match[1];
    if (isSequentialDigits(sequence)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a string of digits is sequential
 */
function isSequentialDigits(str: string): boolean {
  if (str.length < 3) return false;

  // Check ascending
  let ascending = true;
  for (let i = 1; i < str.length; i++) {
    if (parseInt(str[i]) !== parseInt(str[i-1]) + 1) {
      ascending = false;
      break;
    }
  }

  if (ascending) return true;

  // Check descending
  let descending = true;
  for (let i = 1; i < str.length; i++) {
    if (parseInt(str[i]) !== parseInt(str[i-1]) - 1) {
      descending = false;
      break;
    }
  }

  return descending;
}

// ============================================================================
// Message Mapping Utilities
// ============================================================================

/**
 * Map conversation messages to Google AI Content format
 */
function mapMessages(messages: ConversationMessage[]): Content[] {
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      // System messages are prepended to the first user message or added as user message
      contents.push({
        role: 'user',
        parts: [{ text: `[System]: ${message.content}` }],
      });
    } else if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: message.content }],
      });
    } else if (message.role === 'assistant') {
      const parts: Part[] = [];

      if (message.content) {
        parts.push({ text: message.content });
      }

      // Add function calls if present
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const toolCall of message.toolCalls) {
          parts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.arguments as Record<string, unknown>,
            },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: 'model',
          parts,
        });
      }
    } else if (message.role === 'tool') {
      // Tool results are function responses
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: message.name,
            response: { result: message.content },
          },
        }],
      });
    }
  }

  return contents;
}

/**
 * Map tool definition to Google FunctionDeclaration format
 */
function mapTool(tool: ProviderToolDefinition): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters ? mapParametersSchema(tool.parameters) : undefined,
  };
}

/**
 * Map JSON Schema to Google's parameter schema format
 */
function mapParametersSchema(schema: JSONSchemaObject): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: 'object',
    properties: {},
    required: schema.required || [],
  };

  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      props[key] = mapPropertySchema(value);
    }
    result.properties = props;
  }

  return result;
}

/**
 * Map individual property schema
 */
function mapPropertySchema(prop: unknown): Record<string, unknown> {
  if (typeof prop !== 'object' || prop === null) {
    return { type: 'string' };
  }

  const schema = prop as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  if (schema.type) {
    result.type = schema.type;
  }

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.type === 'array' && schema.items) {
    result.items = mapPropertySchema(schema.items);
  }

  if (schema.type === 'object' && schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      (result.properties as Record<string, unknown>)[key] = mapPropertySchema(value);
    }
    if (schema.required) {
      result.required = schema.required;
    }
  }

  return result;
}

/**
 * Extract text content from Google AI response
 */
function extractTextFromResponse(response: GenerateContentResponse): string {
  if (!response.candidates || response.candidates.length === 0) {
    return '';
  }

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    return '';
  }

  return candidate.content.parts
    .filter((part: Part) => part.text)
    .map((part: Part) => part.text!)
    .join('');
}

/**
 * Extract tool calls from Google AI response
 */
function extractToolCalls(response: GenerateContentResponse): ToolCallRequest[] {
  if (!response.candidates || response.candidates.length === 0) {
    return [];
  }

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    return [];
  }

  const toolCalls: ToolCallRequest[] = [];

  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: part.functionCall.name ?? 'unknown',
        arguments: safeJSONParse<Record<string, unknown>>(
          JSON.stringify(part.functionCall.args || {}),
          { maxDepth: 10, maxProperties: 100 }
        ),
      });
    }
  }

  return toolCalls;
}

/**
 * Map Google usage metadata to standard ProviderUsage format
 */
function mapUsage(metadata: GenerateContentResponseUsageMetadata | undefined): ProviderUsage {
  if (!metadata) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  return {
    inputTokens: metadata.promptTokenCount || 0,
    outputTokens: metadata.candidatesTokenCount || 0,
    totalTokens: metadata.totalTokenCount || 0,
  };
}

/**
 * Enforce request size limits to prevent 413 errors
 */
function enforceRequestSizeLimit(messages: ConversationMessage[]): {
  messages: ConversationMessage[];
  truncated: boolean;
} {
  let totalChars = 0;
  const result: ConversationMessage[] = [];
  let truncated = false;

  for (const message of messages) {
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    const messageSize = content.length;

    if (totalChars + messageSize > REQUEST_CHAR_LIMIT) {
      truncated = true;
      // Try to include a truncated version
      const remainingChars = REQUEST_CHAR_LIMIT - totalChars;
      if (remainingChars > 1000) {
        result.push({
          ...message,
          content: content.substring(0, remainingChars) + '\n[Content truncated due to size limits]',
        } as ConversationMessage);
      }
      break;
    }

    totalChars += messageSize;
    result.push(message);
  }

  if (truncated) {
    logDebug(`[GoogleProvider] Request truncated from ${messages.length} to ${result.length} messages due to size limits`);
  }

  return { messages: result, truncated };
}

/**
 * Extract system instruction from messages
 */
function extractSystemInstruction(messages: ConversationMessage[]): { systemInstruction: string | undefined; filteredMessages: ConversationMessage[] } {
  const systemMessages: string[] = [];
  const filteredMessages: ConversationMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemMessages.push(message.content);
    } else {
      filteredMessages.push(message);
    }
  }

  return {
    systemInstruction: systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined,
    filteredMessages,
  };
}

// ============================================================================
// Provider Configuration
// ============================================================================

interface GoogleProviderOptions {
  apiKey: string;
  model: string;
  providerId?: ProviderId;
  /** Request timeout in milliseconds (default: 120000) */
  timeout?: number;
  /** Maximum retries for transient errors (default: 3) */
  maxRetries?: number;
  /** Optional temperature override */
  temperature?: number;
  /** Maximum completion tokens to request (default: 4096) */
  maxTokens?: number;
  /** Safety settings configuration */
  safetySettings?: Array<{
    category: HarmCategory;
    threshold: HarmBlockThreshold;
  }>;
}

// ============================================================================
// Google Provider Implementation
// ============================================================================

export class GoogleProvider implements LLMProvider {
  readonly id: ProviderId;
  readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly maxRetries: number;
  private readonly temperature?: number;
  private readonly maxTokens: number;
  private readonly safetySettings?: Array<{
    category: HarmCategory;
    threshold: HarmBlockThreshold;
  }>;

  constructor(options: GoogleProviderOptions) {
    // SECURITY: Validate and protect API key before use
    const validatedApiKey = validateAndProtectApiKey(options.apiKey);

    // SECURITY: Rate limiting check
    if (!globalRateLimiter.isAllowed('google-provider')) {
      throw new Error('Rate limit exceeded for Google provider. Please wait before making more requests.');
    }

    // SECURITY: Log security event
    securityLogger.logSecurityEvent({
      type: 'google_provider_initialized',
      command: 'constructor',
      success: true,
      timestamp: new Date(),
      details: {
        model: options.model,
        providerId: options.providerId,
        keyType: validateGoogleKeyFormat(validatedApiKey).keyType
      }
    });

    this.client = new GoogleGenAI({ apiKey: validatedApiKey });
    this.id = options.providerId ?? 'google';
    this.model = options.model;
    this.maxRetries = options.maxRetries ?? 3;
    this.temperature = typeof options.temperature === 'number' ? options.temperature : undefined;
    this.maxTokens = Math.max(1, options.maxTokens ?? 4096);
    this.safetySettings = options.safetySettings;
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   */
  private getBackoffDelay(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    // Add jitter to prevent thundering herd
    return delay + Math.random() * delay * 0.1;
  }

  /**
   * Execute request with retry logic for transient errors
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a recoverable error
        if (isRecoverableError(error) && attempt < this.maxRetries) {
          const delay = this.getBackoffDelay(attempt);
          // SECURITY: Sanitize error message to prevent token leakage
          logDebug(
            `[${this.id}] ${operationName} failed (attempt ${attempt + 1}/${this.maxRetries + 1}): ` +
            `${safeErrorMessage(lastError)}. Retrying in ${Math.round(delay)}ms...`
          );
          await this.sleep(delay);
          continue;
        }

        // Non-recoverable error or out of retries
        throw new GoogleProviderError(
          `${operationName} failed after ${attempt + 1} attempts: ${lastError.message}`,
          this.id,
          lastError,
          isRecoverableError(error)
        );
      }
    }

    // Should not reach here, but TypeScript needs this
    throw lastError!;
  }

  async generate(messages: ConversationMessage[], tools: ProviderToolDefinition[]): Promise<ProviderResponse> {
    const { messages: boundedMessages } = enforceRequestSizeLimit(messages);
    const { systemInstruction, filteredMessages } = extractSystemInstruction(boundedMessages);

    return this.executeWithRetry(async () => {
      const config: GenerateContentConfig = {
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
        systemInstruction: systemInstruction,
        safetySettings: this.safetySettings,
        tools: tools.length ? [{ functionDeclarations: tools.map(mapTool) }] as Tool[] : undefined,
      };

      const params: GenerateContentParameters = {
        model: this.model,
        contents: mapMessages(filteredMessages),
        config,
      };

      const response = await this.client.models.generateContent(params);

      // Extract content and tool calls
      const content = extractTextFromResponse(response);
      const toolCalls = extractToolCalls(response);
      const usage = mapUsage(response.usageMetadata);

      if (toolCalls.length > 0) {
        return {
          type: 'tool_calls',
          toolCalls,
          content,
          usage,
        };
      }

      return {
        type: 'message',
        content,
        usage,
      };
    }, 'generate');
  }

  async *generateStream(
    messages: ConversationMessage[],
    tools: ProviderToolDefinition[]
  ): AsyncIterableIterator<StreamChunk> {
    const { messages: boundedMessages } = enforceRequestSizeLimit(messages);
    const { systemInstruction, filteredMessages } = extractSystemInstruction(boundedMessages);

    const config: GenerateContentConfig = {
      temperature: this.temperature,
      maxOutputTokens: this.maxTokens,
      systemInstruction: systemInstruction,
      safetySettings: this.safetySettings,
      tools: tools.length ? [{ functionDeclarations: tools.map(mapTool) }] as Tool[] : undefined,
    };

    const params: GenerateContentParameters = {
      model: this.model,
      contents: mapMessages(filteredMessages),
      config,
    };

    const stream = await this.client.models.generateContentStream(params);

    for await (const chunk of stream) {
      if (chunk.candidates && chunk.candidates.length > 0) {
        const candidate = chunk.candidates[0];

        // Handle content updates
        if (candidate.content && candidate.content.parts) {
          const text = candidate.content.parts
            .filter((part: Part) => part.text)
            .map((part: Part) => part.text!)
            .join('');

          if (text) {
            yield {
              type: 'content',
              content: text,
            };
          }
        }

        // Handle function calls
        if (candidate.content?.parts?.some((part: Part) => part.functionCall)) {
          const functionCalls = candidate.content.parts
            .filter((part: Part) => part.functionCall)
            .map((part: Part) => part.functionCall!);

          for (const funcCall of functionCalls) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                name: funcCall.name ?? 'unknown',
                arguments: safeJSONParse<Record<string, unknown>>(JSON.stringify(funcCall.args || {}), {
                  maxDepth: 10,
                  maxProperties: 100
                }),
              },
            };
          }
        }
      }

      // Handle usage updates
      if (chunk.usageMetadata) {
        yield {
          type: 'usage',
          usage: mapUsage(chunk.usageMetadata),
        };
      }
    }

    yield { type: 'done' };
  }

  private cachedModelInfo: ProviderModelInfo | null = null;

  async getModelInfo(): Promise<ProviderModelInfo | null> {
    if (this.cachedModelInfo) {
      return this.cachedModelInfo;
    }

    try {
      // Google Gemini models have known context windows
      // gemini-1.5-pro: 1M tokens, gemini-1.0-pro: 32K tokens, etc.
      const modelContextWindows: Record<string, number> = {
        'gemini-1.5-pro': 1000000,
        'gemini-1.5-pro-latest': 1000000,
        'gemini-1.5-flash': 1000000,
        'gemini-1.5-flash-latest': 1000000,
        'gemini-2.0-flash': 1000000,
        'gemini-2.0-flash-exp': 1000000,
        'gemini-1.0-pro': 32768,
        'gemini-1.0-pro-latest': 32768,
        'gemini-pro': 32768,
        'gemini-pro-vision': 16384,
      };

      const contextWindow = modelContextWindows[this.model] || 32768;
      const maxOutputTokens = this.model.includes('1.5') || this.model.includes('2.0') ? 8192 : 2048;

      this.cachedModelInfo = {
        id: this.model,
        contextWindow,
        maxOutputTokens,
        inputTokenLimit: contextWindow,
        outputTokenLimit: maxOutputTokens,
      };

      return this.cachedModelInfo;
    } catch (error) {
      logDebug(`Failed to get model info for ${this.model}: ${safeErrorMessage(error)}`);
      return null;
    }
  }

  async getModels(): Promise<ProviderModelInfo[]> {
    // Return known Gemini models
    return [
      { id: 'gemini-2.0-flash', contextWindow: 1000000, maxOutputTokens: 8192 },
      { id: 'gemini-2.0-flash-exp', contextWindow: 1000000, maxOutputTokens: 8192 },
      { id: 'gemini-1.5-pro', contextWindow: 1000000, maxOutputTokens: 8192 },
      { id: 'gemini-1.5-flash', contextWindow: 1000000, maxOutputTokens: 8192 },
      { id: 'gemini-1.0-pro', contextWindow: 32768, maxOutputTokens: 2048 },
    ];
  }
}

// ============================================================================
// Factory Registration
// ============================================================================

import { registerProvider, type ProviderConfig } from './providerFactory.js';

/**
 * Create a Google provider instance from configuration
 */
export function createGoogleProvider(config: ProviderConfig): LLMProvider {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Google API key not found. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable.'
    );
  }

  return new GoogleProvider({
    apiKey,
    model: config.model,
    providerId: config.provider,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });
}

// Register the Google provider
registerProvider('google', createGoogleProvider);
registerProvider('gemini', createGoogleProvider);
