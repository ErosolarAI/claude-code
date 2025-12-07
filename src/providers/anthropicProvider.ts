import Anthropic from '@anthropic-ai/sdk';
import { APIError, RateLimitError } from '@anthropic-ai/sdk/error.js';
import type { MessageParam, Tool, ToolResultBlockParam, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages.js';
import type {
  ConversationMessage,
  LLMProvider,
  ProviderModelInfo,
  ProviderResponse,
  ProviderToolDefinition,
  ProviderUsage,
  StopReason,
  StreamChunk,
  ToolCallRequest,
  ThinkingBudgetConfig,
} from '../core/types.js';
import { sanitizeErrorMessage, safeErrorMessage } from '../core/secretStore.js';
import { logDebug } from '../utils/debugLogger.js';

// ============================================================================
// Error Recovery Constants
// ============================================================================

const TRANSIENT_ERROR_PATTERNS = [
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
  '500',
  '502',
  '503',
  '504',
  'overloaded',
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const errorName = error.name?.toLowerCase() ?? '';
  const errorCode = (error as { code?: string }).code?.toLowerCase() ?? '';
  const allText = `${message} ${errorName} ${errorCode}`;

  // Check for transient patterns
  if (TRANSIENT_ERROR_PATTERNS.some(pattern => allText.includes(pattern))) {
    return true;
  }

  // Check for 5xx status codes
  if (error instanceof APIError) {
    const status = error.status;
    if (status && status >= 500 && status < 600) {
      return true;
    }
    // Anthropic overloaded error
    if (status === 529) {
      return true;
    }
  }

  return false;
}

interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  rateLimitMaxRetries?: number;
  rateLimitInitialDelayMs?: number;
  enablePromptCaching?: boolean;
  /** Maximum retries for transient errors (default: 3) */
  transientMaxRetries?: number;
  /** Extended thinking configuration for reasoning models */
  thinking?: ThinkingBudgetConfig;
}

const DEFAULT_RATE_LIMIT_RETRIES = 4;
const DEFAULT_RATE_LIMIT_INITIAL_DELAY_MS = 1500;
const MIN_RATE_LIMIT_DELAY_MS = 750;
const MAX_RATE_LIMIT_DELAY_MS = 40_000;
const DEFAULT_TRANSIENT_RETRIES = 3;

/**
 * Check if a model supports extended thinking
 * Claude 4, Sonnet 4.5, Sonnet 3.7, Haiku 4.5, and Opus models support extended thinking
 */
function supportsExtendedThinking(model: string): boolean {
  const lowerModel = model.toLowerCase();
  return (
    lowerModel.includes('claude-4') ||
    lowerModel.includes('claude-sonnet-4') ||
    lowerModel.includes('claude-opus-4') ||
    lowerModel.includes('claude-haiku-4') ||
    lowerModel.includes('sonnet-4') ||
    lowerModel.includes('opus-4') ||
    lowerModel.includes('haiku-4') ||
    lowerModel.includes('3.7') ||
    lowerModel.includes('3-7')
  );
}

export class AnthropicMessagesProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly rateLimitMaxRetries: number;
  private readonly rateLimitInitialDelayMs: number;
  private readonly enablePromptCaching: boolean;
  // Reserved for future transient error retry logic
  private readonly _transientMaxRetries: number;
  private readonly thinking?: ThinkingBudgetConfig;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
    // Default to 16K output tokens to handle extended thinking and code generation
    this.maxTokens = options.maxTokens ?? 16384;
    this.temperature = options.temperature ?? 0;
    this.rateLimitMaxRetries = Math.max(0, options.rateLimitMaxRetries ?? DEFAULT_RATE_LIMIT_RETRIES);
    this.rateLimitInitialDelayMs = Math.max(
      MIN_RATE_LIMIT_DELAY_MS,
      options.rateLimitInitialDelayMs ?? DEFAULT_RATE_LIMIT_INITIAL_DELAY_MS
    );
    this.enablePromptCaching = options.enablePromptCaching ?? true;
    this._transientMaxRetries = options.transientMaxRetries ?? DEFAULT_TRANSIENT_RETRIES;
    // Only enable thinking for models that support it
    this.thinking = supportsExtendedThinking(options.model) ? options.thinking : undefined;
  }

  async generate(messages: ConversationMessage[], tools: ProviderToolDefinition[]): Promise<ProviderResponse> {
    const { system, chat } = convertConversation(messages, this.enablePromptCaching);

    // Build request with optional extended thinking
    const requestParams: Parameters<typeof this.client.messages.create>[0] = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: chat,
      ...(system ? { system } : {}),
      ...(tools.length ? { tools: tools.map(mapTool) } : {}),
    };

    // Add extended thinking configuration if enabled
    if (this.thinking?.enabled) {
      const budgetTokens = this.thinking.budgetTokens ?? 10000;
      // Extended thinking requires temperature 1 and budget >= 1024
      (requestParams as unknown as Record<string, unknown>)['thinking'] = {
        type: 'enabled',
        budget_tokens: Math.max(1024, budgetTokens),
      };
      requestParams.temperature = 1; // Required for extended thinking
    }

    const response = await this.executeWithRateLimitRetries(() =>
      this.client.messages.create(requestParams)
    );

    // Type guard for non-streaming response
    if (!('usage' in response)) {
      throw new Error('Unexpected streaming response from non-streaming request');
    }

    const usage = mapUsage(response.usage);
    const stopReason = mapStopReason(response.stop_reason);

    const toolCalls = response.content
      .filter((block): block is ToolUseBlock => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        name: block.name,
        arguments: toRecord(block.input),
      }));

    const textContent = response.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        toolCalls,
        content: textContent,
        usage,
        stopReason,
      };
    }

    return {
      type: 'message',
      content: textContent,
      usage,
      stopReason,
    };
  }

  async *generateStream(messages: ConversationMessage[], tools: ProviderToolDefinition[]): AsyncIterableIterator<StreamChunk> {
    const { system, chat } = convertConversation(messages, this.enablePromptCaching);

    // Build stream request with optional extended thinking
    const streamParams: Parameters<typeof this.client.messages.stream>[0] = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: chat,
      ...(system ? { system } : {}),
      ...(tools.length ? { tools: tools.map(mapTool) } : {}),
    };

    // Add extended thinking configuration if enabled
    if (this.thinking?.enabled) {
      const budgetTokens = this.thinking.budgetTokens ?? 10000;
      // Extended thinking requires temperature 1 and budget >= 1024
      (streamParams as unknown as Record<string, unknown>)['thinking'] = {
        type: 'enabled',
        budget_tokens: Math.max(1024, budgetTokens),
      };
      streamParams.temperature = 1; // Required for extended thinking
    }

    const stream = this.client.messages.stream(streamParams);

    let currentToolCall: Partial<ToolCallRequest> | null = null;
    let currentToolCallInput = '';
    let toolCallId = '';

    for await (const event of stream) {
      // Handle different event types
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        const blockType = block.type as string;
        if (blockType === 'tool_use' && 'id' in block && 'name' in block) {
          toolCallId = block.id;
          currentToolCall = {
            id: block.id,
            name: block.name,
            arguments: {},
          };
          currentToolCallInput = '';
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta;
        const deltaType = delta.type as string;
        if (deltaType === 'text_delta' && 'text' in delta) {
          yield {
            type: 'content',
            content: (delta as { text: string }).text,
          };
        } else if (deltaType === 'thinking_delta') {
          // Stream thinking content as reasoning chunks
          const thinkingDelta = delta as { thinking?: string };
          if (thinkingDelta.thinking) {
            yield {
              type: 'reasoning',
              content: thinkingDelta.thinking,
            };
          }
        } else if (deltaType === 'input_json_delta' && currentToolCall) {
          // accumulate tool input JSON fragments
          const jsonDelta = delta as { partial_json?: string };
          if (typeof jsonDelta.partial_json === 'string' && jsonDelta.partial_json) {
            currentToolCallInput += jsonDelta.partial_json;
          }
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolCall && toolCallId) {
          if (currentToolCallInput.trim()) {
            try {
              currentToolCall.arguments = toRecord(JSON.parse(currentToolCallInput));
            } catch {
              currentToolCall.arguments = {};
            }
          }
          yield {
            type: 'tool_call',
            toolCall: currentToolCall as ToolCallRequest,
          };
          currentToolCall = null;
          currentToolCallInput = '';
          toolCallId = '';
        }
      } else if (event.type === 'message_stop') {
        const finalMessage = await stream.finalMessage();
        const usage = mapUsage(finalMessage.usage);
        const stopReason = mapStopReason(finalMessage.stop_reason);
        if (usage) {
          yield {
            type: 'usage',
            usage,
          };
        }
        yield {
          type: 'done',
          stopReason,
        };
      }
    }
  }

  getCapabilities() {
    return {
      streaming: true,
      toolCalling: true,
      vision: this.model.includes('sonnet') || this.model.includes('opus'),
      functionCalling: true,
      maxTokens: this.maxTokens,
      supportedModalities: ['text', 'image'] as ('text' | 'image' | 'audio')[],
      contextWindow: this.cachedModelInfo?.contextWindow,
    };
  }

  private cachedModelInfo: ProviderModelInfo | null = null;

  /**
   * Fetch model info from Anthropic API
   * Returns context window and token limits from the real API
   */
  async getModelInfo(): Promise<ProviderModelInfo | null> {
    if (this.cachedModelInfo) {
      return this.cachedModelInfo;
    }

    try {
      // Use the Anthropic models API to get real model info
      // The models API is accessed via client.models.retrieve()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = this.client as any;
      if (typeof client.models?.retrieve !== 'function') {
        // SDK version doesn't support models API
        return null;
      }

      const modelInfo = await client.models.retrieve(this.model);

      if (modelInfo) {
        // Extract context window from model info
        // Anthropic returns input_context_length or context_window for context window
        const rawInfo = modelInfo as Record<string, unknown>;
        const contextWindow =
          rawInfo['input_context_length'] as number | undefined ??
          rawInfo['context_window'] as number | undefined;

        const maxOutputTokens =
          rawInfo['max_output_tokens'] as number | undefined ??
          rawInfo['output_token_limit'] as number | undefined;

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
      // Models API may not be available for all accounts/models
      // Fall through to return null
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('404') && !message.includes('not found')) {
        // Log unexpected errors but don't fail
        logDebug(`Failed to fetch model info for ${this.model}:`, message);
      }
    }

    return null;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private getBackoffDelay(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return delay + Math.random() * delay * 0.1;
  }

  private async executeWithRateLimitRetries<T>(operation: () => Promise<T>): Promise<T> {
    let rateLimitRetries = 0;
    let transientRetries = 0;
    let delayMs = this.rateLimitInitialDelayMs;

    // Retry until success or retry limits reached.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await operation();
      } catch (error) {
        // Handle rate limit errors
        if (isRateLimitError(error)) {
          if (rateLimitRetries >= this.rateLimitMaxRetries) {
            throw buildRateLimitFailureError(error, rateLimitRetries);
          }
          const waitMs = determineRetryDelay(error.headers, delayMs);
          // SECURITY: Don't log error details that might contain tokens
          logDebug(
            `[anthropic] Rate limited (attempt ${rateLimitRetries + 1}/${this.rateLimitMaxRetries + 1}). ` +
            `Retrying in ${Math.round(waitMs)}ms...`
          );
          await sleep(waitMs);
          rateLimitRetries += 1;
          delayMs = Math.min(delayMs * 2, MAX_RATE_LIMIT_DELAY_MS);
          continue;
        }

        // Handle transient errors (network, stream, etc.)
        if (isTransientError(error)) {
          if (transientRetries >= this._transientMaxRetries) {
            // SECURITY: Sanitize error message before including in new error
            throw new Error(
              `Transient error after ${transientRetries + 1} attempts: ${safeErrorMessage(error)}`,
              { cause: error }
            );
          }
          const waitMs = this.getBackoffDelay(transientRetries);
          // SECURITY: Sanitize error message to prevent token leakage
          logDebug(
            `[anthropic] Transient error (attempt ${transientRetries + 1}/${this._transientMaxRetries + 1}): ` +
            `${safeErrorMessage(error)}. Retrying in ${Math.round(waitMs)}ms...`
          );
          await sleep(waitMs);
          transientRetries += 1;
          continue;
        }

        // Non-retryable error
        throw error;
      }
    }
  }
}

/**
 * Validate and sanitize message sequence to ensure tool messages have preceding tool_calls.
 * Anthropic API requires tool_result blocks to reference preceding tool_use blocks.
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
        logDebug(`[AnthropicProvider] Skipping orphaned tool message (no preceding tool_use): ${toolCallId?.slice(0, 20) || 'no-id'}`);
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

function convertConversation(
  messages: ConversationMessage[],
  enablePromptCaching = false
): { system: string | null; chat: MessageParam[] } {
  // CRITICAL: Sanitize message sequence to prevent orphaned tool_result blocks
  const sanitizedMessages = sanitizeMessageSequence(messages);

  const systemPrompts: string[] = [];
  const chat: MessageParam[] = [];

  for (const message of sanitizedMessages) {
    switch (message.role) {
      case 'system': {
        systemPrompts.push(message.content);
        break;
      }
      case 'user': {
        chat.push({
          role: 'user',
          content: [{ type: 'text', text: message.content }],
        });
        break;
      }
      case 'assistant': {
        const contentBlocks: MessageParam['content'] = [];
        if (message.content.trim().length > 0) {
          contentBlocks.push({ type: 'text', text: message.content });
        }
        for (const call of message.toolCalls ?? []) {
          contentBlocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.arguments,
          });
        }
        chat.push({
          role: 'assistant',
          content: contentBlocks.length ? contentBlocks : [{ type: 'text', text: '' }],
        });
        break;
      }
      case 'tool': {
        const block: ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: [{ type: 'text', text: message.content }],
        };
        chat.push({
          role: 'user',
          content: [block],
        });
        break;
      }
      default:
        break;
    }
  }

  // Add cache control breakpoints to optimize costs
  // Cache the first few user messages (usually contain system context)
  if (enablePromptCaching && chat.length > 2) {
    const cacheBreakpoint = Math.min(2, chat.length - 1);
    for (let i = 0; i < cacheBreakpoint; i++) {
      const message = chat[i];
      if (message && message.role === 'user' && Array.isArray(message.content)) {
        const lastContent = message.content[message.content.length - 1];
        if (lastContent && 'text' in lastContent) {
          (lastContent as unknown as Record<string, unknown>)['cache_control'] = { type: 'ephemeral' };
        }
      }
    }
  }

  return {
    system: systemPrompts.length ? systemPrompts.join('\n\n') : null,
    chat,
  };
}

function mapTool(definition: ProviderToolDefinition): Tool {
  return {
    name: definition.name,
    description: definition.description,
    input_schema: (definition.parameters ?? {
      type: 'object',
      properties: {},
    }) as Tool['input_schema'],
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

function mapUsage(usage?: { input_tokens?: number; output_tokens?: number } | null): ProviderUsage | null {
  if (!usage) {
    return null;
  }
  const total = typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number'
    ? usage.input_tokens + usage.output_tokens
    : undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: total,
  };
}

/**
 * Map Anthropic's stop_reason to our StopReason type
 * Critical for agentic loop control - determines if model wants to continue
 */
function mapStopReason(stopReason: string | null | undefined): StopReason | undefined {
  if (!stopReason) return undefined;
  switch (stopReason) {
    case 'end_turn':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'stop_sequence':
      return 'stop_sequence';
    default:
      return undefined;
  }
}

function isRateLimitError(error: unknown): error is APIError {
  if (error instanceof RateLimitError) {
    return true;
  }
  if (error instanceof APIError && error.status === 429) {
    return true;
  }
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 429;
}

function determineRetryDelay(headers: HeadersLike, fallbackMs: number): number {
  const retryAfter = parseRetryAfterHeader(headers);
  if (retryAfter !== null) {
    return clamp(retryAfter, MIN_RATE_LIMIT_DELAY_MS, MAX_RATE_LIMIT_DELAY_MS);
  }
  const jitter = fallbackMs * 0.25;
  const randomized = fallbackMs + (Math.random() * (2 * jitter) - jitter);
  return clamp(Math.round(randomized), MIN_RATE_LIMIT_DELAY_MS, MAX_RATE_LIMIT_DELAY_MS);
}

function parseRetryAfterHeader(headers: HeadersLike): number | null {
  if (!headers || typeof headers.get !== 'function') {
    return null;
  }
  const retryAfter = headers.get('retry-after');
  if (!retryAfter) {
    return null;
  }
  const numeric = Number(retryAfter);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric * 1000;
  }
  const parsedDate = Date.parse(retryAfter);
  if (Number.isFinite(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

function buildRateLimitFailureError(error: APIError, retries: number): Error {
  const baseMessage =
    'Anthropic rejected the request because the per-minute token rate limit was exceeded.';
  const retryDetails =
    retries > 0 ? ` Waited and retried ${retries} time${retries === 1 ? '' : 's'} without success.` : '';
  const advisory =
    ' Reduce the prompt size or wait for usage to reset before trying again. ' +
    'See https://docs.claude.com/en/api/rate-limits for quota guidance.';
  // SECURITY: Sanitize original error message to prevent token leakage
  const original = error.message ? `\nOriginal message: ${sanitizeErrorMessage(error.message)}` : '';
  return new Error(`${baseMessage}${retryDetails}${advisory}${original}`, {
    cause: error,
  });
}

type HeadersLike = {
  get?: (header: string) => string | null | undefined;
} | null | undefined;
