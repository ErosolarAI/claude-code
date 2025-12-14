import OpenAI from 'openai';
import type {
  FunctionTool,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseOutputRefusal,
  Response,
  Tool,
} from 'openai/resources/responses/responses.js';
import type {
  ConversationMessage,
  LLMProvider,
  ProviderId,
  ProviderResponse,
  ProviderToolDefinition,
  ToolCallRequest,
  ProviderUsage,
  ReasoningEffortLevel,
  TextVerbosityLevel,
  StreamChunk,
} from '../core/types.js';
import { logDebug } from '../utils/debugLogger.js';

const REQUEST_CHAR_LIMIT = 800_000; // Hard cap to avoid provider 413 errors

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
  const errorCode = (error as { code?: string }).code?.toLowerCase() ?? '';
  const allText = `${message} ${errorName} ${errorCode}`;
  return RECOVERABLE_ERROR_PATTERNS.some(pattern => allText.includes(pattern));
}

// Stream event types for OpenAI Responses API
interface ResponseStreamEvent {
  type: string;
  delta?: string;
  call_id?: string;
  name?: string;
  response?: Response;
  // Extended types for reasoning content
  item?: {
    id?: string;
    type?: string;
    call_id?: string;
    name?: string;
    status?: string;
  };
  item_id?: string;
  // Reasoning summary for GPT-5 models
  summary?: Array<{
    type: string;
    text?: string;
  }>;
}

interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  providerId?: ProviderId;
  baseURL?: string;
  reasoningEffort?: ReasoningEffortLevel;
  textVerbosity?: TextVerbosityLevel;
  /** Maximum retries for transient errors (default: 3) */
  maxRetries?: number;
  /** Request timeout in milliseconds (default: 120000) */
  timeout?: number;
  /** Optional temperature override */
  temperature?: number;
  /** Maximum completion tokens to request (default: 4096 to avoid runaway outputs) */
  maxTokens?: number;
}

type ResponsesCreateParams = Parameters<OpenAI['responses']['create']>[0];
type EnhancedResponsesCreateParams = ResponsesCreateParams & {
  reasoning?: { effort: ReasoningEffortLevel };
  text?: { verbosity: TextVerbosityLevel };
  parallel_tool_calls?: boolean;
  max_output_tokens?: number;
  temperature?: number;
};
type ResponsesCreateResult = Awaited<ReturnType<OpenAI['responses']['create']>>;

/**
 * Check if a model supports reasoning parameters.
 * Only GPT-5.x models support the reasoning effort parameter.
 */
function supportsReasoningParam(model: string): boolean {
  const lowerModel = model.toLowerCase();
  // Only GPT-5 and GPT-5.1 models support reasoning parameters
  return lowerModel.includes('gpt-5');
}

export class OpenAIResponsesProvider implements LLMProvider {
  readonly id: ProviderId;
  readonly model: string;
  private readonly client: OpenAI;
  private readonly reasoningEffort?: ReasoningEffortLevel;
  private readonly textVerbosity?: TextVerbosityLevel;
  private readonly maxRetries: number;
  private readonly temperature?: number;
  private readonly maxTokens: number;

  constructor(options: OpenAIProviderOptions) {
    const clientConfig: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey: options.apiKey,
      timeout: options.timeout ?? 120000,
      maxRetries: 0, // We handle retries ourselves
    };

    if (options.baseURL) {
      clientConfig.baseURL = options.baseURL;
    }

    this.client = new OpenAI(clientConfig);
    this.id = options.providerId ?? 'openai';
    this.model = options.model;
    // Only set reasoningEffort for models that support it
    this.reasoningEffort = supportsReasoningParam(options.model) ? options.reasoningEffort : undefined;
    this.textVerbosity = options.textVerbosity;
    this.maxRetries = options.maxRetries ?? 3;
    this.temperature = typeof options.temperature === 'number' ? options.temperature : undefined;
    this.maxTokens = Math.max(1, options.maxTokens ?? 4096);
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
    const { messages: boundedMessages } = enforceRequestSizeLimit(messages);

    return this.executeWithRetry(async () => {
      const request: EnhancedResponsesCreateParams = {
        model: this.model,
        input: mapMessages(boundedMessages),
        tools: tools.length ? tools.map(mapTool) : undefined,
      // Enable parallel tool calls for better efficiency
      parallel_tool_calls: tools.length ? true : undefined,
      // Force the model to actually emit tool calls instead of only narrating them
      tool_choice: tools.length ? 'auto' : undefined,
      stream: false,
      temperature: this.temperature,
      max_output_tokens: this.maxTokens,
    };

    if (this.reasoningEffort) {
      request.reasoning = { effort: this.reasoningEffort };
    }
    if (this.textVerbosity) {
      request.text = { verbosity: this.textVerbosity };
    }

    let response: ResponsesCreateResult;
    try {
      response = await this.client.responses.create(request);
    } catch (error) {
      this.handleProviderError(error);
    }
    assertHasOutput(response);

      // Safely extract tool calls with error recovery
      let toolCalls: ToolCallRequest[] = [];
      try {
        toolCalls = response.output.filter(isFunctionCall).map(mapToolCall);
      } catch (parseError) {
        logDebug(
          `[${this.id}] Failed to parse tool calls, recovering: ` +
          `${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
      }

      const usage = mapUsage(response.usage);
      if (toolCalls.length > 0) {
        return {
          type: 'tool_calls',
          toolCalls,
          content: extractTextContent(response),
          usage,
        };
      }

      return {
        type: 'message',
        content: extractTextContent(response),
        usage,
      };
    }, 'generate');
  }

  async *generateStream(
    messages: ConversationMessage[],
    tools: ProviderToolDefinition[]
  ): AsyncIterableIterator<StreamChunk> {
    const { messages: boundedMessages } = enforceRequestSizeLimit(messages);

    const request: EnhancedResponsesCreateParams = {
      model: this.model,
      input: mapMessages(boundedMessages),
      tools: tools.length ? tools.map(mapTool) : undefined,
      // Enable parallel tool calls for better efficiency
      parallel_tool_calls: tools.length ? true : undefined,
      // Force the model to emit tool calls when tools are provided
      tool_choice: tools.length ? 'auto' : undefined,
      stream: true,
      temperature: this.temperature,
      max_output_tokens: this.maxTokens,
    };

    if (this.reasoningEffort) {
      request.reasoning = { effort: this.reasoningEffort };
    }
    if (this.textVerbosity) {
      request.text = { verbosity: this.textVerbosity };
    }

    let stream: AsyncIterable<ResponseStreamEvent>;
    try {
      stream = await this.client.responses.create(request) as AsyncIterable<ResponseStreamEvent>;
    } catch (error) {
      this.handleProviderError(error);
    }

    // Track function calls by item_id -> { call_id, name, arguments }
    const functionCallsById = new Map<string, { callId: string; name: string; arguments: string }>();

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'response.output_text.delta':
            if (event.delta) {
              yield { type: 'content', content: event.delta };
            }
            break;

          // Handle reasoning content for GPT-5 models
          // GPT-5 uses summarized thinking with 'reasoning' type items
          case 'response.reasoning_summary_text.delta':
            if (event.delta) {
              yield { type: 'reasoning', content: event.delta };
            }
            break;

          // Handle reasoning item completion with summary
          case 'response.output_item.done': {
            const item = event.item;
            if (item?.type === 'reasoning' && event.summary) {
              // Extract text from summary array
              for (const summaryItem of event.summary) {
                if (summaryItem.type === 'summary_text' && summaryItem.text) {
                  yield { type: 'reasoning', content: summaryItem.text };
                }
              }
            }
            break;
          }

          // Capture function call metadata when it's added
          case 'response.output_item.added': {
            const item = event.item;
            if (item?.type === 'function_call' && item.id) {
              functionCallsById.set(item.id, {
                callId: item.call_id ?? item.id,
                name: item.name ?? '',
                arguments: '',
              });
            }
            break;
          }

          case 'response.function_call_arguments.delta': {
            const itemId = event.item_id;
            if (itemId) {
              const existing = functionCallsById.get(itemId);
              if (existing) {
                existing.arguments += event.delta ?? '';
              }
            }
            break;
          }

          case 'response.function_call_arguments.done': {
            const itemId = event.item_id;
            if (itemId) {
              const pending = functionCallsById.get(itemId);
              if (pending) {
                let parsed: Record<string, unknown> = {};
                try {
                  parsed = JSON.parse(pending.arguments || '{}');
                } catch {
                  parsed = {};
                }
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: pending.callId,
                    name: pending.name,
                    arguments: parsed,
                  },
                };
                functionCallsById.delete(itemId);
              }
            }
            break;
          }

          case 'response.done':
          case 'response.completed':
            if (event.response?.usage) {
              const usage = mapUsage(event.response.usage);
              if (usage) {
                yield { type: 'usage', usage };
              }
            }
            yield { type: 'done' };
            break;
        }
      }
    } catch (error) {
      this.handleProviderError(error);
    }
  }

  private handleProviderError(error: unknown): never {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
}

/**
 * Enforce a hard request size limit to prevent provider 413 errors.
 * Drops the oldest non-system messages until the serialized size is under limit.
 */
function enforceRequestSizeLimit(messages: ConversationMessage[]): { messages: ConversationMessage[]; truncated: boolean } {
  let truncated = false;
  const trimmed = [...messages];
  let size = estimateMessageChars(trimmed);

  while (size > REQUEST_CHAR_LIMIT && trimmed.length > 1) {
    // Remove the oldest non-system message; if only systems remain, drop the second message
    const removeIdx = trimmed.findIndex(msg => msg.role !== 'system');
    const idx = removeIdx === -1 ? 1 : removeIdx;
    trimmed.splice(idx, 1);
    truncated = true;
    size = estimateMessageChars(trimmed);
  }

  if (truncated) {
    trimmed.unshift({
      role: 'system',
      content: '[Context trimmed to fit request size limit. Earlier turns were dropped to avoid provider rejection.]',
    });
  }

  return { messages: trimmed, truncated };
}

function estimateMessageChars(messages: ConversationMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<unknown>) {
        if (typeof part === 'string') {
          total += part.length;
        } else if (part && typeof part === 'object' && 'text' in (part as Record<string, unknown>)) {
          const text = (part as { text?: string }).text ?? '';
          total += typeof text === 'string' ? text.length : String(text).length;
        } else {
          total += JSON.stringify(part ?? '').length;
        }
      }
    } else if (msg.content != null) {
      total += JSON.stringify(msg.content).length;
    }

    const toolCalls = (msg as { toolCalls?: Array<{ name?: string; arguments?: unknown }> }).toolCalls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        total += (call.name?.length ?? 0);
        try {
          total += JSON.stringify(call.arguments ?? {}).length;
        } catch {
          total += 100; // Fallback small cost
        }
      }
    }
  }
  return total;
}

function mapMessages(messages: ConversationMessage[]): ResponseInput {
  const input: ResponseInput = [];
  for (const message of messages) {
    switch (message.role) {
      case 'system':
      case 'user':
      case 'assistant': {
        input.push({
          role: message.role,
          content: message.content,
          type: 'message',
        });
        if (message.role === 'assistant') {
          for (const call of message.toolCalls ?? []) {
            input.push({
              type: 'function_call',
              call_id: call.id,
              name: call.name,
              arguments: JSON.stringify(call.arguments ?? {}),
            });
          }
        }
        break;
      }
      case 'tool': {
        input.push({
          type: 'function_call_output',
          call_id: message.toolCallId,
          output: message.content,
        });
        break;
      }
      default:
        break;
    }
  }
  return input;
}

function mapTool(definition: ProviderToolDefinition): Tool {
  return {
    type: 'function',
    name: definition.name,
    description: definition.description,
    parameters: (definition.parameters ?? {
      type: 'object',
      properties: {},
    }) as FunctionTool['parameters'],
    strict: false,
  };
}

function extractTextContent(response: Response): string {
  const primary = collectOutputText(response.output);
  if (primary) {
    return primary;
  }

  const aggregated = typeof response.output_text === 'string' ? response.output_text.trim() : '';
  if (aggregated) {
    return aggregated;
  }

  const refusal = collectRefusalText(response.output);
  if (refusal) {
    return refusal;
  }

  return '';
}

function collectOutputText(output: ResponseOutputItem[]): string {
  const chunks: string[] = [];
  for (const item of output) {
    if (!isOutputMessage(item)) {
      continue;
    }
    for (const block of item.content) {
      if (block.type === 'output_text') {
        chunks.push(block.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function collectRefusalText(output: ResponseOutputItem[]): string {
  for (const item of output) {
    if (!isOutputMessage(item)) {
      continue;
    }
    for (const block of item.content) {
      if (isRefusal(block) && block.refusal?.trim()) {
        return block.refusal.trim();
      }
    }
  }
  return '';
}

function mapToolCall(call: ResponseFunctionToolCall): ToolCallRequest {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(call.arguments ?? '{}');
  } catch {
    parsed = {};
  }

  return {
    id: call.call_id ?? call.id ?? '',
    name: call.name,
    arguments: parsed,
  };
}

function mapUsage(usage?: Response['usage'] | null): ProviderUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

function isFunctionCall(item: ResponseOutputItem): item is ResponseFunctionToolCall {
  return item.type === 'function_call';
}

function isOutputMessage(item: ResponseOutputItem): item is ResponseOutputMessage {
  return item.type === 'message';
}

function isRefusal(block: ResponseOutputMessage['content'][number]): block is ResponseOutputRefusal {
  return block.type === 'refusal';
}

function assertHasOutput(response: ResponsesCreateResult): asserts response is Response {
  if (!('output' in response)) {
    throw new Error('Streaming responses are not supported in this runtime.');
  }
}
