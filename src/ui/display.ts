/**
 * Display - Simplified UI facade that routes all output through UnifiedUIRenderer
 *
 * This class now serves as a compatibility layer, providing the same API
 * but delegating all actual rendering to UnifiedUIRenderer.
 */

import readline from 'node:readline';
import { theme, icons } from './theme.js';
import { renderMessagePanel, renderMessageBody } from './richText.js';
import { getTerminalColumns } from './layout.js';
import { highlightError } from './textHighlighter.js';
import type { ProviderUsage } from '../core/types.js';
import { renderSectionHeading } from './designSystem.js';
import { isPlainOutputMode } from './outputMode.js';
import { UnifiedUIRenderer, type RendererEventType } from './UnifiedUIRenderer.js';

type OutputStream = NodeJS.WritableStream & { columns?: number; rows?: number; isTTY?: boolean };

export interface DisplayMessageMetadata {
  isFinal?: boolean;
  elapsedMs?: number;
  usage?: ProviderUsage | null;
  contextWindowTokens?: number | null;
  wasStreamed?: boolean;
  suppressDisplay?: boolean;
}

interface StatusLineContextInfo {
  percentage?: number;
  tokens?: number;
  sessionElapsedMs?: number;
}

type ActionStatus = 'pending' | 'success' | 'error' | 'info' | 'warning';

interface PrefixWrapOptions {
  continuationPrefix?: string;
}

interface OutputInterceptor {
  beforeWrite?: () => void;
  afterWrite?: (content?: string) => void;
}

type CommandPaletteTone = 'info' | 'warn' | 'success' | 'muted';

interface CommandPaletteItem {
  command: string;
  description: string;
  category?: string | null;
  tone?: CommandPaletteTone;
}

type InlinePanelMode = 'panel' | 'notice';
type InlinePanelTone = 'info' | 'warning' | 'error' | 'success';

interface InlinePanelPayload {
  content: string;
  mode?: InlinePanelMode;
  tone?: InlinePanelTone;
}

// Display configuration constants
const DISPLAY_CONSTANTS = {
  MIN_BANNER_WIDTH: 32,
  MAX_BANNER_WIDTH: 120,
  BANNER_PADDING: 4,
  MIN_MESSAGE_WIDTH: 42,
  MAX_MESSAGE_WIDTH: 110,
  MESSAGE_PADDING: 4,
  MIN_ACTION_WIDTH: 40,
  MAX_ACTION_WIDTH: 90,
  MIN_THOUGHT_WIDTH: 48,
  MAX_THOUGHT_WIDTH: 96,
  MIN_CONTENT_WIDTH: 10,
  MIN_WRAP_WIDTH: 12,
} as const;

/**
 * Display class - now a thin wrapper around UnifiedUIRenderer
 *
 * Provides backward-compatible API while routing all output through the renderer.
 */
export class Display {
  private readonly outputStream: OutputStream;
  private readonly errorStream: OutputStream;
  private renderer: UnifiedUIRenderer | null = null;
  private readonly outputInterceptors = new Set<OutputInterceptor>();
  private inlinePanelHandler: ((payload: InlinePanelPayload) => boolean) | null = null;

  constructor(stream: OutputStream = process.stdout, errorStream?: OutputStream) {
    this.outputStream = stream;
    this.errorStream = errorStream ?? stream;
  }

  setRenderer(renderer: UnifiedUIRenderer | null): void {
    this.renderer = renderer;
  }

  hasRenderer(): boolean {
    return Boolean(this.renderer);
  }

  setInlinePanelHandler(handler: ((payload: InlinePanelPayload) => boolean) | null): void {
    this.inlinePanelHandler = handler;
  }

  private maybeHandleInlinePanel(payload: InlinePanelPayload): boolean {
    if (!this.inlinePanelHandler) {
      return false;
    }

    const normalized = payload.content?.trim();
    if (!normalized) {
      return false;
    }

    try {
      return this.inlinePanelHandler({ ...payload, content: normalized }) === true;
    } catch {
      return false;
    }
  }

  private enqueueEvent(type: RendererEventType, content: string): boolean {
    if (!this.renderer || !content) {
      return false;
    }
    this.renderer.addEvent(type, content);
    return true;
  }

  registerOutputInterceptor(interceptor: OutputInterceptor): () => void {
    if (!interceptor) {
      return () => {};
    }
    this.outputInterceptors.add(interceptor);
    return () => {
      this.outputInterceptors.delete(interceptor);
    };
  }

  private notifyBeforeOutput(): void {
    for (const interceptor of this.outputInterceptors) {
      interceptor.beforeWrite?.();
    }
  }

  private notifyAfterOutput(content?: string): void {
    const interceptors = Array.from(this.outputInterceptors);
    for (let index = interceptors.length - 1; index >= 0; index -= 1) {
      interceptors[index]?.afterWrite?.(content);
    }
  }


  /**
   * Write raw content directly
   */
  writeRaw(content: string): void {
    if (!content) return;

    this.notifyBeforeOutput();
    if (this.enqueueEvent('raw', content)) {
      this.notifyAfterOutput(content);
      return;
    }

    // Fallback if no renderer
    this.outputStream.write(content);
    this.notifyAfterOutput(content);
  }

  /**
   * Stream chunk (for streaming responses)
   */
  stream(chunk: string): void {
    if (!chunk) return;

    this.notifyBeforeOutput();
    if (this.enqueueEvent('streaming', chunk)) {
      this.notifyAfterOutput(chunk);
      return;
    }

    // Fallback
    this.outputStream.write(chunk);
    this.notifyAfterOutput(chunk);
  }

  /**
   * Backward-compatible alias
   */
  writeStreamChunk(chunk: string): void {
    this.stream(chunk);
  }

  /**
   * Get the output stream for direct access
   */
  getOutputStream(): OutputStream {
    return this.outputStream;
  }

  /**
   * Show thinking indicator
   * NO-OP: Don't emit events during SSE streaming.
   * The animated spinner in the status line shows thinking state.
   */
  showThinking(_message: string = 'Thinking…') {
    // NO-OP: Spinner animation handles thinking state visually.
    // No events emitted - final message handler renders complete content.
  }

  /**
   * Update thinking indicator (status line only, not scrollback)
   * This is called frequently during streaming to show progress snippets.
   * The actual content will be rendered as a complete block later.
   */
  updateThinking(_message: string) {
    // NO-OP: Don't emit events for transient thinking updates.
    // Thinking snippets are shown only in the status indicator (animated spinner).
    // The complete thought/response will be rendered as a block when ready.
  }

  /**
   * Stop thinking (no-op - renderer handles state)
   */
  stopThinking(_addNewLine: boolean = true) {
    // No-op - renderer handles thinking state
  }

  /**
   * Show assistant message
   */
  showAssistantMessage(content: string, metadata?: DisplayMessageMetadata) {
    const normalized = content.trim();
    if (!normalized) return;

    const isThought = metadata?.isFinal === false;
    const useRichBlock = !isThought && metadata?.wasStreamed !== true;
    const wrapped = useRichBlock ? this.buildChatBox(normalized, metadata) : this.wrapForRenderer(normalized);
    const telemetry = !useRichBlock && metadata?.isFinal !== false ? this.formatTelemetryLine(metadata) : '';
    const payload = telemetry ? `${wrapped}\n${telemetry}` : wrapped;
    const eventType: RendererEventType = isThought ? 'thought' : useRichBlock ? 'banner' : 'response';

    this.notifyBeforeOutput();
    if (!this.enqueueEvent(eventType, payload)) {
      this.outputStream.write(`${payload}\n`);
    }
    this.notifyAfterOutput(payload);
  }

  /**
   * Show narrative (thought)
   * NO-OP: Don't emit events during SSE streaming.
   * Narratives are buffered and rendered as part of the final response.
   */
  showNarrative(_content: string) {
    // NO-OP: Don't emit intermediate narrative events.
    // Final message handler renders complete thought + response.
  }

  /**
   * Show action
   */
  showAction(text: string, status: ActionStatus = 'info') {
    if (!text.trim()) return;

    const icon = this.formatActionIcon(status);
    const rendered = this.wrapWithPrefix(text, `${icon} `);
    this.enqueueEvent('raw', `${rendered}\n`);
  }

  /**
   * Show sub-action
   */
  showSubAction(text: string, status: ActionStatus = 'info') {
    if (!text.trim()) return;

    const lines = this.buildWrappedSubActionLines(text, status);
    if (!lines.length) return;

    this.enqueueEvent('raw', `${lines.join('\n')}\n\n`);
  }

  /**
   * Show message
   */
  showMessage(content: string, role: 'assistant' | 'system' = 'assistant') {
    if (role === 'system') {
      this.showSystemMessage(content);
    } else {
      this.showAssistantMessage(content);
    }
  }

  /**
   * Show system message
   */
  showSystemMessage(content: string) {
    const normalized = content.trim();
    if (!normalized) return;

    if (this.maybeHandleInlinePanel({ content: normalized, mode: 'panel' })) {
      return;
    }

    const output = `${normalized}\n\n`;
    this.notifyBeforeOutput();
    if (!this.enqueueEvent('response', output)) {
      this.outputStream.write(output);
    }
    this.notifyAfterOutput(output);
  }

  /**
   * Show test event (renders in unified UI "test" lane)
   */
  showTestEvent(content: string) {
    const normalized = content.trim();
    if (!normalized) return;

    this.notifyBeforeOutput();
    if (!this.enqueueEvent('test', normalized)) {
      this.outputStream.write(`${normalized}\n\n`);
    }
    this.notifyAfterOutput(normalized);
  }

  /**
   * Show an inline panel pinned below the prompt (overlay only, no scrollback).
   */
  showInlinePanel(content: string | string[]) {
    const lines = Array.isArray(content) ? content : content.split('\n');
    const normalized = this.clampInlinePanel(lines.map(line => line.trimEnd()));
    const hasContent = normalized.some(line => line.trim().length > 0);
    if (!hasContent) {
      this.clearInlinePanel();
      return;
    }

    const rendererSupportsInline = this.renderer?.supportsInlinePanel?.() ?? false;
    if (this.renderer && typeof this.renderer.setInlinePanel === 'function') {
      // Always set renderer state so overlays get the latest content when available
      this.renderer.setInlinePanel(normalized);
      if (rendererSupportsInline) {
        return;
      }
    }

    // Fallback for plain/pipe mode: emit directly without relying on inline overlays
    const output = `${normalized.join('\n')}\n`;
    this.notifyBeforeOutput();
    this.outputStream.write(output);
    this.notifyAfterOutput(output);
  }

  clearInlinePanel() {
    if (this.renderer && typeof this.renderer.clearInlinePanel === 'function') {
      this.renderer.clearInlinePanel();
    }
  }

  private clampInlinePanel(lines: string[]): string[] {
    if (!lines.length) return lines;
    const maxLines = 64;
    if (lines.length <= maxLines) {
      return lines;
    }
    const overflow = lines.length - maxLines;
    const indicator = theme.ui.muted(`… ${overflow} more lines`);
    const tailCount = Math.max(1, maxLines - 1);
    const tail = lines.slice(-tailCount);
    return [indicator, ...tail];
  }

  /**
   * Capture a single line of user input without logging it to scrollback.
   * Uses the unified renderer when available, with a readline fallback.
   */
  async captureUserInput(options: { allowEmpty?: boolean; trim?: boolean; resetBuffer?: boolean } = {}): Promise<string> {
    if (this.renderer && typeof this.renderer.captureInput === 'function') {
      return this.renderer.captureInput(options);
    }

    return new Promise<string>((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('', (answer) => {
        rl.close();
        const normalized = options.trim === false ? answer : answer.trim();
        if (!normalized && !options.allowEmpty) {
          resolve('');
        } else {
          resolve(normalized);
        }
      });
    });
  }

  /**
   * Show error
   */
  showError(message: string, error?: unknown) {
    const normalized = message?.trim() ?? '';
    const details = this.formatErrorDetails(error);
    const inlineContent = [normalized, details].filter(Boolean).join('\n');
    if (inlineContent && this.maybeHandleInlinePanel({
      content: inlineContent,
      tone: 'error',
      mode: 'notice',
    })) {
      return;
    }

    const parts = [`${theme.error('✗')} ${normalized || message || 'Error'}`];
    if (details) {
      parts.push(`  ${details}`);
    }
    const output = `${parts.join('\n')}\n`;
    this.notifyBeforeOutput();
    if (!this.enqueueEvent('response', output)) {
      this.outputStream.write(output);
    }
    this.notifyAfterOutput(output);
  }

  /**
   * Show warning
   */
  showWarning(message: string) {
    const normalized = message.trim();
    if (!normalized) return;

    if (this.maybeHandleInlinePanel({
      content: normalized,
      tone: 'warning',
      mode: 'notice',
    })) {
      return;
    }

    const output = `${theme.warning('!')} ${normalized}\n`;
    this.notifyBeforeOutput();
    if (!this.enqueueEvent('response', output)) {
      this.outputStream.write(output);
    }
    this.notifyAfterOutput(output);
  }

  /**
   * Show info
   */
  showInfo(message: string) {
    const normalized = message.trim();
    if (!normalized) return;

    if (this.maybeHandleInlinePanel({
      content: normalized,
      tone: 'info',
      mode: 'notice',
    })) {
      return;
    }

    const output = `${theme.info('ℹ')} ${normalized}\n`;
    this.notifyBeforeOutput();
    if (!this.enqueueEvent('response', output)) {
      this.outputStream.write(output);
    }
    this.notifyAfterOutput(output);
  }

  /**
   * Show success
   */
  showSuccess(message: string) {
    const normalized = message.trim();
    if (!normalized) return;

    if (this.maybeHandleInlinePanel({
      content: normalized,
      tone: 'success',
      mode: 'notice',
    })) {
      return;
    }

    const output = `${theme.success('✓')} ${normalized}\n`;
    this.notifyBeforeOutput();
    if (!this.enqueueEvent('response', output)) {
      this.outputStream.write(output);
    }
    this.notifyAfterOutput(output);
  }

  /**
   * Show progress badge
   */
  showProgressBadge(label: string, current: number, total: number) {
    const percentage = Math.round((current / total) * 100);
    const barWidth = 20;
    const filled = Math.round((current / total) * barWidth);
    const empty = barWidth - filled;

    const progressBar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
    const badge = `[${label}] ${progressBar} ${percentage}%`;

    this.stream(`\r${theme.info(badge)}`);
    if (current >= total) {
      this.stream('\n');
    }
  }

  /**
   * Show status line
   */
  showStatusLine(status: string, elapsedMs?: number, _context?: StatusLineContextInfo) {
    const normalized = status?.trim();
    if (!normalized) return;

    const elapsed = this.formatElapsed(elapsedMs);
    const parts: string[] = [`• ${normalized}`];
    if (elapsed) {
      parts.push(elapsed);
    }
    if (process.stdout.isTTY) {
      parts.push('esc to interrupt');
    }

    // Status is kept internal; avoid forcing re-render of the overlay.
    this.renderer?.updateStatusBundle({ main: parts.join(' • ') }, { render: false });
  }

  /**
   * Show command palette
   */
  showCommandPalette(
    commands: CommandPaletteItem[],
    options?: { title?: string; intro?: string }
  ) {
    if (!commands || commands.length === 0) return;

    const panel = this.buildCommandPalette(commands, options);
    if (!panel.trim()) return;

    const output = `\n${panel}\n\n`;
    this.notifyBeforeOutput();
    if (!this.enqueueEvent('response', output)) {
      this.outputStream.write(output);
    }
    this.notifyAfterOutput(output);
  }

  /**
   * Show planning step
   */
  showPlanningStep(step: string, index: number, total: number) {
    if (!step?.trim() || index < 1 || total < 1 || index > total) return;

    const width = Math.max(
      DISPLAY_CONSTANTS.MIN_THOUGHT_WIDTH,
      Math.min(this.getColumnWidth(), DISPLAY_CONSTANTS.MAX_MESSAGE_WIDTH)
    );

    const heading = renderSectionHeading(`Plan ${index}/${total}`, {
      subtitle: step,
      icon: icons.arrow,
      tone: 'info',
      width,
    });

    this.enqueueEvent('raw', `${heading}\n`);
  }

  /**
   * Show thinking block
   */
  showThinkingBlock(content: string, durationMs?: number) {
    const block = this.buildClaudeStyleThought(content, durationMs);
    this.enqueueEvent('raw', `\n${block}\n\n`);
  }

  /**
   * Clear screen
   */
  clear() {
    // Renderer handles this
  }

  /**
   * Update streaming status (routes to renderer)
   */
  updateStreamingStatus(status: string | null): void {
    this.renderer?.updateStatus(status);
  }

  /**
   * Clear streaming status
   */
  clearStreamingStatus(): void {
    this.renderer?.updateStatus(null);
  }

  /**
   * Check if streaming status is visible
   */
  isStreamingStatusVisible(): boolean {
    return false; // Renderer manages this
  }

  parallelAgentStatus(content: string): void {
    if (!content) return;
    this.enqueueEvent('streaming', `${content}\n`);
  }

  // ==================== Private Helper Methods ====================

  private getColumnWidth(): number {
    if (
      typeof this.outputStream.columns === 'number' &&
      Number.isFinite(this.outputStream.columns) &&
      this.outputStream.columns > 0
    ) {
      return this.outputStream.columns;
    }
    return getTerminalColumns();
  }

  private formatErrorDetails(error?: unknown): string | null {
    if (!error) return null;

    if (error instanceof Error) {
      if (error.stack) return highlightError(error.stack);
      return highlightError(error.message);
    }

    if (typeof error === 'string') {
      return highlightError(error);
    }

    try {
      return highlightError(JSON.stringify(error, null, 2));
    } catch {
      // JSON.stringify can fail for circular references or special objects
      return highlightError('[Unable to serialize error details]');
    }
  }

  private formatElapsed(elapsedMs?: number): string | null {
    if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return null;
    }
    const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    }
    return `${seconds}s`;
  }

  private buildChatBox(content: string, metadata?: DisplayMessageMetadata): string {
    const normalized = content.trim();
    if (!normalized) return '';

    if (isPlainOutputMode()) {
      const body = renderMessageBody(normalized, this.resolveMessageWidth());
      const telemetry = this.formatTelemetryLine(metadata);
      return telemetry ? `${body}\n${telemetry}` : body;
    }

    const width = this.resolveMessageWidth();
    const panel = renderMessagePanel(normalized, {
      width,
      title: 'Assistant',
      icon: icons.assistant,
      accentColor: theme.assistant ?? theme.primary,
      borderColor: theme.ui.border,
    });

    const telemetry = this.formatTelemetryLine(metadata);
    return telemetry ? `${panel}\n${telemetry}` : panel;
  }

  private resolveMessageWidth(): number {
    const columns = this.getColumnWidth();
    return Math.max(
      DISPLAY_CONSTANTS.MIN_MESSAGE_WIDTH,
      columns - DISPLAY_CONSTANTS.MESSAGE_PADDING
    );
  }

  private formatTelemetryLine(metadata?: DisplayMessageMetadata): string {
    if (!metadata) return '';

    const parts: string[] = [];
    const elapsed = this.formatElapsed(metadata.elapsedMs);
    if (elapsed) {
      const elapsedLabel = theme.metrics?.elapsedLabel ?? theme.accent;
      const elapsedValue = theme.metrics?.elapsedValue ?? theme.secondary;
      parts.push(`${elapsedLabel('elapsed')} ${elapsedValue(elapsed)}`);
    }

    if (!parts.length) return '';

    const separator = theme.ui.muted(' • ');
    return `  ${parts.join(separator)}`;
  }

  /**
   * Build a Claude-style thinking block with enhanced visual design.
   *
   * Design:
   *   ╭─ thinking ──────────────────────╮
   *   │ Content of the thinking block   │
   *   │ wrapped nicely to fit width     │
   *   ╰─────────────────────────────────╯
   *
   * Or with duration:
   *   ╭─ thought · 3s ──────────────────╮
   *   │ Content here                    │
   *   ╰─────────────────────────────────╯
   */
  private buildClaudeStyleThought(content: string, durationMs?: number): string {
    const thinkingStyle = theme.thinking || {
      icon: theme.info,
      text: theme.ui.muted,
      border: theme.ui.border,
      label: theme.info,
    };

    // Determine box width
    const maxBoxWidth = Math.min(this.getColumnWidth() - 2, 72);
    const contentWidth = maxBoxWidth - 4; // Account for border and padding

    // Word-wrap content
    const contentLines = content.split('\n');
    const wrappedLines: string[] = [];

    for (const line of contentLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        wrappedLines.push('');
        continue;
      }
      const wrapped = this.wrapLine(trimmed, contentWidth);
      wrappedLines.push(...wrapped);
    }

    // Build the box
    const result: string[] = [];

    // Header with label (and optional duration)
    const labelText = durationMs !== undefined
      ? ` thought · ${this.formatElapsedTime(Math.floor(durationMs / 1000))} `
      : ' thinking ';
    const headerLine = `╭─${labelText}${'─'.repeat(Math.max(0, maxBoxWidth - labelText.length - 4))}─╮`;
    result.push(thinkingStyle.border(headerLine));

    // Content lines
    for (const line of wrappedLines) {
      const padding = ' '.repeat(Math.max(0, maxBoxWidth - 4 - line.length));
      result.push(`${thinkingStyle.border('│')} ${thinkingStyle.text(line)}${padding} ${thinkingStyle.border('│')}`);
    }

    // Footer
    const footerLine = `╰${'─'.repeat(maxBoxWidth - 2)}╯`;
    result.push(thinkingStyle.border(footerLine));

    return result.join('\n');
  }

  private formatElapsedTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  private buildCommandPalette(
    commands: CommandPaletteItem[],
    options?: { title?: string; intro?: string }
  ): string {
    if (!commands.length) return '';

    const width = Math.max(
      DISPLAY_CONSTANTS.MIN_MESSAGE_WIDTH,
      this.getColumnWidth() - 2
    );

    const indent = '  ';
    const grouped = this.groupPaletteCommands(commands);
    const commandWidth = this.computeCommandColumnWidth(commands, width, indent.length);
    const descWidth = Math.max(
      DISPLAY_CONSTANTS.MIN_WRAP_WIDTH,
      width - indent.length - commandWidth - 1
    );

    const title = options?.title ?? 'Slash commands';
    const intro = options?.intro ?? 'Describe a task or pick a command below:';

    const lines: string[] = [];
    lines.push(theme.gradient.primary(title));

    const introLines = this.wrapLine(intro, width);
    for (const line of introLines) {
      lines.push(theme.ui.muted(line));
    }

    lines.push('');

    grouped.forEach(({ category, items }, index) => {
      const label = this.formatPaletteCategory(category);
      if (label) {
        lines.push(theme.bold(label));
      }

      for (const item of items) {
        const wrappedDesc = this.wrapLine(item.description, descWidth);
        const paddedCommand = item.command.padEnd(commandWidth);
        const commandLabel = theme.primary(paddedCommand);

        const firstLine = wrappedDesc[0] ?? '';
        lines.push(`${indent}${commandLabel} ${this.colorizePaletteText(firstLine, item.tone)}`);

        for (const extra of wrappedDesc.slice(1)) {
          lines.push(`${indent}${' '.repeat(commandWidth)} ${this.colorizePaletteText(extra, item.tone)}`);
        }
      }

      if (index < grouped.length - 1) {
        lines.push('');
      }
    });

    return lines.join('\n').trimEnd();
  }

  private groupPaletteCommands(commands: CommandPaletteItem[]): Array<{ category: string; items: CommandPaletteItem[] }> {
    const FALLBACK = 'other';
    const groups = new Map<string, CommandPaletteItem[]>();

    for (const item of commands) {
      const key = (item.category ?? FALLBACK).toLowerCase();
      const bucket = groups.get(key) ?? [];
      bucket.push(item);
      groups.set(key, bucket);
    }

    const order = ['configuration', 'workspace', 'diagnostics', 'other'];
    const orderedKeys = [
      ...order.filter((key) => groups.has(key)),
      ...Array.from(groups.keys()).filter((key) => !order.includes(key)),
    ];

    return orderedKeys.map((category) => ({ category, items: groups.get(category) ?? [] }));
  }

  private computeCommandColumnWidth(commands: CommandPaletteItem[], totalWidth: number, indentWidth: number): number {
    const longest = commands.reduce((max, item) => Math.max(max, this.visibleLength(item.command)), 0);
    const maxAllowed = Math.max(12, Math.min(longest + 2, Math.floor(totalWidth * 0.35)));
    const budget = Math.max(10, totalWidth - indentWidth - DISPLAY_CONSTANTS.MIN_WRAP_WIDTH);
    return Math.min(maxAllowed, budget);
  }

  private formatPaletteCategory(category?: string | null): string {
    if (!category) return 'Other';

    switch (category.toLowerCase()) {
      case 'configuration': return 'Configuration';
      case 'workspace': return 'Workspace';
      case 'diagnostics': return 'Diagnostics';
      case 'other': return 'Other';
      default: return category[0]?.toUpperCase() + category.slice(1);
    }
  }

  private colorizePaletteText(text: string, tone?: CommandPaletteTone): string {
    switch (tone) {
      case 'warn': return theme.warning(text);
      case 'success': return theme.success(text);
      case 'info': return theme.info(text);
      case 'muted':
      default: return theme.ui.muted(text);
    }
  }

  private wrapWithPrefix(text: string, prefix: string, options?: PrefixWrapOptions): string {
    if (!text) {
      return prefix.trimEnd();
    }

    const width = Math.max(
      DISPLAY_CONSTANTS.MIN_ACTION_WIDTH,
      Math.min(this.getColumnWidth(), DISPLAY_CONSTANTS.MAX_ACTION_WIDTH)
    );
    const prefixWidth = this.visibleLength(prefix);
    const available = Math.max(DISPLAY_CONSTANTS.MIN_CONTENT_WIDTH, width - prefixWidth);
    const indent =
      typeof options?.continuationPrefix === 'string'
        ? options.continuationPrefix
        : ' '.repeat(Math.max(0, prefixWidth));

    const segments = text.split('\n');
    const lines: string[] = [];
    let usedPrefix = false;

    for (const segment of segments) {
      if (!segment.trim()) {
        if (usedPrefix) {
          lines.push(indent);
        } else {
          lines.push(prefix.trimEnd());
          usedPrefix = true;
        }
        continue;
      }

      const wrapped = this.wrapLine(segment.trim(), available);
      for (const line of wrapped) {
        lines.push(!usedPrefix ? `${prefix}${line}` : `${indent}${line}`);
        usedPrefix = true;
      }
    }

    return lines.join('\n');
  }

  private buildWrappedSubActionLines(text: string, status: ActionStatus): string[] {
    const lines = text.split('\n').map((line) => line.trimEnd());
    while (lines.length && !lines[lines.length - 1]?.trim()) {
      lines.pop();
    }
    if (!lines.length) return [];

    const rendered: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const segment = lines[index] ?? '';
      const isLast = index === lines.length - 1;
      const { prefix, continuation } = this.buildSubActionPrefixes(status, isLast);
      rendered.push(this.wrapWithPrefix(segment, prefix, { continuationPrefix: continuation }));
    }
    return rendered;
  }

  private buildSubActionPrefixes(status: ActionStatus, isLast: boolean) {
    if (isLast) {
      const colorize = this.resolveStatusColor(status);
      return {
        prefix: `  ${colorize(icons.subaction)} `,
        continuation: '    ',
      };
    }
    const branch = theme.ui.muted('│');
    return {
      prefix: `  ${branch} `,
      continuation: `  ${branch} `,
    };
  }

  private resolveStatusColor(status: ActionStatus) {
    switch (status) {
      case 'success': return theme.success;
      case 'error': return theme.error;
      case 'warning': return theme.warning;
      case 'pending': return theme.info;
      default: return theme.secondary;
    }
  }

  private formatActionIcon(status: ActionStatus): string {
    const colorize = this.resolveStatusColor(status);
    return colorize(`${icons.action}`);
  }

  private wrapForRenderer(text: string): string {
    const width = Math.max(
      DISPLAY_CONSTANTS.MIN_WRAP_WIDTH,
      this.getColumnWidth() - 4
    );
    const lines: string[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trimEnd();
      const wrapped = this.wrapLine(trimmed, width);
      lines.push(...wrapped);
    }
    return lines.join('\n').trimEnd();
  }

  private wrapLine(text: string, width: number): string[] {
    if (width <= 0) return [text];
    if (!text) return [''];
    if (text.length <= width) return [text];

    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return this.chunkWord(text, width);

    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        if (word.length <= width) {
          current = word;
        } else {
          const chunks = this.chunkWord(word, width);
          lines.push(...chunks.slice(0, -1));
          current = chunks[chunks.length - 1] ?? '';
        }
      } else if (current.length + 1 + word.length <= width) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        if (word.length <= width) {
          current = word;
        } else {
          const chunks = this.chunkWord(word, width);
          lines.push(...chunks.slice(0, -1));
          current = chunks[chunks.length - 1] ?? '';
        }
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines.length ? lines : [''];
  }

  private chunkWord(word: string, width: number): string[] {
    if (width <= 0 || !word) return word ? [word] : [''];

    const chunks: string[] = [];
    for (let i = 0; i < word.length; i += width) {
      chunks.push(word.slice(i, i + width));
    }

    return chunks.length > 0 ? chunks : [''];
  }

  private visibleLength(value: string): number {
    if (!value) return 0;
    return this.stripAnsi(value).length;
  }

  private stripAnsi(value: string): string {
    if (!value) return '';
    // eslint-disable-next-line no-control-regex
    return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
  }
}

export const display = new Display();
