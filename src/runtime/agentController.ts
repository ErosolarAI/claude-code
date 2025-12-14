import type { ProfileName } from '../config.js';
import type { AgentSession, ModelSelection } from './agentSession.js';
import type { UniversalRuntime } from './universal.js';
import { createNodeRuntime, type NodeRuntimeOptions } from './node.js';
import type { CapabilityModule } from './agentHost.js';
import type { AgentCallbacks, AssistantMessageMetadata, EditExplanationPayload } from '../core/agent.js';
import type { ToolRuntimeObserver, ToolSuite } from '../core/toolRuntime.js';
import type { ConversationMessage, ProviderUsage, ProviderId } from '../core/types.js';
import type {
  AgentEventUnion,
  CapabilityManifest,
  IAgentController,
  ModelConfig,
  ToolCapability,
} from '../contracts/v1/agent.js';
import { AGENT_CONTRACT_VERSION } from '../contracts/v1/agent.js';
import { logDebug } from '../utils/debugLogger.js';
import { isFallbackEligibleError, getFallbackReason } from '../providers/resilientProvider.js';
import { getConfiguredProviders, getLatestModelForProvider } from '../core/modelDiscovery.js';

interface EventSinkRef {
  current: EventStream<AgentEventUnion> | null;
}

class EventStream<T> implements AsyncIterableIterator<T> {
  private readonly queue: T[] = [];
  private pending: { resolve: (value: IteratorResult<T>) => void; reject: (error: unknown) => void } | null = null;
  private closed = false;
  private failure: Error | null = null;

  push(value: T): void {
    if (this.closed || this.failure) {
      return;
    }
    if (this.pending) {
      this.pending.resolve({ value, done: false });
      this.pending = null;
      return;
    }
    this.queue.push(value);
  }

  close(): void {
    if (this.closed || this.failure) {
      return;
    }
    this.closed = true;
    if (this.pending) {
      this.pending.resolve({ value: undefined as unknown as T, done: true });
      this.pending = null;
    }
  }

  fail(error: Error): void {
    if (this.closed || this.failure) {
      return;
    }
    this.failure = error;
    if (this.pending) {
      this.pending.reject(error);
      this.pending = null;
    }
  }

  next(): Promise<IteratorResult<T>> {
    if (this.queue.length) {
      const value = this.queue.shift()!;
      return Promise.resolve({ value, done: false });
    }
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      return Promise.reject(error);
    }
    if (this.closed) {
      return Promise.resolve({ value: undefined as unknown as T, done: true });
    }
    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ value: undefined as unknown as T, done: true });
  }

  throw(error: unknown): Promise<IteratorResult<T>> {
    const err = error instanceof Error ? error : new Error(String(error));
    this.fail(err);
    return Promise.reject(err);
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }
}

function mergeToolObservers(
  primary: ToolRuntimeObserver,
  secondary?: ToolRuntimeObserver
): ToolRuntimeObserver {
  if (!secondary) {
    return primary;
  }
  return {
    onToolStart(call) {
      primary.onToolStart?.(call);
      secondary.onToolStart?.(call);
    },
    onToolResult(call, output) {
      primary.onToolResult?.(call, output);
      secondary.onToolResult?.(call, output);
    },
    onToolProgress(call, progress) {
      primary.onToolProgress?.(call, progress);
      secondary.onToolProgress?.(call, progress);
    },
    onToolError(call, error) {
      primary.onToolError?.(call, error);
      secondary.onToolError?.(call, error);
    },
    onCacheHit(call) {
      primary.onCacheHit?.(call);
      secondary.onCacheHit?.(call);
    },
    onToolWarning(call, warning) {
      primary.onToolWarning?.(call, warning);
      secondary.onToolWarning?.(call, warning);
    },
  } satisfies ToolRuntimeObserver;
}

function createControllerToolObserver(ref: EventSinkRef): ToolRuntimeObserver {
  const emit = (event: AgentEventUnion) => {
    ref.current?.push(event);
  };
  const timestamp = () => Date.now();
  return {
    onToolStart(call) {
      emit({
        type: 'tool.start',
        timestamp: timestamp(),
        toolName: call.name,
        toolCallId: call.id,
        parameters: { ...call.arguments },
      });
    },
    onToolResult(call, output) {
      emit({
        type: 'tool.complete',
        timestamp: timestamp(),
        toolName: call.name,
        toolCallId: call.id,
        result: output,
      });
    },
    onToolError(call, error) {
      emit({
        type: 'tool.error',
        timestamp: timestamp(),
        toolName: call.name,
        toolCallId: call.id,
        error,
      });
    },
  } satisfies ToolRuntimeObserver;
}

interface AgentControllerDependencies {
  runtime: UniversalRuntime;
  sinkRef: EventSinkRef;
  externalCallbacks?: AgentCallbacks;
}

export interface AgentControllerCreateOptions extends Omit<NodeRuntimeOptions, 'toolObserver'> {
  profile: ProfileName;
  workspaceContext: string | null;
  workingDir: string;
  modules?: CapabilityModule[];
  callbacks?: AgentCallbacks;
  /** Skip provider discovery for faster startup (used in quick mode) */
  skipProviderDiscovery?: boolean;
}

export async function createAgentController(
  options: AgentControllerCreateOptions,
  additionalObserver?: ToolRuntimeObserver
): Promise<AgentController> {
  const sinkRef: EventSinkRef = { current: null };
  const observer = createControllerToolObserver(sinkRef);
  const runtime = await createNodeRuntime({
    profile: options.profile,
    workspaceContext: options.workspaceContext,
    workingDir: options.workingDir,
    env: options.env,
    toolObserver: mergeToolObservers(observer, additionalObserver),
    additionalModules: options.modules,
  });
  return new AgentController({ runtime, sinkRef, externalCallbacks: options.callbacks });
}

export class AgentController implements IAgentController {
  private readonly session: AgentSession;
  private readonly sinkRef: EventSinkRef;
  private readonly externalCallbacks: AgentCallbacks | undefined;
  private activeSink: EventStream<AgentEventUnion> | null = null;
  private agent: ReturnType<AgentSession['createAgent']> | null = null;
  private cachedHistory: ConversationMessage[] = [];
  private selection: ModelSelection;
  /** Set of providers that have failed with non-retryable errors in this session */
  private failedProviders: Set<ProviderId> = new Set();
  /** Tracks whether any meaningful stream content has been emitted for the current run */
  private hasStreamedContent = false;
  /** Maximum fallback attempts per send() call */
  private static readonly MAX_FALLBACK_ATTEMPTS = 3;
  /** Optional timeout for a single agent run (ms); 0 disables */
  private readonly runTimeoutMs: number =
    Number.parseInt(process.env.AGI_AGENT_RUN_TIMEOUT_MS ?? '', 10) || 0;
  /** Cancel hook for an in-flight run */
  private cancelActiveRunFn: (() => void) | null = null;

  constructor(dependencies: AgentControllerDependencies) {
    this.session = dependencies.runtime.session;
    this.sinkRef = dependencies.sinkRef;
    this.externalCallbacks = dependencies.externalCallbacks;
    this.selection = this.buildInitialSelection();
  }

  private buildInitialSelection(): ModelSelection {
    const config = this.session.profileConfig;
    return {
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      systemPrompt: config.systemPrompt,
    } satisfies ModelSelection;
  }

  private ensureAgent(): ReturnType<AgentSession['createAgent']> {
    if (this.agent) {
      return this.agent;
    }
    const agent = this.session.createAgent(this.selection, this.createAgentCallbacks(), undefined, {
      explainEdits: true,
    });
    if (this.cachedHistory.length) {
      agent.loadHistory(this.cachedHistory);
    }
    this.agent = agent;
    return agent;
  }

  private createAgentCallbacks(): AgentCallbacks {
    return {
      onAssistantMessage: (content, metadata) => {
        this.handleAssistantMessage(content, metadata);
        this.externalCallbacks?.onAssistantMessage?.(content, metadata);
      },
      onStreamChunk: (chunk, type) => {
        logDebug(`[DEBUG controller] onStreamChunk: type=${type}, chunk length=${chunk?.length || 0}, preview="${chunk?.slice(0, 80)}"`);
        if (type === 'content') {
          // Content chunks go to message.delta for streaming display
          logDebug(`[DEBUG controller] Calling emitDelta with content type`);
          this.emitDelta(chunk, false);
        } else if (type === 'reasoning') {
          // Reasoning chunks go to reasoning event for thought display
          logDebug(`[DEBUG controller] Calling emitReasoning with reasoning type`);
          this.emitReasoning(chunk);
        }
        // Pass all chunks to external callbacks
        this.externalCallbacks?.onStreamChunk?.(chunk, type);
      },
      onUsage: (usage) => {
        this.emitUsage(usage);
        this.externalCallbacks?.onUsage?.(usage);
      },
      onContextPruned: (removedCount, stats) => {
        this.externalCallbacks?.onContextPruned?.(removedCount, stats);
      },
      onContextSquishing: (message) => {
        this.externalCallbacks?.onContextSquishing?.(message);
      },
      onContextRecovery: (attempt, maxAttempts, message) => {
        this.externalCallbacks?.onContextRecovery?.(attempt, maxAttempts, message);
      },
      onContinueAfterRecovery: () => {
        this.externalCallbacks?.onContinueAfterRecovery?.();
      },
      onMultilinePaste: (summary, metadata) => {
        this.externalCallbacks?.onMultilinePaste?.(summary, metadata);
      },
      onEditExplanation: (payload) => {
        this.handleEditExplanation(payload);
        this.externalCallbacks?.onEditExplanation?.(payload);
      },
      onRetrying: (attempt, maxAttempts, error) => {
        // Emit delta event to show retry status
        this.emitDelta(`[Retrying ${attempt}/${maxAttempts}: ${error.message}]`, false);
        this.externalCallbacks?.onRetrying?.(attempt, maxAttempts, error);
      },
      // onBeforeFirstToolCall not needed - model's reasoning is now emitted as thought events
    } satisfies AgentCallbacks;
  }

  /**
   * Check if content looks like garbage/leaked reasoning fragments.
   * Returns true if the content should be filtered out.
   */
  private isGarbageContent(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) return true;

    // Single or repeated punctuation/markdown artifacts
    if (/^[)\]}>*`'".:,!?|│┃─━═\s]+$/.test(trimmed)) return true;

    // Just newlines or whitespace
    if (/^[\s\n\r]+$/.test(trimmed)) return true;

    // Short fragments with high punctuation ratio (likely leaked formatting)
    // Use Unicode-aware letter/number detection to support non-Latin languages
    if (trimmed.length < 15) {
      // Count Unicode letters and digits (supports Chinese, Japanese, Arabic, etc.)
      const wordCharCount = (trimmed.match(/[\p{L}\p{N}]/gu) || []).length;
      if (wordCharCount === 0) return true;
      if (wordCharCount / trimmed.length < 0.2) return true;
    }

    return false;
  }

  private emitDelta(content: string, isFinal: boolean): void {
    logDebug(`[DEBUG controller] emitDelta called: content="${content?.slice(0, 50)}", isFinal=${isFinal}, hasSink=${!!this.activeSink}`);
    // Allow empty-ish content through for streaming - punctuation like "," or "." is valid
    // Only skip completely empty/null content
    if (content == null || content === '') {
      logDebug('[DEBUG controller] emitDelta: skipping null/empty content');
      return;
    }

    // Guard against leading garbage-only chunks when no content has been streamed yet.
    // Models like deepseek-reasoner can emit stray punctuation before the real reply.
    if (!this.hasStreamedContent) {
      const trimmed = content.trim();
      const hasWordChar = /[\p{L}\p{N}]/u.test(trimmed);
      const isTinyPunctuation = trimmed.length > 0 && trimmed.length <= 3 && !hasWordChar;
      if (!trimmed || isTinyPunctuation) {
        logDebug('[DEBUG controller] emitDelta: skipping leading trivial chunk');
        return;
      }
    }

    // IMPORTANT: Don't filter garbage during streaming except for the leading trivial chunk above.
    // Filtering during streaming can remove legitimate punctuation. Apply garbage filter only for
    // final content or large chunks.
    if (isFinal || content.length > 20) {
      if (this.isGarbageContent(content)) {
        logDebug('[DEBUG controller] emitDelta: filtering garbage content');
        return;
      }
    }

    // Mark that we've emitted meaningful stream content
    this.hasStreamedContent = true;

    logDebug('[DEBUG controller] emitDelta: pushing to sink');
    this.activeSink?.push({
      type: 'message.delta',
      timestamp: Date.now(),
      content,
      isFinal,
    });
  }

  private emitError(message: string): void {
    this.activeSink?.push({
      type: 'error',
      timestamp: Date.now(),
      error: message,
    });
  }

  private emitReasoning(content: string): void {
    if (!content?.trim()) {
      return;
    }
    // Filter out garbage/leaked formatting fragments in reasoning too
    if (this.isGarbageContent(content)) {
      return;
    }
    this.activeSink?.push({
      type: 'reasoning',
      timestamp: Date.now(),
      content,
    });
  }

  private emitUsage(usage: ProviderUsage | null | undefined): void {
    if (!usage) {
      return;
    }
    this.activeSink?.push({
      type: 'usage',
      timestamp: Date.now(),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });
  }

  private handleEditExplanation(payload: EditExplanationPayload): void {
    if (!this.activeSink) {
      return;
    }
    if (!payload.explanation?.trim()) {
      return;
    }
    this.activeSink.push({
      type: 'edit.explanation',
      timestamp: Date.now(),
      content: payload.explanation,
      files: payload.files,
      toolName: payload.toolName,
      toolCallId: payload.toolCallId,
    });
  }

  private handleAssistantMessage(content: string, metadata: AssistantMessageMetadata): void {
    if (!this.activeSink) {
      return;
    }
    if (metadata.suppressDisplay) {
      return;
    }
    // For non-final messages, require content to emit delta
    if (!metadata.isFinal) {
      if (!content.trim()) {
        return;
      }
      this.emitDelta(content, false);
      return;
    }
    // For final messages, always emit message.complete so interactiveShell can run fallback logic
    // even if content is empty (reasoning-only models like deepseek-reasoner)
    const elapsedMs = metadata.elapsedMs ?? 0;
    this.activeSink.push({
      type: 'message.complete',
      timestamp: Date.now(),
      content: content || '', // Ensure content is at least empty string, not undefined
      elapsedMs,
    });
    this.emitUsage(metadata.usage ?? null);
  }

  private updateCachedHistory(): void {
    if (this.agent) {
      this.cachedHistory = this.agent.getHistory();
    }
  }

  private createSink(): EventStream<AgentEventUnion> {
    const sink = new EventStream<AgentEventUnion>();
    this.activeSink = sink;
    this.sinkRef.current = sink;
    return sink;
  }

  private clearSink(): void {
    if (this.activeSink) {
      this.activeSink = null;
      this.sinkRef.current = null;
    }
  }

  private startAgentRun(
    agent: ReturnType<AgentSession['createAgent']>,
    message: string,
    sink: EventStream<AgentEventUnion>
  ): Promise<void> {
    // Reset streaming state for this run
    this.hasStreamedContent = false;
    sink.push({ type: 'message.start', timestamp: Date.now() });
    const runPromise = agent.send(message, true);

    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise =
      this.runTimeoutMs > 0
        ? new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error(`Agent run timed out after ${this.runTimeoutMs}ms`));
            }, this.runTimeoutMs);
            timer.unref?.();
          })
        : null;

    let cancelled = false;
    const cancelPromise = new Promise<never>((_, reject) => {
      this.cancelActiveRunFn = () => {
        cancelled = true;
        reject(new Error('Agent run cancelled'));
      };
    });

    return Promise.race([runPromise, cancelPromise, timeoutPromise].filter(Boolean) as Promise<unknown>[])
      .then(() => {
        this.updateCachedHistory();
        sink.close();
      })
      .catch((error) => {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        // Let caller decide on fallback; propagate error after marking sink failed
        if (cancelled) {
          sink.fail(errorObj);
        } else {
          sink.fail(errorObj);
        }
        throw errorObj;
      })
      .finally(() => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        this.cancelActiveRunFn = null;
        if (this.sinkRef.current === sink) {
          this.clearSink();
        }
      });
  }

  private async attemptFallbackWithError(errorObj: Error, attempts: number): Promise<boolean> {
    if (!isFallbackEligibleError(errorObj)) return false;
    if (attempts >= AgentController.MAX_FALLBACK_ATTEMPTS) return false;
    logDebug(`[AgentController] Fallback-eligible error detected: ${errorObj.message}`);
    return this.attemptFallback(errorObj);
  }

  async *send(message: string): AsyncIterableIterator<AgentEventUnion> {
    if (this.activeSink) {
      throw new Error('Agent runtime is already processing a message. Please wait for the current run to finish.');
    }
    let cancelledByUser = false;

    // Reset failed providers at the start of each new message
    // (providers might have recovered, quotas might have reset, etc.)
    this.failedProviders.clear();

    let fallbackAttempts = 0;

    // Retry loop for fallback handling
    while (fallbackAttempts < AgentController.MAX_FALLBACK_ATTEMPTS) {
      const agent = this.ensureAgent();
      const sink = this.createSink();
      let caughtError: Error | null = null;
      let fallbackSucceeded = false;

      const run = this.startAgentRun(agent, message, sink).catch((error) => {
        caughtError = error instanceof Error ? error : new Error(String(error));
        if (/cancelled/i.test(caughtError.message)) {
          cancelledByUser = true;
        }
      });

      try {
        for await (const event of sink) {
          yield event;
        }
      } finally {
        await run;
      }

      // Decide on fallback after run completion
      if (caughtError) {
        if (cancelledByUser) {
          this.emitError(caughtError.message);
          break;
        }
        fallbackSucceeded = await this.attemptFallbackWithError(caughtError, fallbackAttempts + 1);
        if (!fallbackSucceeded) {
          this.emitError(caughtError.message);
          break;
        }
        fallbackAttempts++;
        logDebug(
          `[AgentController] Retrying with fallback provider (attempt ${fallbackAttempts}/${AgentController.MAX_FALLBACK_ATTEMPTS})`
        );
        continue;
      }

      // Successful run, exit loop
      break;
    }
  }

  /**
   * Cancel an in-flight agent run, if any. This triggers a controlled failure on the stream.
   */
  cancel(reason = 'Cancelled by user'): void {
    if (!this.activeSink) return;
    this.cancelActiveRunFn?.();
    this.activeSink.fail(new Error(reason));
    this.clearSink();
  }

  async switchModel(config: ModelConfig): Promise<void> {
    this.updateCachedHistory();
    this.agent = null;
    this.selection = {
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      systemPrompt: this.selection.systemPrompt,
    } satisfies ModelSelection;
    this.session.updateToolContext(this.selection);
  }

  getCapabilities(): CapabilityManifest {
    const tools = this.session.toolRuntime.listProviderTools();
    const manifestTools: ToolCapability[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: 'general',
    }));
    return {
      contractVersion: AGENT_CONTRACT_VERSION,
      profile: this.session.profile,
      model: this.toModelConfig(this.selection),
      tools: manifestTools,
      features: ['streaming', 'tool-calls'],
    } satisfies CapabilityManifest;
  }

  registerToolSuite(suiteId: string, suite: ToolSuite): void {
    this.session.toolRuntime.registerSuite({ ...suite, id: suiteId });
  }

  unregisterToolSuite(suiteId: string): void {
    this.session.toolRuntime.unregisterSuite(suiteId);
  }

  getHistory(): ConversationMessage[] {
    if (this.agent) {
      return this.agent.getHistory();
    }
    return [...this.cachedHistory];
  }

  clearHistory(): void {
    this.cachedHistory = [];
    this.agent?.clearHistory();
  }

  private toModelConfig(selection: ModelSelection): ModelConfig {
    return {
      provider: selection.provider,
      model: selection.model,
      temperature: selection.temperature,
      maxTokens: selection.maxTokens,
    } satisfies ModelConfig;
  }

  /**
   * Find the next available provider for fallback.
   * Excludes providers that have already failed in this session.
   */
  private findFallbackProvider(): { provider: ProviderId; model: string } | null {
    const configured = getConfiguredProviders();
    const currentProvider = this.selection.provider;

    // Provider preference order (excluding current and failed)
    const preferenceOrder: ProviderId[] = ['xai', 'anthropic', 'openai', 'google', 'deepseek', 'ollama'];

    for (const providerId of preferenceOrder) {
      // Skip current provider and already failed providers
      if (providerId === currentProvider || this.failedProviders.has(providerId)) {
        continue;
      }

      // Check if this provider is configured
      const provider = configured.find(p => p.id === providerId);
      if (provider) {
        const model = getLatestModelForProvider(providerId);
        if (model) {
          return { provider: providerId, model };
        }
      }
    }

    return null;
  }

  /**
   * Emit a provider fallback event
   */
  private emitFallbackEvent(
    fromProvider: string,
    fromModel: string,
    toProvider: string,
    toModel: string,
    reason: string,
    error: string
  ): void {
    this.activeSink?.push({
      type: 'provider.fallback',
      timestamp: Date.now(),
      fromProvider,
      fromModel,
      toProvider,
      toModel,
      reason,
      error,
    });
  }

  /**
   * Attempt to switch to a fallback provider
   */
  private async attemptFallback(error: Error): Promise<boolean> {
    const fallback = this.findFallbackProvider();
    if (!fallback) {
      logDebug('[AgentController] No fallback provider available');
      return false;
    }

    const reason = getFallbackReason(error);
    const fromProvider = this.selection.provider;
    const fromModel = this.selection.model;

    // Mark current provider as failed
    this.failedProviders.add(fromProvider);

    // Emit fallback event
    this.emitFallbackEvent(
      fromProvider,
      fromModel,
      fallback.provider,
      fallback.model,
      reason,
      error.message
    );

    logDebug(`[AgentController] Falling back from ${fromProvider}/${fromModel} to ${fallback.provider}/${fallback.model}: ${reason}`);

    // Switch to fallback provider
    await this.switchModel({
      provider: fallback.provider,
      model: fallback.model,
    });

    return true;
  }

  getToolSuites(): ToolSuite[] {
    return this.session.toolSuites;
  }
}
