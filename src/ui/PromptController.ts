/**
 * PromptController - minimal wrapper around UnifiedUIRenderer for coding agent UX.
 * Handles input wiring and status/meta updates without any of the legacy scroll-region plumbing.
 */

import { UnifiedUIRenderer, type CommandSuggestion } from './UnifiedUIRenderer.js';

export type EditGuardMode = 'display-edits' | 'require-approval' | 'block-writes' | 'ask-permission' | 'plan';

export interface PromptCallbacks {
  onSubmit: (text: string) => void;
  onQueue: (text: string) => void;
  onInterrupt: () => void;
  onExit?: () => void;
  onCtrlC?: (info: { hadBuffer: boolean }) => void;
  onResume?: () => void;
  onChange?: (event: { text: string; cursor: number }) => void;
  onEditModeChange?: (mode: EditGuardMode) => void;
  onToggleVerify?: () => void;
  onToggleAutoContinue?: () => void;
  onToggleThinking?: () => void;
  onClearContext?: () => void;
  onToggleCriticalApproval?: () => void;
  onExpandToolResult?: () => void;
  onToggleDualRl?: () => void;
}

export class PromptController {
  private readonly renderer: UnifiedUIRenderer;
  private readonly callbacks: PromptCallbacks;
  private editMode: EditGuardMode = 'display-edits';
  private statusMain: string | null = null;
  private statusOverride: string | null = null;
  private statusStreaming: string | null = null;
  private started = false;
  private disposed = false;
  // Store bound handlers for cleanup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private boundHandlers: Map<string, (...args: any[]) => void> = new Map();

  constructor(
    inStream: NodeJS.ReadStream,
    outStream: NodeJS.WriteStream,
    callbacks: PromptCallbacks,
    existingRenderer?: UnifiedUIRenderer
  ) {
    this.callbacks = callbacks;
    this.renderer = existingRenderer ?? new UnifiedUIRenderer(outStream, inStream);

    // Create bound handlers that can be removed later
    this.addBoundHandler('submit', (text: string) => this.callbacks.onSubmit(text));
    this.addBoundHandler('queue', (text: string) => this.callbacks.onQueue(text));
    this.addBoundHandler('interrupt', () => this.callbacks.onInterrupt());
    this.addBoundHandler('ctrlc', (info: { hadBuffer: boolean }) => this.callbacks.onCtrlC?.(info));
    this.addBoundHandler('exit', () => this.callbacks.onExit?.());
    this.addBoundHandler('change', (payload: { text: string; cursor: number }) => {
      this.callbacks.onChange?.(payload);
    });
    this.addBoundHandler('resume', () => this.callbacks.onResume?.());
    this.addBoundHandler('toggle-critical-approval', () => this.callbacks.onToggleCriticalApproval?.());
    this.addBoundHandler('expand-tool-result', () => {
      const expanded = this.renderer.expandLastToolResult();
      if (!expanded) {
        this.setStatusMessage('No tool result to expand');
        setTimeout(() => this.setStatusMessage(null), 2000);
      }
      this.callbacks.onExpandToolResult?.();
    });
    this.addBoundHandler('toggle-auto-continue', () => this.callbacks.onToggleAutoContinue?.());
    this.addBoundHandler('toggle-dual-rl', () => this.callbacks.onToggleDualRl?.());
    this.addBoundHandler('toggle-verify', () => this.callbacks.onToggleVerify?.());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private addBoundHandler(event: string, handler: (...args: any[]) => void): void {
    this.boundHandlers.set(event, handler);
    this.renderer.on(event, handler);
  }

  private removeAllBoundHandlers(): void {
    for (const [event, handler] of this.boundHandlers) {
      this.renderer.removeListener(event, handler);
    }
    this.boundHandlers.clear();
  }

  getRenderer(): UnifiedUIRenderer {
    return this.renderer;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.renderer.initialize();
  }

  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Remove all event listeners before cleanup to prevent memory leaks
    this.removeAllBoundHandlers();
    this.renderer.cleanup();
    this.started = false;
  }

  setStreaming(streaming: boolean): void {
    this.renderer.setMode(streaming ? 'streaming' : 'idle');
  }

  getMode(): 'idle' | 'streaming' {
    return this.renderer.getMode();
  }

  setContextUsage(percentage: number | null): void {
    if (percentage !== null) {
      this.renderer.updateStatusMeta({ contextPercent: percentage });
    }
  }

  setModeToggles(_options: {
    verificationEnabled: boolean;
    verificationHotkey?: string;
    autoContinueEnabled?: boolean;
    autoContinueHotkey?: string;
    thinkingModeLabel?: string | null;
    thinkingHotkey?: string;
    criticalApprovalMode?: 'auto' | 'approval';
    criticalApprovalHotkey?: string;
    dualRlEnabled?: boolean;
    dualRlHotkey?: string;
  }): void {
    const options = _options || {
      verificationEnabled: false,
      autoContinueEnabled: false,
    };
    this.renderer.updateModeToggles({
      verificationEnabled: options.verificationEnabled,
      verificationHotkey: options.verificationHotkey,
      autoContinueEnabled: options.autoContinueEnabled,
      autoContinueHotkey: options.autoContinueHotkey,
      thinkingModeLabel: options.thinkingModeLabel,
      thinkingHotkey: options.thinkingHotkey,
      criticalApprovalMode: options.criticalApprovalMode,
      criticalApprovalHotkey: options.criticalApprovalHotkey,
      dualRlEnabled: options.dualRlEnabled,
      dualRlHotkey: options.dualRlHotkey,
    });
  }

  setDebugMode(enabled: boolean): void {
    this.renderer.updateModeToggles({ debugEnabled: enabled });
  }

  setStatusMessage(message: string | null): void {
    this.setStatusBundle({ main: message });
  }

  setOverrideStatus(message: string | null): void {
    this.setStatusBundle({ override: message });
  }

  setStreamingLabel(label: string | null): void {
    this.setStatusBundle({ streaming: label });
  }

  /**
   * Atomically set the streaming/override/main status text and render once.
   */
  setStatusLine(status: { main?: string | null; override?: string | null; streaming?: string | null }): void {
    this.setStatusBundle(status);
  }

  setMetaStatus(meta: {
    elapsedSeconds?: number | null;
    tokensUsed?: number | null;
    tokenLimit?: number | null;
    thinkingMs?: number | null;
    thinkingHasContent?: boolean;
  }): void {
    const statusMeta: { contextPercent?: number; sessionTime?: string } = {};

    if (typeof meta.elapsedSeconds === 'number' && Number.isFinite(meta.elapsedSeconds) && meta.elapsedSeconds >= 0) {
      statusMeta.sessionTime = this.formatElapsed(meta.elapsedSeconds);
    }

    if (meta.tokensUsed != null && meta.tokenLimit != null) {
      const percent = meta.tokenLimit > 0 ? Math.round((meta.tokensUsed / meta.tokenLimit) * 100) : 0;
      statusMeta.contextPercent = percent;
    }
    this.renderer.updateStatusMeta(statusMeta);
  }

  clearAllStatus(): void {
    this.setStatusBundle({
      main: null,
      override: null,
      streaming: null,
    });
  }

  setModelContext(options: { model?: string | null; provider?: string | null }): void {
    this.renderer.updateStatusMeta(
      {
        model: options.model || undefined,
        provider: options.provider || undefined,
      },
      { render: true }
    );
  }

  setChromeMeta(meta: {
    profile?: string;
    workspace?: string;
    directory?: string;
    writes?: string;
    sessionLabel?: string;
    thinkingLabel?: string;
    autosave?: boolean;
    version?: string;
  }): void {
    this.renderer.updateStatusMeta(meta, { render: true });
  }

  setAvailableCommands(commands: CommandSuggestion[]): void {
    this.renderer.setAvailableCommands(commands);
  }

  /**
   * Display content in the inline panel (below prompt, above toggles).
   * Content is transient - not persisted to chat history.
   * Use for help menus, status displays, etc.
   */
  setInlinePanel(lines: string[]): void {
    this.renderer.setInlinePanel(lines);
  }

  /**
   * Clear the inline panel.
   */
  clearInlinePanel(): void {
    this.renderer.clearInlinePanel();
  }

  /**
   * Check if inline panel is supported (TTY mode only).
   */
  supportsInlinePanel(): boolean {
    return this.renderer.supportsInlinePanel();
  }

  setEditMode(mode: EditGuardMode): void {
    this.editMode = mode;
    this.callbacks.onEditModeChange?.(mode);
  }

  applyEditMode(mode: EditGuardMode): void {
    this.setEditMode(mode);
  }

  getEditMode(): EditGuardMode {
    return this.editMode;
  }

  getBuffer(): string {
    return this.renderer.getBuffer();
  }

  getCursor(): number {
    return this.renderer.getCursor();
  }

  setBuffer(text: string, cursorPos?: number): void {
    this.renderer.setBuffer(text, cursorPos);
  }

  setSecretMode(enabled: boolean): void {
    this.renderer.setSecretMode(enabled);
  }

  clear(): void {
    this.renderer.clearBuffer();
  }

  render(): void {
    this.renderer.render();
  }

  forceRender(): void {
    this.renderer.render();
  }

  handleResize(): void {
    this.renderer.render();
  }

  dispose(): void {
    this.renderer.cleanup();
  }

  /**
   * Update the status line with a single composed message so the UI looks identical
   * before and during streaming. The renderer only owns one status field, so we
   * join the different status sources here.
   */
  private setStatusBundle(status: { main?: string | null; override?: string | null; streaming?: string | null }): void {
    if ('main' in status) {
      this.statusMain = status.main?.trim() || null;
    }
    if ('override' in status) {
      this.statusOverride = status.override?.trim() || null;
    }
    if ('streaming' in status) {
      this.statusStreaming = status.streaming?.trim() || null;
    }
    this.refreshStatus();
  }

  private refreshStatus(): void {
    this.renderer.updateStatusBundle({
      main: this.statusMain,
      override: this.statusOverride,
      streaming: this.statusStreaming,
    });
  }

  private formatElapsed(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const paddedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`;
    return `${minutes}:${paddedSeconds}`;
  }
}
