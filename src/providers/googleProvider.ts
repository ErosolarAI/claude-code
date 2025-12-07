import {
  GoogleGenAI,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GenerateContentResponseUsageMetadata,
  type Tool,
  type FunctionCall,
} from '@google/genai';
import type {
  AssistantMessage,
  ConversationMessage,
  LLMProvider,
  ProviderId,
  ProviderModelInfo,
  ProviderResponse,
  ProviderToolDefinition,
  ProviderUsage,
  ToolCallRequest,
  ToolMessage,
  StreamChunk,
  ThinkingBudgetConfig,
  ThinkingLevel,
} from '../core/types.js';
import { logDebug } from '../utils/debugLogger.js';

// ============================================================================
// Error Recovery Constants
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
  'rate limit',
  '429',
  '500',
  '502',
  '503',
  '504',
] as const;

function isRecoverableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const errorName = error.name?.toLowerCase() ?? '';
  const allText = `${message} ${errorName}`;
  return RECOVERABLE_ERROR_PATTERNS.some(pattern => allText.includes(pattern));
}

interface GoogleGenAIProviderOptions {
  apiKey: string;
  model: string;
  providerId?: ProviderId;
  temperature?: number;
  maxOutputTokens?: number;
  /** Maximum retries for transient errors (default: 3) */
  maxRetries?: number;
  /** Request timeout in milliseconds (default: 120000) */
  timeout?: number;
  /** Thinking configuration for Gemini 2.5/3 models */
  thinking?: ThinkingBudgetConfig;
  /** Thinking level for Gemini 3 Pro (low/medium/high) */
  thinkingLevel?: ThinkingLevel;
}

/**
 * Check if a model supports thinking features
 * Gemini 2.5 and 3 series models support thinking
 */
function supportsThinking(model: string): boolean {
  const lowerModel = model.toLowerCase();
  return (
    lowerModel.includes('gemini-2.5') ||
    lowerModel.includes('gemini-3') ||
    lowerModel.includes('2.5-pro') ||
    lowerModel.includes('2.5-flash') ||
    lowerModel.includes('3-pro')
  );
}

/**
 * Check if a model is Gemini 3 Pro (supports thinkingLevel)
 */
function isGemini3Pro(model: string): boolean {
  const lowerModel = model.toLowerCase();
  return lowerModel.includes('gemini-3') && lowerModel.includes('pro');
}

export class GoogleGenAIProvider implements LLMProvider {
  readonly id: ProviderId;
  readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly temperature?: number;
  private readonly maxOutputTokens?: number;
  private readonly maxRetries: number;
  private readonly thinking?: ThinkingBudgetConfig;
  private readonly thinkingLevel?: ThinkingLevel;

  constructor(options: GoogleGenAIProviderOptions) {
    this.client = new GoogleGenAI({
      apiKey: options.apiKey,
    });
    this.id = options.providerId ?? 'google';
    this.model = options.model;
    this.temperature = options.temperature;
    this.maxOutputTokens = options.maxOutputTokens;
    this.maxRetries = options.maxRetries ?? 3;
    // Only enable thinking for models that support it
    this.thinking = supportsThinking(options.model) ? options.thinking : undefined;
    this.thinkingLevel = isGemini3Pro(options.model) ? options.thinkingLevel : undefined;
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private getBackoffDelay(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
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

        if (isRecoverableError(error) && attempt < this.maxRetries) {
          const delay = this.getBackoffDelay(attempt);
          logDebug(
            `[${this.id}] ${operationName} failed (attempt ${attempt + 1}/${this.maxRetries + 1}): ` +
            `${lastError.message}. Retrying in ${Math.round(delay)}ms...`
          );
          await this.sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  async generate(messages: ConversationMessage[], tools: ProviderToolDefinition[]): Promise<ProviderResponse> {
    return this.executeWithRetry(async () => {
      const { contents, systemInstruction } = mapConversation(messages);
      const config: GenerateContentConfig = {};

      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      if (typeof this.temperature === 'number') {
        config.temperature = this.temperature;
      }
      if (typeof this.maxOutputTokens === 'number') {
        config.maxOutputTokens = this.maxOutputTokens;
      }

      const mappedTools = mapTools(tools);
      if (mappedTools.length > 0) {
        config.tools = mappedTools;
      }

      // Add thinking configuration for Gemini 2.5/3 models
      if (this.thinking?.enabled || this.thinkingLevel) {
        const thinkingConfig: Record<string, unknown> = {
          includeThoughts: true,
        };

        // Set thinking budget for 2.5 models
        if (this.thinking?.budgetTokens !== undefined) {
          thinkingConfig['thinkingBudget'] = this.thinking.budgetTokens;
        } else if (this.thinking?.enabled) {
          // Default to dynamic thinking (-1) if enabled without specific budget
          thinkingConfig['thinkingBudget'] = -1;
        }

        // Set thinking level for Gemini 3 Pro
        if (this.thinkingLevel) {
          thinkingConfig['thinkingLevel'] = this.thinkingLevel;
        }

        (config as Record<string, unknown>)['thinkingConfig'] = thinkingConfig;
      }

      const response = await this.client.models.generateContent({
        model: this.model,
        contents: contents.length ? contents : createEmptyUserContent(),
        config: Object.keys(config).length ? config : undefined,
      });

      const usage = mapUsage(response.usageMetadata);

      // Safely extract tool calls with error recovery
      let toolCalls: ToolCallRequest[] = [];
      try {
        toolCalls = mapFunctionCalls(response.functionCalls ?? []);
      } catch (parseError) {
        logDebug(
          `[${this.id}] Failed to parse function calls, recovering: ` +
          `${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
      }

      // Extract text content manually to avoid SDK warning when function calls are present
      // The SDK's response.text getter logs a warning when there are non-text parts
      const content = extractTextFromResponse(response);

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

  /**
   * Stream generation with thinking support for Gemini 2.5/3 models
   * Streams both content and thinking/reasoning chunks
   */
  async *generateStream(
    messages: ConversationMessage[],
    tools: ProviderToolDefinition[]
  ): AsyncIterableIterator<StreamChunk> {
    const { contents, systemInstruction } = mapConversation(messages);
    const config: GenerateContentConfig = {};

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (typeof this.temperature === 'number') {
      config.temperature = this.temperature;
    }
    if (typeof this.maxOutputTokens === 'number') {
      config.maxOutputTokens = this.maxOutputTokens;
    }

    const mappedTools = mapTools(tools);
    if (mappedTools.length > 0) {
      config.tools = mappedTools;
    }

    // Add thinking configuration for Gemini 2.5/3 models
    if (this.thinking?.enabled || this.thinkingLevel) {
      const thinkingConfig: Record<string, unknown> = {
        includeThoughts: true,
      };

      if (this.thinking?.budgetTokens !== undefined) {
        thinkingConfig['thinkingBudget'] = this.thinking.budgetTokens;
      } else if (this.thinking?.enabled) {
        thinkingConfig['thinkingBudget'] = -1;
      }

      if (this.thinkingLevel) {
        thinkingConfig['thinkingLevel'] = this.thinkingLevel;
      }

      (config as Record<string, unknown>)['thinkingConfig'] = thinkingConfig;
    }

    // Use generateContentStream for streaming
    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents: contents.length ? contents : createEmptyUserContent(),
      config: Object.keys(config).length ? config : undefined,
    });

    // Track accumulated function calls
    const pendingFunctionCalls: FunctionCall[] = [];

    for await (const chunk of stream) {
      // Process candidates and their parts
      const candidates = chunk.candidates;
      if (!candidates || candidates.length === 0) continue;

      const content = candidates[0]?.content;
      if (!content?.parts) continue;

      for (const part of content.parts) {
        // Handle thought/reasoning parts
        if ('thought' in part && part.thought === true && 'text' in part) {
          yield {
            type: 'reasoning',
            content: (part as { text: string }).text,
          };
        }
        // Handle regular text parts
        else if ('text' in part && typeof part.text === 'string') {
          // Only yield if it's not a thought part (checked above)
          if (!('thought' in part) || part.thought !== true) {
            yield {
              type: 'content',
              content: part.text,
            };
          }
        }
        // Handle function calls
        else if ('functionCall' in part && part.functionCall) {
          const fc = part.functionCall as FunctionCall;
          pendingFunctionCalls.push(fc);
        }
      }

      // Check for finish reason to emit tool calls and usage
      const finishReason = candidates[0]?.finishReason;
      if (finishReason) {
        // Emit accumulated function calls
        for (const fc of pendingFunctionCalls) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: fc.id || fc.name || 'function_call',
              name: fc.name ?? 'function_call',
              arguments: toRecord(fc.args),
            },
          };
        }

        // Emit usage if available
        if (chunk.usageMetadata) {
          const usage = mapUsage(chunk.usageMetadata);
          if (usage) {
            yield { type: 'usage', usage };
          }
        }

        yield { type: 'done' };
      }
    }
  }

  private cachedModelInfo: ProviderModelInfo | null = null;

  /**
   * Fetch model info from Google Gemini API
   * Returns context window and token limits from the real API
   */
  async getModelInfo(): Promise<ProviderModelInfo | null> {
    if (this.cachedModelInfo) {
      return this.cachedModelInfo;
    }

    try {
      // Use the Gemini models API to get real model info
      // The model name needs to be prefixed with "models/" for the API
      const modelName = this.model.startsWith('models/') ? this.model : `models/${this.model}`;
      const modelInfo = await this.client.models.get({ model: modelName });

      if (modelInfo) {
        // Gemini API returns inputTokenLimit and outputTokenLimit
        const contextWindow = modelInfo.inputTokenLimit;
        const maxOutputTokens = modelInfo.outputTokenLimit;

        if (contextWindow) {
          this.cachedModelInfo = {
            id: this.model,
            contextWindow,
            maxOutputTokens,
            inputTokenLimit: contextWindow,
            outputTokenLimit: maxOutputTokens,
          };
          return this.cachedModelInfo;
        }
      }
    } catch (error) {
      // Models API may not be available for all models
      // Fall through to return null
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('404') && !message.includes('not found')) {
        // Log unexpected errors but don't fail
        logDebug(`Failed to fetch model info for ${this.model}:`, message);
      }
    }

    return null;
  }
}

/**
 * Validate and sanitize message sequence to ensure tool messages have preceding tool_calls.
 * Gemini API also requires function responses to follow function calls.
 */
function sanitizeMessageSequence(messages: ConversationMessage[]): ConversationMessage[] {
  const sanitized: ConversationMessage[] = [];
  const pendingToolCallIds = new Set<string>();

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      // Track tool call IDs that need responses
      for (const tc of message.toolCalls) {
        if (tc.id) pendingToolCallIds.add(tc.id);
      }
      sanitized.push(message);
    } else if (message.role === 'tool') {
      // Only include tool messages if we have a pending tool call for them
      const toolCallId = message.toolCallId;
      if (toolCallId && pendingToolCallIds.has(toolCallId)) {
        pendingToolCallIds.delete(toolCallId);
        sanitized.push(message);
      } else {
        // ORPHANED TOOL MESSAGE - skip it to prevent API error
        logDebug(`[GoogleProvider] Skipping orphaned tool message (no preceding tool_call): ${toolCallId?.slice(0, 20) || 'no-id'}`);
      }
    } else {
      // system, user, assistant without tool_calls - pass through
      if (message.role === 'user') {
        pendingToolCallIds.clear();
      }
      sanitized.push(message);
    }
  }

  return sanitized;
}

function mapConversation(messages: ConversationMessage[]): { contents: Content[]; systemInstruction?: string } {
  // CRITICAL: Sanitize message sequence to prevent orphaned tool messages
  const sanitizedMessages = sanitizeMessageSequence(messages);

  const contents: Content[] = [];
  const systemPrompts: string[] = [];

  for (const message of sanitizedMessages) {
    switch (message.role) {
      case 'system': {
        if (message.content.trim()) {
          systemPrompts.push(message.content.trim());
        }
        break;
      }
      case 'user': {
        contents.push({
          role: 'user',
          parts: [{ text: message.content }],
        });
        break;
      }
      case 'assistant': {
        contents.push(mapAssistantMessage(message));
        break;
      }
      case 'tool': {
        const content = mapToolMessage(message);
        if (content) {
          contents.push(content);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    contents,
    systemInstruction: systemPrompts.length ? systemPrompts.join('\n\n') : undefined,
  };
}

function mapAssistantMessage(message: AssistantMessage): Content {
  const parts: NonNullable<Content['parts']> = [];
  const text = message.content.trim();
  if (text) {
    parts.push({ text });
  }

  for (const call of message.toolCalls ?? []) {
    parts.push({
      functionCall: {
        id: call.id || undefined,
        name: call.name,
        args: toRecord(call.arguments),
      },
    });
  }

  return {
    role: 'model',
    parts: parts.length ? parts : [{ text: '' }],
  };
}

function mapToolMessage(message: ToolMessage): Content | null {
  if (!message.toolCallId) {
    return null;
  }

  return {
    role: 'user',
    parts: [
      {
        functionResponse: {
          id: message.toolCallId,
          name: message.name,
          response: parseToolResponse(message.content),
        },
      },
    ],
  };
}

function parseToolResponse(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  if (!trimmed) {
    return { output: '' };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Non-JSON content; fall back to raw output.
  }

  return { output: content };
}

function mapFunctionCalls(calls: FunctionCall[]): ToolCallRequest[] {
  return calls
    .filter((call) => Boolean(call.name))
    .map((call) => ({
      id: call.id || call.name || 'function_call',
      name: call.name ?? 'function_call',
      arguments: toRecord(call.args),
    }));
}

function createEmptyUserContent(): Content[] {
  return [
    {
      role: 'user',
      parts: [{ text: '' }],
    },
  ];
}

function mapTools(tools: ProviderToolDefinition[]): Tool[] {
  if (!tools.length) {
    return [];
  }

  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parameters ?? { type: 'object', properties: {} },
      })),
    },
  ];
}

function mapUsage(metadata?: GenerateContentResponseUsageMetadata | null): ProviderUsage | null {
  if (!metadata) {
    return null;
  }
  return {
    inputTokens: metadata.promptTokenCount ?? undefined,
    outputTokens: metadata.candidatesTokenCount ?? undefined,
    totalTokens: metadata.totalTokenCount ?? undefined,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (isPlainRecord(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      return isPlainRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract text content from response without using the SDK's text getter.
 * This avoids the SDK warning "there are non-text parts functionCall in the response"
 * which is logged when accessing response.text and the response contains function calls.
 */
function extractTextFromResponse(response: GenerateContentResponse): string {
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    return '';
  }

  const content = candidates[0]?.content;
  if (!content?.parts) {
    return '';
  }

  // Extract only text parts, ignoring function calls and other part types
  const textParts = content.parts
    .filter((part): part is { text: string } => 'text' in part && typeof part.text === 'string')
    .map(part => part.text);

  return textParts.join('').trim();
}
