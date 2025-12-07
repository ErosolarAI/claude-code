/**
 * UnifiedUIRenderer - Claude Code style minimalist terminal UI.
 *
 * Goals:
 * - Single event pipeline for everything (prompt → thought → tool/build/test → response).
 * - Pinned status/meta only (never in scrollback).
 * - Scrollback only shows events; no duplicate status like "Working on your request" or "Ready for prompts".
 * - Streaming: first chunk sets a one-line banner; remainder streams naturally (optional).
 * - Collapsible-like summaries: we format a compact heading with an ellipsis indicator, but avoid ctrl+o hints.
 */

import * as readline from 'node:readline';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { theme, spinnerFrames } from './theme.js';
import { isPlainOutputMode } from './outputMode.js';
import { AnimatedSpinner, ThinkingIndicator, ContextMeter, disposeAnimations } from './animatedStatus.js';
import { logDebug } from '../utils/debugLogger.js';

export interface CommandSuggestion {
  command: string;
  description: string;
  category?: string;
}

type CanonicalEventType = 'prompt' | 'thought' | 'stream' | 'tool' | 'tool-result' | 'build' | 'test' | 'response';

export type RendererEventType =
  | CanonicalEventType
  | 'raw'
  | 'banner'
  | 'error'
  | 'streaming'
  | 'tool-call'
  | 'tool-result';

type UIEvent = {
  type: CanonicalEventType;
  rawType: RendererEventType;
  content: string;
  timestamp: number;
  isCompacted?: boolean; // Claude Code style compact conversation block
};

export interface UnifiedUIRendererOptions {
  debug?: boolean;
}

type InputChangeEvent = {
  text: string;
  cursor: number;
};

interface ModeToggleState {
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
  debugEnabled?: boolean;
  debugHotkey?: string;
}

const ESC = {
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h',
  CLEAR_SCREEN: '\x1b[2J',
  CLEAR_LINE: '\x1b[2K',
  HOME: '\x1b[H',
  ENABLE_BRACKETED_PASTE: '\x1b[?2004h',
  DISABLE_BRACKETED_PASTE: '\x1b[?2004l',
  TO: (row: number, col: number) => `\x1b[${row};${col}H`,
  TO_COL: (col: number) => `\x1b[${col}G`,
  ERASE_DOWN: '\x1b[J',
  REVERSE: '\x1b[7m',
  RESET: '\x1b[0m',
  // Scroll region control - CRITICAL for fixed bottom overlay
  SET_SCROLL_REGION: (top: number, bottom: number) => `\x1b[${top};${bottom}r`,
  RESET_SCROLL_REGION: '\x1b[r',
  SAVE_CURSOR: '\x1b[s',
  RESTORE_CURSOR: '\x1b[u',
} as const;

const NEWLINE_PLACEHOLDER = '↵';

export class UnifiedUIRenderer extends EventEmitter {
  private readonly output: NodeJS.WriteStream;
  private readonly input: NodeJS.ReadStream;
  private readonly rl: readline.Interface;
  private readonly plainMode: boolean;
  private readonly interactive: boolean;

  private rows = 24;
  private cols = 80;
  private lastRenderWidth: number | null = null;

  private eventQueue: UIEvent[] = [];
  private isProcessingQueue = false;

  private buffer = '';
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private suggestions: { command: string; description: string; category?: string }[] = [];
  private suggestionIndex = -1;
  private availableCommands: typeof this.suggestions = [];
  private hotkeysInToggleLine: Set<string> = new Set();
  private collapsedPaste: { text: string; lines: number; chars: number } | null = null;

  private mode: 'idle' | 'streaming' = 'idle';
  private lastToolResult: string | null = null;
  private streamingStartTime: number | null = null;
  private statusMessage: string | null = null;
  private statusOverride: string | null = null;
  private statusStreaming: string | null = null;

  // Animated UI components
  private streamingSpinner: AnimatedSpinner | null = null;
  private thinkingIndicator: ThinkingIndicator | null = null;
  private contextMeter: ContextMeter;
  private spinnerFrame = 0;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private readonly maxInlinePanelLines = 12;

  // Compacting status animation
  private compactingStatusMessage = '';
  private compactingStatusFrame = 0;
  private compactingStatusInterval: NodeJS.Timeout | null = null;
  private readonly compactingSpinnerFrames = ['✻', '✼', '✻', '✺'];

  // Animated activity line (e.g., "✳ Ruminating… (esc to interrupt · 34s · ↑1.2k)")
  private activityMessage: string | null = null;
  private activityPhraseIndex = 0;
  private activityStarFrame = 0;
  private readonly activityStarFrames = ['✳', '✴', '✵', '✶', '✷', '✸'];
  // Token count during streaming
  private streamingTokens = 0;
  // Horizontal scroll animation for long activity lines
  private activityScrollOffset = 0;
  private activityScrollDirection = 1; // 1 = right, -1 = left
  // Elapsed time color animation
  private elapsedColorFrame = 0;
  private readonly elapsedColorFrames = ['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A', '#FCD34D', '#FBBF24'];
  // User-friendly activity phrases (clean, professional)
  private readonly funActivityPhrases = [
    'Thinking', 'Processing', 'Analyzing', 'Working', 'Preparing',
  ];
  private readonly maxCuratedReasoningLines = 8;
  private readonly maxCuratedReasoningChars = 1800;
  private readonly thoughtDedupWindowMs = 15000;
  private lastCuratedThought: { text: string; at: number } | null = null;

  private statusMeta: {
    model?: string;
    provider?: string;
    sessionTime?: string;
    contextPercent?: number;
    profile?: string;
    workspace?: string;
    directory?: string;
    writes?: string;
    sessionLabel?: string;
    thinkingLabel?: string;
    autosave?: boolean;
    version?: string;
    toolSummary?: string;
  } = {};
  private toggleState: ModeToggleState = {
    verificationEnabled: false,
    autoContinueEnabled: false,
    criticalApprovalMode: 'auto',
    dualRlEnabled: false,
    debugEnabled: false,
  };

  // ------------ Helpers ------------

  /** Ensure cursor is always within valid bounds for the current buffer */
  private clampCursor(): void {
    this.cursor = Math.max(0, Math.min(this.cursor, this.buffer.length));
  }

  /** Safely append to paste buffer with size limit enforcement */
  private appendToPasteBuffer(buffer: 'paste' | 'plainPaste', text: string): void {
    if (this.pasteBufferOverflow) return; // Already at limit
    const current = buffer === 'paste' ? this.pasteBuffer : this.plainPasteBuffer;
    const remaining = this.maxPasteBufferSize - current.length;
    if (remaining <= 0) {
      this.pasteBufferOverflow = true;
      return;
    }
    const toAdd = text.length <= remaining ? text : text.slice(0, remaining);
    if (buffer === 'paste') {
      this.pasteBuffer += toAdd;
    } else {
      this.plainPasteBuffer += toAdd;
    }
    if (toAdd.length < text.length) {
      this.pasteBufferOverflow = true;
    }
  }

  /** Strip ANSI escape sequences from text to prevent injection */
  private sanitizePasteContent(text: string): string {
    // Remove all ANSI escape sequences (CSI, OSC, etc.)
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[PX^_][^\x1b]*\x1b\\|\x1b./g, '');
  }

  private formatHotkey(combo?: string): string | null {
    if (!combo?.trim()) return null;
    return combo.trim().toUpperCase();
  }

  private lastPromptEvent: { text: string; at: number } | null = null;

  private promptHeight = 0;
  private lastOverlayHeight = 0;
  private inlinePanel: string[] = [];
  private hasConversationContent = false;
  private isPromptActive = false;
  private inputRenderOffset = 0;
  private readonly plainPasteIdleMs = 24;
  private readonly plainPasteWindowMs = 60;
  private readonly plainPasteTriggerChars = 24;
  private readonly plainPasteEarlyNewlineChars = 2; // Guard for short first lines in plain paste mode
  // Paste buffer limits to prevent memory exhaustion
  private readonly maxPasteBufferSize = 10 * 1024 * 1024; // 10MB max paste size
  private pasteBufferOverflow = false; // Track if paste was truncated
  private cursorVisibleColumn = 1;
  private inBracketedPaste = false;
  private pasteBuffer = '';
  private inPlainPaste = false;
  private plainPasteBuffer = '';
  private plainPasteTimer: NodeJS.Timeout | null = null;
  private pasteBurstWindowStart = 0;
  private pasteBurstCharCount = 0;
  private plainRecentChunks: Array<{ text: string; at: number }> = [];
  // Pending insert buffer: holds characters during paste detection window to prevent visual leak
  private pendingInsertBuffer = '';
  private pendingInsertTimer: NodeJS.Timeout | null = null;
  private readonly pendingInsertDelayMs = 80; // Wait before committing chars as normal input
  private lastRenderedEventKey: string | null = null;
  private lastOutputEndedWithNewline = true;
  private hasRenderedPrompt = false;
  private hasEverRenderedOverlay = false;  // Track if we've ever rendered for inline clearing
  private lastOverlay: { lines: string[]; promptIndex: number } | null = null;
  private allowPromptRender = true;
  private promptRenderingSuspended = false;
  private secretMode = false;
  // Render throttling to prevent excessive redraws during rapid input
  private pendingRender = false;
  private lastRenderTime = 0;
  private readonly renderThrottleMs = 16; // ~60fps max
  private renderThrottleTimer: NodeJS.Timeout | null = null;
  // Disposal state to prevent operations after cleanup
  private disposed = false;
  // Bound event handlers for proper cleanup
  private boundResizeHandler: (() => void) | null = null;
  private boundKeypressHandler: ((str: string, key: readline.Key) => void) | null = null;
  private inputCapture:
    | {
        resolve: (value: string) => void;
        reject?: (reason?: unknown) => void;
        options: { trim: boolean; allowEmpty: boolean };
      }
    | null = null;

  constructor(
    output: NodeJS.WriteStream = process.stdout,
    input: NodeJS.ReadStream = process.stdin,
    _options?: UnifiedUIRendererOptions
  ) {
    super();
    this.output = output;
    this.input = input;
    this.interactive = Boolean(this.output.isTTY && this.input.isTTY && !process.env['CI']);
    this.plainMode = isPlainOutputMode() || !this.interactive;

    // Initialize animated components
    this.contextMeter = new ContextMeter();

    this.rl = readline.createInterface({
      input: this.input,
      output: this.output,
      terminal: true,
      prompt: '',
      tabSize: 2,
    });
    this.rl.setPrompt('');
    this.updateTerminalSize();

    // Use bound handlers so we can remove them on cleanup
    this.boundResizeHandler = () => {
      if (!this.plainMode && !this.disposed) {
        this.updateTerminalSize();
        this.renderPrompt();
      }
    };
    this.output.on('resize', this.boundResizeHandler);

    this.setupInputHandlers();
  }

  initialize(): void {
    if (!this.interactive) {
      return;
    }

    if (!this.plainMode) {
      // If an overlay was already rendered before initialization (e.g., banner emitted early),
      // clear it so initialize() doesn't stack a second control bar in scrollback.
      if (this.hasRenderedPrompt || this.lastOverlay) {
        this.clearPromptArea();
      }
      this.write(ESC.ENABLE_BRACKETED_PASTE);
      this.updateTerminalSize();
      this.hasRenderedPrompt = false;
      this.lastOutputEndedWithNewline = true;
      this.write(ESC.SHOW_CURSOR);
      return;
    }

    // Plain mode: minimal setup, still render a simple prompt line
    this.updateTerminalSize();
    this.hasRenderedPrompt = false;
    this.lastOutputEndedWithNewline = true;
    this.renderPrompt();
  }

  cleanup(): void {
    // Mark as disposed first to prevent any pending operations
    this.disposed = true;

    this.cancelInputCapture(new Error('Renderer disposed'));
    this.cancelPlainPasteCapture();

    // Clear render throttle timer
    if (this.renderThrottleTimer) {
      clearTimeout(this.renderThrottleTimer);
      this.renderThrottleTimer = null;
    }

    // Stop any running animations
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
    if (this.streamingSpinner) {
      this.streamingSpinner.stop();
      this.streamingSpinner = null;
    }
    if (this.thinkingIndicator) {
      this.thinkingIndicator.stop();
      this.thinkingIndicator = null;
    }
    this.contextMeter.dispose();
    disposeAnimations();

    // Remove event listeners to prevent memory leaks
    if (this.boundResizeHandler) {
      this.output.removeListener('resize', this.boundResizeHandler);
      this.boundResizeHandler = null;
    }
    if (this.boundKeypressHandler) {
      this.input.removeListener('keypress', this.boundKeypressHandler);
      this.boundKeypressHandler = null;
    }

    // Remove all EventEmitter listeners from this instance
    this.removeAllListeners();

    if (!this.interactive) {
      this.rl.close();
      return;
    }

    if (!this.plainMode) {
      // Clear the prompt area so it doesn't remain in scrollback history
      this.clearPromptArea();
      this.write(ESC.DISABLE_BRACKETED_PASTE);
      this.write(ESC.SHOW_CURSOR);
      this.write('\n');
    }
    if (this.input.isTTY) {
      this.input.setRawMode(false);
    }
    this.rl.close();
    this.lastOverlay = null;

    // Clear event queue
    this.eventQueue = [];
  }

  suspendPromptRendering(): void {
    this.promptRenderingSuspended = true;
  }

  resumePromptRendering(render: boolean = false): void {
    this.promptRenderingSuspended = false;
    if (render) {
      this.renderPrompt();
    }
  }

  // ------------ Input handling ------------

  private setupInputHandlers(): void {
    if (!this.interactive) {
      return;
    }
    this.rl.removeAllListeners('line');
    readline.emitKeypressEvents(this.input, this.rl);
    if (this.input.isTTY) {
      this.input.setRawMode(true);
    }
    // Use bound handler so we can remove it on cleanup
    this.boundKeypressHandler = (str: string, key: readline.Key) => {
      if (!this.disposed) {
        this.handleKeypress(str, key);
      }
    };
    this.input.on('keypress', this.boundKeypressHandler);
  }

  private emitInputChange(): void {
    const payload: InputChangeEvent = {
      text: this.buffer,
      cursor: this.cursor,
    };
    this.emit('change', payload);
  }

  private handleKeypress(str: string, key: readline.Key): void {
    // Normalize missing key metadata (common for some terminals emitting raw escape codes)
    const normalizedKey = key ?? this.parseEscapeSequence(str);
    const keyForPaste = normalizedKey ?? (str ? { sequence: str } as readline.Key : key);

    if (this.handleBracketedPaste(str, keyForPaste)) {
      return;
    }

    if (this.handlePlainPaste(str, keyForPaste)) {
      return;
    }

    // macOS Option+key produces Unicode characters; handle them before key metadata checks.
    const macOptionChars: Record<string, string> = {
      '©': 'g',  // Option+G
      '™': 'g',  // Option+Shift+G
      'å': 'a',  // Option+A
      'Å': 'a',  // Option+Shift+A
      '√': 'v',  // Option+V / Option+Shift+V
      '∂': 'd',  // Option+D
      'Î': 'd',  // Option+Shift+D (common macOS emission)
      '∆': 'd',  // Common alternate delta symbol
    };

    if (str && macOptionChars[str]) {
      const letter = macOptionChars[str];
      // Clear any pending insert buffer so the symbol never lands in the prompt
      this.pendingInsertBuffer = '';
      switch (letter) {
        case 'a':
          this.emit('toggle-critical-approval');
          this.renderPrompt();
          return;
        case 'g':
          this.emit('toggle-auto-continue');
          this.renderPrompt();
          return;
        case 'd':
          this.emit('toggle-dual-rl');
          this.renderPrompt();
          return;
        case 'v':
          this.emit('toggle-verify');
          this.renderPrompt();
          return;
        default:
          break;
      }
    }

    if (!normalizedKey) {
      return;
    }

    if (this.inputCapture && normalizedKey.ctrl && (normalizedKey.name === 'c' || normalizedKey.name === 'd')) {
      this.cancelInputCapture(new Error('Input capture cancelled'));
      this.clearBuffer();
      return;
    }

    // Detect Ctrl+Shift combinations (fallback for non-macOS or configured terminals)
    const isCtrlShift = (letter: string): boolean => {
      const lowerLetter = letter.toLowerCase();
      const upperLetter = letter.toUpperCase();

      // Pattern 1: Standard readline shift flag + ctrl
      if (normalizedKey.ctrl && normalizedKey.shift && normalizedKey.name?.toLowerCase() === lowerLetter) {
        return true;
      }

      // Pattern 2: Some terminals send uppercase name with ctrl
      if (normalizedKey.ctrl && normalizedKey.name === upperLetter) {
        return true;
      }

      // Pattern 3: Meta/Alt + letter (iTerm2 with "Option sends Meta")
      if (normalizedKey.meta && normalizedKey.name?.toLowerCase() === lowerLetter) {
        return true;
      }

      // Pattern 4: Raw escape sequence check for xterm-style modifiers
      const seq = str || normalizedKey.sequence;
      // eslint-disable-next-line no-control-regex
      if (seq && /^\x1b\[[0-9]+;6[~A-Z]?$/.test(seq)) {
        return true;
      }

      // Pattern 5: ESC + letter (Option sends ESC prefix in some configs)
      if (seq && seq === `\x1b${lowerLetter}`) {
        return true;
      }

      return false;
    };

    const handleCtrlShiftToggle = (letter: 'a' | 'g' | 'd' | 'v'): void => {
      // Ensure no buffered chars leak into the prompt
      this.pendingInsertBuffer = '';
      if (letter === 'a') {
        this.emit('toggle-critical-approval');
      } else if (letter === 'g') {
        this.emit('toggle-auto-continue');
      } else if (letter === 'd') {
        this.emit('toggle-dual-rl');
      } else if (letter === 'v') {
        this.emit('toggle-verify');
      }
      this.renderPrompt();
    };

    if (isCtrlShift('a')) {
      handleCtrlShiftToggle('a');
      return;
    }

    if (isCtrlShift('g')) {
      handleCtrlShiftToggle('g');
      return;
    }

    if (isCtrlShift('d')) {
      handleCtrlShiftToggle('d');
      return;
    }

    if (isCtrlShift('v')) {
      handleCtrlShiftToggle('v');
      return;
    }

    if (normalizedKey.ctrl && normalizedKey.name?.toLowerCase() === 'r') {
      this.emit('resume');
      return;
    }

    if (normalizedKey.ctrl && normalizedKey.name === 'c') {
      // Ctrl+C behavior:
      // 1. If buffer has text: clear it first, then notify shell
      // 2. If buffer is empty: let shell decide to pause AI or quit
      //
      // The InteractiveShell maintains a counter to track Ctrl+C presses and decides
      // whether to pause AI or exit based on processing state.

      const hadBuffer = this.buffer.length > 0;
      if (hadBuffer) {
        // Clear the input buffer first
        this.buffer = '';
        this.cursor = 0;
        this.renderPrompt();
        this.emitInputChange();
      }
      // Emit ctrlc event with buffer state so shell can handle appropriately
      this.emit('ctrlc', { hadBuffer });
      return;
    }

    if (key.ctrl && key.name === 'd') {
      if (this.buffer.length === 0) {
        this.emit('interrupt');
      }
      return;
    }

    if (key.ctrl && key.name === 'u') {
      this.clearBuffer();
      return;
    }

    if (key.ctrl && key.name === 'l') {
      if (this.collapsedPaste) {
        this.expandCollapsedPaste();
        return;
      }
    }

    // Ctrl+O: Expand last tool result
    if (key.ctrl && key.name === 'o') {
      this.emit('expand-tool-result');
      return;
    }

    if (key.name === 'return' || key.name === 'enter') {
      // If there's a collapsed paste, expand and submit in one action
      if (this.collapsedPaste) {
        this.expandCollapsedPaste();
        return;
      }
      // If a slash command suggestion is highlighted, pressing Enter submits it immediately
      if (this.applySuggestion(true)) return;
      // Fallback: if buffer starts with '/' and suggestions exist, use the selected/first one
      if (this.buffer.startsWith('/') && this.suggestions.length > 0) {
        const safeIndex = this.suggestionIndex >= 0 && this.suggestionIndex < this.suggestions.length
          ? this.suggestionIndex
          : 0;
        this.buffer = this.suggestions[safeIndex]?.command ?? this.buffer;
      }
      this.submitText(this.buffer);
      return;
    }

    if (normalizedKey.name === 'backspace') {
      if (this.collapsedPaste) {
        this.collapsedPaste = null;
        this.renderPrompt();
        this.emitInputChange();
        return;
      }
      if (this.cursor > 0) {
        this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
        this.cursor--;
        this.updateSuggestions();
        this.renderPrompt();
        this.emitInputChange();
      }
      return;
    }

    if (normalizedKey.name === 'delete') {
      if (this.cursor < this.buffer.length) {
        this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
        this.updateSuggestions();
        this.renderPrompt();
        this.emitInputChange();
      }
      return;
    }

    if (normalizedKey.name === 'left') {
      if (this.cursor > 0) {
        this.cursor--;
        this.ensureCursorVisible();
        this.renderPrompt();
        this.emitInputChange();
      }
      return;
    }

    if (normalizedKey.name === 'right') {
      if (this.cursor < this.buffer.length) {
        this.cursor++;
        this.ensureCursorVisible();
        this.renderPrompt();
        this.emitInputChange();
      }
      return;
    }

    if (normalizedKey.name === 'up') {
      if (this.navigateSuggestions(-1)) {
        return;
      }
      if (this.history.length > 0) {
        if (this.historyIndex === -1) {
          this.historyIndex = this.history.length - 1;
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
        }
        // Validate index is within bounds before accessing
        if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
          this.buffer = this.history[this.historyIndex] ?? '';
        } else {
          this.historyIndex = -1;
          this.buffer = '';
        }
        this.cursor = this.buffer.length;
        this.inputRenderOffset = 0; // Reset render offset for new buffer
        this.updateSuggestions();
        this.renderPrompt();
        this.emitInputChange();
      }
      return;
    }

    if (normalizedKey.name === 'down') {
      if (this.navigateSuggestions(1)) {
        return;
      }
      if (this.historyIndex !== -1) {
        this.historyIndex++;
        if (this.historyIndex >= this.history.length) {
          this.historyIndex = -1;
          this.buffer = '';
        } else if (this.historyIndex >= 0) {
          this.buffer = this.history[this.historyIndex] ?? '';
        } else {
          // Safety: invalid state, reset
          this.historyIndex = -1;
          this.buffer = '';
        }
        this.cursor = this.buffer.length;
        this.inputRenderOffset = 0; // Reset render offset for new buffer
        this.updateSuggestions();
        this.renderPrompt();
        this.emitInputChange();
      }
      return;
    }

    if (normalizedKey.name === 'tab') {
      if (this.applySuggestion(false)) return;
      return;
    }

    if (str && !normalizedKey.ctrl && !normalizedKey.meta) {
      // Defer insertion to allow paste detection window to catch rapid input
      this.queuePendingInsert(str);
    }
  }

  /**
   * Ensure horizontal cursor position stays within the visible input window.
   * Prevents jumps when using left/right arrows on long lines.
   */
  private ensureCursorVisible(): void {
    const maxWidth = Math.max(10, this.safeWidth() - 12); // margin for prompt/toggles and padding
    // If cursor is left of current window, shift window left
    if (this.cursor < this.inputRenderOffset) {
      this.inputRenderOffset = this.cursor;
      return;
    }
    // If cursor is beyond visible window, shift window right
    if (this.cursor - this.inputRenderOffset >= maxWidth) {
      this.inputRenderOffset = this.cursor - maxWidth + 1;
    }
  }

  /**
   * Parse raw escape sequences when readline doesn't populate key metadata.
   * Prevents control codes (e.g., ^[[200~) from leaking into the buffer.
   */
  private parseEscapeSequence(sequence: string | null | undefined): readline.Key | null {
    if (!sequence) return null;
    const map: Record<string, readline.Key> = {
      '\x1b[A': { name: 'up', sequence } as readline.Key,
      '\x1b[B': { name: 'down', sequence } as readline.Key,
      '\x1b[C': { name: 'right', sequence } as readline.Key,
      '\x1b[D': { name: 'left', sequence } as readline.Key,
      '\x1b[H': { name: 'home', sequence } as readline.Key,
      '\x1b[F': { name: 'end', sequence } as readline.Key,
      '\x1b[200~': { name: 'paste-start', sequence } as readline.Key,
      '\x1b[201~': { name: 'paste-end', sequence } as readline.Key,
    };
    return map[sequence] ?? null;
  }

  /**
   * Queue characters for deferred insertion. This prevents visual "leak" of
   * pasted content by holding characters until we're confident it's not a paste.
   */
  private queuePendingInsert(text: string): void {
    this.pendingInsertBuffer += text;

    // Clear any existing timer
    if (this.pendingInsertTimer) {
      clearTimeout(this.pendingInsertTimer);
      this.pendingInsertTimer = null;
    }

    // Schedule commit after delay - if paste detection triggers first, it will consume the buffer
    this.pendingInsertTimer = setTimeout(() => {
      this.commitPendingInsert();
    }, this.pendingInsertDelayMs);
  }

  /**
   * Commit pending characters as normal input (not a paste).
   */
  private commitPendingInsert(): void {
    if (this.pendingInsertTimer) {
      clearTimeout(this.pendingInsertTimer);
      this.pendingInsertTimer = null;
    }

    if (this.pendingInsertBuffer && !this.inPlainPaste && !this.inBracketedPaste) {
      this.insertText(this.pendingInsertBuffer);
    }
    this.pendingInsertBuffer = '';
  }

  /**
   * Consume pending insert buffer into paste detection (prevents visual leak).
   */
  private consumePendingInsertForPaste(): string {
    if (this.pendingInsertTimer) {
      clearTimeout(this.pendingInsertTimer);
      this.pendingInsertTimer = null;
    }
    const consumed = this.pendingInsertBuffer;
    this.pendingInsertBuffer = '';
    return consumed;
  }

  private handleBracketedPaste(str: string, key: readline.Key): boolean {
    const sequence = key?.sequence || str;
    if (sequence === ESC.ENABLE_BRACKETED_PASTE || sequence === ESC.DISABLE_BRACKETED_PASTE) {
      return true;
    }
    if (sequence === '\x1b[200~') {
      this.inBracketedPaste = true;
      this.pasteBufferOverflow = false; // Reset overflow flag for new paste
      // Consume any pending insert buffer to prevent leak
      const pending = this.consumePendingInsertForPaste();
      this.pasteBuffer = pending; // Include any chars that arrived before bracketed paste started
      this.cancelPlainPasteCapture();
      return true;
    }
    if (!this.inBracketedPaste) {
      return false;
    }
    if (sequence === '\x1b[201~') {
      this.commitPasteBuffer();
      return true;
    }
    if (key?.name === 'return' || key?.name === 'enter') {
      this.appendToPasteBuffer('paste', '\n');
      return true;
    }
    if (key?.name === 'backspace') {
      this.pasteBuffer = this.pasteBuffer.slice(0, -1);
      return true;
    }
    if (typeof str === 'string' && str.length > 0) {
      this.appendToPasteBuffer('paste', str);
      return true;
    }
    if (typeof sequence === 'string' && sequence.length > 0) {
      this.appendToPasteBuffer('paste', sequence);
      return true;
    }
    return true;
  }

  private commitPasteBuffer(): void {
    if (!this.inBracketedPaste) return;
    // Sanitize to remove any injected escape sequences, then normalize line endings
    const sanitized = this.sanitizePasteContent(this.pasteBuffer);
    const content = sanitized.replace(/\r\n?/g, '\n');
    if (content) {
      const lines = content.split('\n');
      const wasTruncated = this.pasteBufferOverflow;
      if (lines.length > 1 || content.length > 200) {
        this.collapsedPaste = {
          text: content,
          lines: lines.length,
          chars: content.length + (wasTruncated ? '+' as unknown as number : 0), // Indicate truncation
        };
        this.buffer = '';
        this.cursor = 0;
        this.updateSuggestions();
        this.renderPrompt();
        this.emitInputChange();
      } else {
        this.insertText(content);
      }
    }
    this.inBracketedPaste = false;
    this.pasteBuffer = '';
    this.pasteBufferOverflow = false;
    this.cancelPlainPasteCapture();
  }

  private handlePlainPaste(str: string, key: readline.Key): boolean {
    // Fallback paste capture when bracketed paste isn't supported
    if (this.inBracketedPaste || key?.ctrl || key?.meta) {
      this.resetPlainPasteBurst();
      this.pruneRecentPlainChunks();
      return false;
    }

    const sequence = key?.sequence ?? '';
    const chunk = typeof str === 'string' && str.length > 0 ? str : sequence;
    if (!chunk) {
      this.resetPlainPasteBurst();
      this.pruneRecentPlainChunks();
      return false;
    }

    const now = Date.now();
    this.trackPlainPasteBurst(chunk.length, now);

    if (!this.inPlainPaste) {
      this.recordRecentPlainChunk(chunk, now);
    }

    const chunkMultiple = chunk.length > 1;
    const hasNewline = /[\r\n]/.test(chunk);
    const burstActive = this.pasteBurstWindowStart > 0 && now - this.pasteBurstWindowStart <= this.plainPasteWindowMs;
    const burstTrigger = burstActive && this.pasteBurstCharCount >= this.plainPasteTriggerChars;
    const hasRecentNonNewline = this.plainRecentChunks.some(entry => !/^[\r\n]+$/.test(entry.text));
    const earlyNewlineTrigger =
      hasNewline &&
      burstActive &&
      hasRecentNonNewline &&
      this.pasteBurstCharCount >= this.plainPasteEarlyNewlineChars;
    const newlineTrigger = hasNewline && (this.inPlainPaste || chunkMultiple || burstTrigger || earlyNewlineTrigger);
    const looksLikePaste = this.inPlainPaste || chunkMultiple || burstTrigger || newlineTrigger;

    if (!looksLikePaste) {
      this.pruneRecentPlainChunks();
      return false;
    }

    let chunkAlreadyCaptured = false;
    if (!this.inPlainPaste) {
      this.inPlainPaste = true;
      this.pasteBufferOverflow = false; // Reset overflow flag for new paste
      // Consume pending insert buffer first - this is the primary source now
      const pending = this.consumePendingInsertForPaste();
      const reclaimed = this.reclaimRecentPlainChunks();
      // Combine pending buffer with any reclaimed chunks
      const combined = pending + reclaimed;
      if (combined.length > 0) {
        // Remove any chars that leaked into buffer (legacy reclaim path)
        if (reclaimed.length > 0) {
          const removeCount = Math.min(this.buffer.length, reclaimed.length);
          const suffix = this.buffer.slice(-removeCount);
          if (removeCount > 0 && suffix === reclaimed.slice(-removeCount)) {
            this.buffer = this.buffer.slice(0, this.buffer.length - removeCount);
            this.cursor = Math.max(0, this.buffer.length);
            this.clampCursor(); // Ensure cursor is valid
          }
        }
        this.plainPasteBuffer = combined.slice(0, this.maxPasteBufferSize);
        if (combined.length > this.maxPasteBufferSize) {
          this.pasteBufferOverflow = true;
        }
        chunkAlreadyCaptured = combined.endsWith(chunk);
      } else {
        this.plainPasteBuffer = '';
      }
    }

    if (!chunkAlreadyCaptured) {
      this.appendToPasteBuffer('plainPaste', chunk);
    }
    this.schedulePlainPasteCommit();
    return true;
  }

  private trackPlainPasteBurst(length: number, now: number): void {
    if (!this.pasteBurstWindowStart || now - this.pasteBurstWindowStart > this.plainPasteWindowMs) {
      this.pasteBurstWindowStart = now;
      this.pasteBurstCharCount = 0;
    }
    this.pasteBurstCharCount += length;
  }

  private resetPlainPasteBurst(): void {
    this.pasteBurstWindowStart = 0;
    this.pasteBurstCharCount = 0;
  }

  private cancelPlainPasteCapture(): void {
    if (this.plainPasteTimer) {
      clearTimeout(this.plainPasteTimer);
      this.plainPasteTimer = null;
    }
    // Also cancel pending insert buffer
    if (this.pendingInsertTimer) {
      clearTimeout(this.pendingInsertTimer);
      this.pendingInsertTimer = null;
    }
    this.pendingInsertBuffer = '';
    this.inPlainPaste = false;
    this.plainPasteBuffer = '';
    this.plainRecentChunks = [];
    this.resetPlainPasteBurst();
  }

  private recordRecentPlainChunk(text: string, at: number): void {
    const windowStart = at - this.plainPasteWindowMs;
    this.plainRecentChunks.push({ text, at });
    this.plainRecentChunks = this.plainRecentChunks.filter(entry => entry.at >= windowStart);
  }

  private pruneRecentPlainChunks(): void {
    if (!this.plainRecentChunks.length) return;
    const now = Date.now();
    const windowStart = now - this.plainPasteWindowMs;
    this.plainRecentChunks = this.plainRecentChunks.filter(entry => entry.at >= windowStart);
  }

  private reclaimRecentPlainChunks(): string {
    if (!this.plainRecentChunks.length) return '';
    const combined = this.plainRecentChunks.map(entry => entry.text).join('');
    this.plainRecentChunks = [];
    return combined;
  }

  private schedulePlainPasteCommit(): void {
    if (this.plainPasteTimer) {
      clearTimeout(this.plainPasteTimer);
    }
    this.plainPasteTimer = setTimeout(() => {
      this.finalizePlainPaste();
    }, this.plainPasteIdleMs);
  }

  private finalizePlainPaste(): void {
    if (!this.inPlainPaste) return;

    // Sanitize to remove any injected escape sequences, then normalize line endings
    const sanitized = this.sanitizePasteContent(this.plainPasteBuffer);
    const content = sanitized.replace(/\r\n?/g, '\n');
    const wasTruncated = this.pasteBufferOverflow;
    this.inPlainPaste = false;
    this.plainPasteBuffer = '';
    this.plainRecentChunks = [];
    this.resetPlainPasteBurst();
    this.pasteBufferOverflow = false;
    if (this.plainPasteTimer) {
      clearTimeout(this.plainPasteTimer);
      this.plainPasteTimer = null;
    }

    if (!content) return;
    const lines = content.split('\n');
    if (lines.length > 1 || content.length > 200) {
      this.collapsedPaste = {
        text: content,
        lines: lines.length,
        chars: content.length + (wasTruncated ? '+' as unknown as number : 0),
      };
      this.buffer = '';
      this.cursor = 0;
      this.updateSuggestions();
      this.renderPrompt();
      this.emitInputChange();
      return;
    }

    this.insertText(content);
  }

  private insertText(text: string): void {
    if (!text) return;
    if (this.inPlainPaste) {
      return;
    }
    if (this.collapsedPaste) {
      this.expandCollapsedPaste();
    }
    // Ensure cursor is valid before slicing
    this.clampCursor();
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
    this.clampCursor(); // Ensure cursor remains valid after modification
    this.updateSuggestions();
    this.renderPrompt();
    this.emitInputChange();
  }

  private submitText(text: string): void {
    // If there's a collapsed paste, submit that instead of the buffer text
    // This handles edge cases where submitText is called programmatically
    if (this.collapsedPaste) {
      this.expandCollapsedPaste();
      return;
    }

    if (this.inputCapture) {
      const shouldTrim = this.inputCapture.options.trim;
      const normalizedCapture = shouldTrim ? text.trim() : text;
      if (!this.inputCapture.options.allowEmpty && !normalizedCapture) {
        this.renderPrompt();
        return;
      }
      const resolver = this.inputCapture;
      this.inputCapture = null;
      this.buffer = '';
      this.cursor = 0;
      this.inputRenderOffset = 0;
      this.resetSuggestions();
      this.renderPrompt();
      this.emitInputChange();
      resolver.resolve(normalizedCapture);
      return;
    }

    const normalized = text.trim();
    if (!normalized) {
      this.renderPrompt();
      return;
    }

    // Don't add secrets or slash commands to history/scrollback
    if (!this.secretMode && !normalized.startsWith('/')) {
      this.history.push(normalized);
      this.historyIndex = -1;
      this.displayUserPrompt(normalized);
    } else if (!this.secretMode) {
      // Still track slash commands in history for convenience
      this.history.push(normalized);
      this.historyIndex = -1;
    }
    if (this.mode === 'streaming') {
      this.emit('queue', normalized);
    } else {
      this.emit('submit', normalized);
    }
    this.buffer = '';
    this.cursor = 0;
    this.resetSuggestions();
    this.renderPrompt();
    this.emitInputChange();
  }

  private updateSuggestions(): void {
    if (!this.buffer.startsWith('/')) {
      this.resetSuggestions();
      return;
    }

    const firstSpace = this.buffer.indexOf(' ');
    const hasArgText = firstSpace >= 0 && /\S/.test(this.buffer.slice(firstSpace + 1));
    // Hide slash suggestions when the user is editing arguments
    if (firstSpace >= 0 && this.cursor > firstSpace && hasArgText) {
      this.resetSuggestions();
      return;
    }

    const cursorSlice = this.buffer.slice(0, this.cursor);
    const commandSlice = firstSpace >= 0 ? cursorSlice.slice(0, firstSpace) : cursorSlice;
    const fallbackSlice = firstSpace >= 0 ? this.buffer.slice(0, firstSpace) : this.buffer;
    const partial = (commandSlice.trimEnd() || fallbackSlice.trimEnd() || '/').toLowerCase();
    const previous = this.suggestions[this.suggestionIndex]?.command;
    this.suggestions = this.availableCommands
      .filter(cmd => cmd.command.toLowerCase().startsWith(partial))
      .slice(0, 5);
    if (this.suggestions.length === 0) {
      this.resetSuggestions();
      return;
    }
    if (previous) {
      const idx = this.suggestions.findIndex(s => s.command === previous);
      this.suggestionIndex = idx >= 0 ? idx : 0;
    } else {
      this.suggestionIndex = 0;
    }
  }

  setAvailableCommands(commands: typeof this.suggestions): void {
    this.availableCommands = commands;
    this.updateSuggestions();
  }

  private applySuggestion(submit: boolean): boolean {
    if (!this.buffer.startsWith('/') || this.suggestions.length === 0) {
      return false;
    }
    // Ensure suggestionIndex is valid, default to first item
    const safeIndex = this.suggestionIndex >= 0 && this.suggestionIndex < this.suggestions.length
      ? this.suggestionIndex
      : 0;
    const selected = this.suggestions[safeIndex];
    if (!selected) {
      return false;
    }
    if (submit) {
      this.submitText(selected.command);
    } else {
      this.buffer = `${selected.command} `;
      this.cursor = this.buffer.length;
      this.resetSuggestions();
      this.renderPrompt();
      this.emitInputChange();
    }
    return true;
  }

  private resetSuggestions(): void {
    this.suggestions = [];
    this.suggestionIndex = -1;
  }

  private navigateSuggestions(direction: number): boolean {
    if (!this.buffer.startsWith('/') || this.suggestions.length === 0) {
      // Reset index if suggestions were cleared but index wasn't
      if (this.suggestionIndex !== -1 && this.suggestions.length === 0) {
        this.suggestionIndex = -1;
      }
      return false;
    }
    // Ensure current index is valid before computing next
    const currentIndex = this.suggestionIndex >= 0 && this.suggestionIndex < this.suggestions.length
      ? this.suggestionIndex
      : -1;
    const next = currentIndex + direction;
    const clamped = Math.max(0, Math.min(this.suggestions.length - 1, next));
    if (clamped === this.suggestionIndex && this.suggestionIndex >= 0) {
      return true;
    }
    this.suggestionIndex = clamped;
    this.renderPrompt();
    return true;
  }

  // ------------ Event queue ------------

  addEvent(type: RendererEventType, content: string): void {
    logDebug(`[DEBUG renderer] addEvent called: type=${type}, content length=${content?.length || 0}`);
    if (!content) return;
    const normalized = this.normalizeEventType(type);
    if (!normalized) return;
    logDebug(`[DEBUG renderer] normalized type=${normalized}`);
    if (
      normalized === 'prompt' ||
      normalized === 'response' ||
      normalized === 'thought' ||
      normalized === 'stream' ||
      normalized === 'tool' ||
      normalized === 'tool-result' ||
      normalized === 'build' ||
      normalized === 'test'
    ) {
      this.hasConversationContent = true;
    }
    if (normalized === 'tool-result') {
      this.lastToolResult = content;
    }

    if (this.plainMode) {
      const formatted = this.formatContent({
        type: normalized,
        rawType: type,
        content,
        timestamp: Date.now(),
      });
      if (formatted) {
        const text = formatted.endsWith('\n') ? formatted : `${formatted}\n`;
        this.output.write(text);
        this.lastOutputEndedWithNewline = text.endsWith('\n');
      }
      return;
    }

    const event = {
      type: normalized,
      rawType: type,
      content,
      timestamp: Date.now(),
    };

    // Priority queue: prompt events are inserted at the front to ensure immediate display
    // This guarantees user input is echoed before any async processing responses
    if (normalized === 'prompt') {
      // Find the first non-prompt event and insert before it
      // This maintains prompt order while giving them priority over other events
      const insertIndex = this.eventQueue.findIndex(e => e.type !== 'prompt');
      if (insertIndex === -1) {
        this.eventQueue.push(event);
      } else {
        this.eventQueue.splice(insertIndex, 0, event);
      }
    } else {
      this.eventQueue.push(event);
    }

    if (!this.isProcessingQueue) {
      queueMicrotask(() => {
        if (!this.isProcessingQueue) {
          void this.processQueue();
        }
      });
    }
  }

  /**
   * Re-render the prompt/control bar immediately.
   * This keeps the chat box pinned during long streaming runs instead of waiting
   * for the event queue to drain before the prompt reappears.
   */
  private renderPromptOverlay(immediate: boolean = false): void {
    if (this.plainMode || this.disposed || !this.output.isTTY || this.promptRenderingSuspended) {
      return;
    }
    this.allowPromptRender = true;
    if (immediate) {
      this.renderPromptImmediate();
      return;
    }
    this.renderPrompt();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.disposed) return;
    this.isProcessingQueue = true;
    try {
      while (this.eventQueue.length > 0 && !this.disposed) {
        const event = this.eventQueue.shift();
        if (!event) continue;
        const coalesced = this.coalesceAdjacentTextEvents(event);
        try {
          await this.renderEvent(coalesced);
        } catch (error) {
          // Never allow a rendering failure to stall the event queue
          if (this.disposed) break; // Don't try to write after disposal
          const message =
            error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown renderer error';
          this.output.write(`\n[renderer] ${message}\n`);
        }

        // Check disposed before continuing
        if (this.disposed) break;

        // For prompt events, ensure the overlay is rendered immediately
        // This guarantees prompts are visible before async processing continues
        if (event.type === 'prompt') {
          if (this.output.isTTY) {
            this.allowPromptRender = true;
            this.renderPrompt();
          }
          // No delay for prompt events - render immediately
        } else {
          await this.delay(1);
        }
      }
      // ALWAYS render prompt after queue completes to keep bottom UI persistent
      // This ensures status/toggles stay pinned and responses are fully rendered
      if (this.output.isTTY && !this.disposed) {
        this.allowPromptRender = true;
        this.renderPrompt();
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Merge adjacent response/thought events into a single block so continuous
   * chat text renders with one bullet instead of one per chunk.
   */
  private coalesceAdjacentTextEvents(event: UIEvent): UIEvent {
    const isMergeable = (target: UIEvent | undefined): target is UIEvent =>
      Boolean(
        target &&
          !target.isCompacted &&
          ((target.type === 'response' && target.rawType === 'response') ||
            (target.type === 'thought' && target.rawType === 'thought'))
      );

    if (!isMergeable(event)) {
      return event;
    }

    while (this.eventQueue.length > 0 && isMergeable(this.eventQueue[0])) {
      const next = this.eventQueue.shift()!;
      const needsSeparator =
        event.content.length > 0 && !event.content.endsWith('\n') && !next.content.startsWith('\n');
      event.content = needsSeparator ? `${event.content}\n${next.content}` : `${event.content}${next.content}`;
    }

    return event;
  }

  /**
   * Flush pending renderer events.
   * Useful for startup flows (e.g., welcome banner) to guarantee the scrollback is hydrated
   * before continuing with additional UI updates.
   */
  async flushEvents(timeoutMs: number = 250): Promise<void> {
    // Kick off processing if idle
    if (!this.plainMode && !this.isProcessingQueue && this.eventQueue.length > 0) {
      void this.processQueue();
    }

    const start = Date.now();
    while ((this.isProcessingQueue || this.eventQueue.length > 0) && Date.now() - start < timeoutMs) {
      await this.delay(5);
    }

    if (!this.plainMode && this.output.isTTY) {
      this.allowPromptRender = true;
      this.renderPrompt();
    }
  }

  private async renderEvent(event: UIEvent): Promise<void> {
    logDebug(`[DEBUG renderer] renderEvent: type=${event.type}, content length=${event.content?.length || 0}`);
    if (this.plainMode) {
      logDebug('[DEBUG renderer] plainMode - writing directly');
      const formattedPlain = this.formatContent(event);
      if (formattedPlain) {
        const text = formattedPlain.endsWith('\n') ? formattedPlain : `${formattedPlain}\n`;
        this.output.write(text);
        this.lastOutputEndedWithNewline = text.endsWith('\n');
      }
      return;
    }

    const formatted = this.formatContent(event);
    logDebug(`[DEBUG renderer] formatted length=${formatted?.length || 0}`);
    if (!formatted) return;

    // Allow prompts and responses to always render (don't deduplicate)
    // Only deduplicate streaming content
    const signature = `${event.rawType}:${event.content}`;
    if (event.type === 'stream' && signature === this.lastRenderedEventKey) {
      return;
    }
    if (event.type !== 'prompt') {
      this.lastRenderedEventKey = signature;
    }

    // Clear the prompt area before writing new content
    if (this.promptHeight > 0 || this.lastOverlay) {
      this.clearPromptArea();
    }
    this.isPromptActive = false;

    if (event.type !== 'stream' && !this.lastOutputEndedWithNewline && formatted.trim()) {
      // Keep scrollback ordering predictable when previous output ended mid-line
      this.output.write('\n');
      this.lastOutputEndedWithNewline = true;
    }

    this.output.write(formatted);
    this.lastOutputEndedWithNewline = formatted.endsWith('\n');

    // Immediately restore the prompt overlay so the chat box stays pinned during streaming
    if (this.output.isTTY && this.interactive && !this.disposed) {
      this.renderPromptOverlay(true);
    }
  }

  private normalizeEventType(type: RendererEventType): CanonicalEventType | null {
    switch (type) {
      case 'prompt':
        return 'prompt';
      case 'thought':
        return 'thought';
      case 'stream':
      case 'streaming':
        return 'stream';
      case 'tool':
      case 'tool-call':
        return 'tool';
      case 'tool-result':
        return 'tool-result';
      case 'build':
        return 'build';
      case 'test':
        return 'test';
      case 'response':
      case 'banner':
      case 'raw':
        return 'response';
      case 'error':
        return 'response';
      default:
        return null;
    }
  }

  private formatContent(event: UIEvent): string {
    // Compacted blocks already have separator and formatting
    if (event.isCompacted) {
      return event.content;
    }

    if (event.rawType === 'banner') {
      // Banners display without bullet prefix
      const lines = event.content.split('\n').map(line => line.trimEnd());
      return `${lines.join('\n')}\n`;
    }

    // Compact, user-friendly formatting
    switch (event.type) {
      case 'prompt':
        // User prompt - just the text (prompt box handles styling)
        return `${theme.primary('>')} ${event.content}\n`;

      case 'thought': {
        // Programmatic filter: reject content that looks like internal/garbage output
        if (this.isGarbageOutput(event.content)) {
          return '';
        }
        const curated = this.curateReasoningContent(event.content);
        if (!curated || this.isGarbageOutput(curated)) {
          return '';
        }
        if (!this.shouldRenderThought(curated)) {
          return '';
        }
        this.lastCuratedThought = {
          text: curated.replace(/\s+/g, ' ').trim().toLowerCase(),
          at: Date.now(),
        };
        return this.formatThinkingBlock(curated);
      }

      case 'tool': {
        // Compact tool display: ⚡ToolName → result
        const content = event.content.replace(/^[⏺⚙○]\s*/, '');
        return this.formatCompactToolCall(content);
      }

      case 'tool-result': {
        // Inline result: └─ summary
        return this.formatCompactToolResult(event.content);
      }

      case 'build':
        return this.wrapBulletText(event.content, { label: 'build', labelColor: theme.warning });

      case 'test':
        return this.wrapBulletText(event.content, { label: 'test', labelColor: theme.info });

      case 'stream':
        return event.content;

      case 'response':
      default: {
        // Programmatic filter: reject content that looks like internal/garbage output
        if (this.isGarbageOutput(event.content)) {
          return '';
        }
        // Clean response without excessive bullets, wrapped for readability
        const isError = event.rawType === 'error';
        return this.wrapBulletText(event.content, isError ? { label: 'error', labelColor: theme.error } : undefined);
      }
    }
  }

  /**
   * Programmatic garbage detection - checks if content looks like internal/system output
   * that shouldn't be shown to users. Uses structural checks, not pattern matching.
   */
  private isGarbageOutput(content: string): boolean {
    if (!content || content.trim().length === 0) return true;

    // Structural check: content starting with < that isn't valid markdown/code
    if (content.startsWith('<') && !content.startsWith('<http') && !content.startsWith('<!')) {
      return true;
    }

    // Structural check: contains "to=functions." or "to=tools." (internal routing)
    if (content.includes('to=functions.') || content.includes('to=tools.')) {
      return true;
    }

    // Structural check: looks like internal instruction (quoted system text)
    if (content.startsWith('"') && content.includes('block') && content.includes('tool')) {
      return true;
    }

    // Structural check: very short content that's just timing info
    if (content.length < 30 && /elapsed|seconds?|ms\b/i.test(content)) {
      return true;
    }

    // Structural check: gibberish - high ratio of non-word characters
    const alphaCount = (content.match(/[a-zA-Z]/g) || []).length;
    const totalCount = content.replace(/\s/g, '').length;
    if (totalCount > 20 && alphaCount / totalCount < 0.5) {
      return true; // Less than 50% letters = likely garbage
    }

    return false;
  }

  private curateReasoningContent(content: string): string | null {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!normalized) return null;

    const limited =
      normalized.length > this.maxCuratedReasoningChars
        ? normalized.slice(0, this.maxCuratedReasoningChars)
        : normalized;

    const maxSegments = this.maxCuratedReasoningLines * 3;
    const segments = limited
      .split('\n')
      .flatMap(line => line.split(/(?<=[.?!])\s+/))
      .map(line => line.replace(/^[•*⏺○\-\u2022]+\s*/, '').trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const segment of segments) {
      const normalizedSegment = segment.replace(/\s+/g, ' ');
      const key = normalizedSegment.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(normalizedSegment);
      if (deduped.length >= maxSegments) {
        break;
      }
    }

    if (deduped.length === 0) {
      return null;
    }

    const prioritized = this.prioritizeReasoningSegments(deduped);
    if (prioritized.length === 0) {
      return null;
    }

    const limitedSelection = prioritized.slice(0, this.maxCuratedReasoningLines);
    const bulleted = limitedSelection.map(line => this.ensureReasoningBullet(line));

    return bulleted.join('\n');
  }

  private ensureReasoningBullet(line: string): string {
    if (/^([•*⏺○-]|\d+[.)])\s/.test(line)) {
      return line;
    }
    return `• ${line}`;
  }

  private looksStructuredThought(line: string): boolean {
    return (
      /^(\d+[.)]\s|step\s*\d+|plan\b|next\b|then\b|goal\b)/i.test(line) ||
      /^[-*•]\s/.test(line) ||
      line.includes('->') ||
      line.includes('→') ||
      line.includes(': ') ||
      /\b(test|verify|validate|check|build|run|deploy|diff|lint|type ?check|fix|bug|issue|risk|mitigate|investigate)\b/i.test(line)
    );
  }

  private prioritizeReasoningSegments(segments: string[]): string[] {
    if (!segments.length) {
      return [];
    }

    const scored = segments.map((text, index) => ({
      text,
      index,
      score: this.reasoningSignalScore(text),
    }));

    const hasSignal = scored.some(item => item.score > 0);
    if (!hasSignal) {
      return segments;
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    return scored.map(item => item.text);
  }

  private reasoningSignalScore(line: string): number {
    let score = 0;
    const lower = line.toLowerCase();

    if (this.looksStructuredThought(line)) {
      score += 3;
    }

    const actionKeywords = [
      'tool', 'command', 'script', 'context', 'summar', 'risk', 'issue',
      'investigate', 'root cause', 'remediat', 'mitigat', 'fix', 'patch',
      'test', 'verify', 'validate', 'check', 'build', 'deploy', 'run',
      'diff', 'lint', 'typecheck', 'benchmark',
    ];
    if (actionKeywords.some(keyword => lower.includes(keyword))) {
      score += 2;
    }

    if (/[#:→]|->/.test(line)) {
      score += 1;
    }

    if (/^(i('| a)m|i will|let me|starting|now|ok|sure)\b/i.test(line)) {
      score -= 1;
    }

    if (line.length > 120) {
      score -= 1;
    }

    return score;
  }

  private shouldRenderThought(content: string): boolean {
    const normalized = content.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    const now = Date.now();
    if (this.lastCuratedThought && this.lastCuratedThought.text === normalized) {
      if (now - this.lastCuratedThought.at < this.thoughtDedupWindowMs) {
        return false;
      }
    }

    return true;
  }

  /**
   * Format text in Claude Code style: ⏺ prefix with wrapped continuation lines
   * Example:
   *   ⏺ The AI ran tools but gave no response. Need to fix
   *     the response handling. Let me check where the AI's
   *     text response should be displayed:
   */
  private formatClaudeCodeBlock(content: string): string {
    const bullet = '⏺';
    const maxWidth = Math.max(24, Math.min(this.safeWidth() - 4, 110)); // Responsive to terminal width
    const lines = content.split('\n');
    const result: string[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]!;
      if (!line.trim()) {
        result.push('');
        continue;
      }

      // Word-wrap each line
      const words = line.split(/(\s+)/);
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + word).length > maxWidth && currentLine.trim()) {
          // First line of this paragraph gets ⏺, rest get indent
          const prefix = result.length === 0 && lineIdx === 0 ? `${bullet} ` : '  ';
          result.push(`${prefix}${currentLine.trimEnd()}`);
          currentLine = word.trimStart();
        } else {
          currentLine += word;
        }
      }

      if (currentLine.trim()) {
        const prefix = result.length === 0 && lineIdx === 0 ? `${bullet} ` : '  ';
        result.push(`${prefix}${currentLine.trimEnd()}`);
      }
    }

    return result.join('\n') + '\n';
  }

  /**
   * Format a tool call in Claude Code style:
   *   ⏺ Search(pattern: "foo", path: "src",
   *           output_mode: "content", head_limit: 30)
   */
  private formatToolCall(content: string): string {
    const bullet = '⏺';
    // Parse tool name and arguments
    const match = content.match(/^(\w+)\((.*)\)$/s);
    if (!match) {
      // Simple format without args
      const nameMatch = content.match(/^(\w+)/);
      if (nameMatch) {
        return `${bullet} ${theme.tool(nameMatch[1])}\n`;
      }
      return `${bullet} ${content}\n`;
    }

    const toolName = match[1];
    const argsStr = match[2]!;
    const maxWidth = Math.min(this.cols - 4, 56);

    // Format: ⏺ ToolName(args...)
    const prefix = `${bullet} ${theme.tool(toolName)}(`;
    const prefixLen = toolName!.length + 3; // "⏺ ToolName(" visible length
    const indent = ' '.repeat(prefixLen + 4); // Extra indent for wrapped args

    // Parse and format arguments
    const args = this.parseToolArgs(argsStr);
    if (args.length === 0) {
      return `${prefix})\n`;
    }

    const lines: string[] = [];
    let currentLine = prefix;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      const argText = `${theme.ui.muted(arg.key + ':')} ${this.formatArgValue(arg.key, arg.value)}`;
      const separator = i < args.length - 1 ? ', ' : ')';

      // Check if this arg fits on current line
      const testLine = currentLine + argText + separator;
      if (this.stripAnsi(testLine).length > maxWidth && currentLine !== prefix) {
        lines.push(currentLine.trimEnd());
        currentLine = indent + argText + separator;
      } else {
        currentLine += argText + separator;
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trimEnd());
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Parse tool arguments from string like: key: "value", key2: value2
   */
  private parseToolArgs(argsStr: string): Array<{ key: string; value: string }> {
    const args: Array<{ key: string; value: string }> = [];
    // Simple regex to extract key: value pairs
    const regex = /(\w+):\s*("(?:[^"\\]|\\.)*"|[^,)]+)/g;
    let match;
    while ((match = regex.exec(argsStr)) !== null) {
      args.push({ key: match[1]!, value: match[2]!.trim() });
    }
    return args;
  }

  /**
   * Format an argument value (truncate long strings)
   */
  private formatArgValue(key: string, value: string): string {
    // Remove surrounding quotes if present
    const isQuoted = value.startsWith('"') && value.endsWith('"');
    const inner = isQuoted ? value.slice(1, -1) : value;

    const lowerKey = key.toLowerCase();
    const shouldPreserve =
      lowerKey.includes('path') ||
      lowerKey === 'file' ||
      lowerKey === 'pattern' ||
      lowerKey === 'query' ||
      lowerKey === 'command' ||
      lowerKey === 'cmd';

    // Truncate long values when not explicitly preserving
    const maxLen = 40;
    const truncated = shouldPreserve || inner.length <= maxLen ? inner : inner.slice(0, maxLen - 3) + '...';

    return isQuoted ? `"${truncated}"` : truncated;
  }

  /**
   * Format a tool result in Claude Code style:
   *   ⎿  Found 12 lines (ctrl+o to expand)
   */
  private formatToolResult(content: string): string {
    // Check if this is a summary line (e.g., "Found X lines")
    const summaryMatch = content.match(/^(Found \d+ (?:lines?|files?|matches?)|Read \d+ lines?|Wrote \d+ lines?|Edited|Created|Deleted)/i);
    if (summaryMatch) {
      return `  ${theme.ui.muted('⎿')}  ${content} ${theme.ui.muted('(ctrl+o to expand)')}\n`;
    }

    // For other results, show truncated preview
    const lines = content.split('\n');
    if (lines.length > 3) {
      const preview = lines.slice(0, 2).join('\n');
      return `  ${theme.ui.muted('⎿')}  ${preview}\n  ${theme.ui.muted(`... ${lines.length - 2} more lines (ctrl+o to expand)`)}\n`;
    }

    return `  ${theme.ui.muted('⎿')}  ${content}\n`;
  }

  /**
   * Format a compact tool call: ⏺ Read → file.ts
   */
  private formatCompactToolCall(content: string): string {
    const bullet = '⏺';
    // Parse tool name and args
    const match = content.match(/^(\w+)\s*(?:\((.*)\))?$/s);
    if (!match) {
      return `${bullet} ${content}\n`;
    }

    const toolName = match[1]!;
    const argsStr = match[2]?.trim() || '';

    // If no args, just show tool name
    if (!argsStr) {
      return `${bullet} ${theme.tool(toolName)}\n`;
    }

    // Format full params in Claude Code style with line wrapping
    // For long args, wrap them nicely with continuation indent
    const prefix = `${bullet} ${theme.tool(toolName)}(`;
    const suffix = ')';
    const maxWidth = this.cols - 8; // Leave room for margins

    // Parse individual params
    const params = this.parseToolParams(argsStr);
    if (params.length === 0) {
      return `${prefix}${argsStr}${suffix}\n`;
    }

    // Format params with proper wrapping
    return this.formatToolParams(toolName, params, maxWidth);
  }

  /**
   * Parse tool params from args string
   */
  private parseToolParams(argsStr: string): Array<{ key: string; value: string }> {
    const params: Array<{ key: string; value: string }> = [];
    // Match key: "value" or key: value patterns
    const regex = /(\w+):\s*("(?:[^"\\]|\\.)*"|[^,\n]+)/g;
    let match;
    while ((match = regex.exec(argsStr)) !== null) {
      params.push({ key: match[1]!, value: match[2]!.trim() });
    }
    return params;
  }

  /**
   * Format tool params in Claude Code style with wrapping
   */
  private formatToolParams(
    toolName: string,
    params: Array<{ key: string; value: string }>,
    maxWidth: number
  ): string {
    const bullet = '⏺';
    const lines: string[] = [];
    const indent = '        '; // 8 spaces for continuation

    let currentLine = `${bullet} ${theme.tool(toolName)}(`;
    let firstParam = true;

    for (const param of params) {
      const coloredValue = this.colorParamValue(param.key, param.value);
      const paramText = `${param.key}: ${coloredValue}`;
      const paramStr = firstParam ? paramText : `, ${paramText}`;

      // Check if adding this param would exceed width
      const testLine = currentLine + paramStr;
      const plainLength = this.visibleLength(testLine);

      if (plainLength > maxWidth && !firstParam) {
        // Start new line
        lines.push(currentLine);
        currentLine = indent + paramText;
      } else {
        currentLine += paramStr;
      }
      firstParam = false;
    }

    currentLine += ')';
    lines.push(currentLine);

    return lines.join('\n') + '\n';
  }

  /**
   * Color critical parameter values (paths, commands) for readability.
  */
  private colorParamValue(key: string, value: string): string {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('path') || lowerKey === 'file' || lowerKey === 'pattern' || lowerKey === 'query') {
      return theme.warning(value);
    }
    if (lowerKey === 'command' || lowerKey === 'cmd') {
      return theme.tool(value);
    }
    return value;
  }

  /**
   * Extract a short summary from tool args
   */
  private extractToolSummary(toolName: string, argsStr: string): string | null {
    const tool = toolName.toLowerCase();

    // Extract path/file for file operations
    if (['read', 'write', 'edit', 'glob', 'grep', 'search'].includes(tool)) {
      const pathMatch = argsStr.match(/(?:path|file_path|pattern):\s*"([^"]+)"/);
      if (pathMatch) {
        const path = pathMatch[1]!;
        return theme.file?.path ? theme.file.path(path) : theme.ui.muted(path);
      }
    }

    // Extract command for bash
    if (tool === 'bash') {
      const cmdMatch = argsStr.match(/command:\s*"([^"]+)"/);
      if (cmdMatch) {
        const cmd = cmdMatch[1]!;
        return theme.ui.muted(cmd);
      }
    }

    return null;
  }

  /**
   * Format a compact tool result: ⎿  Found X lines (ctrl+o to expand)
   */
  private formatCompactToolResult(content: string): string {
    // Parse common result patterns for summary
    const lineMatch = content.match(/(\d+)\s*lines?/i);
    const fileMatch = content.match(/(\d+)\s*(?:files?|matches?)/i);
    const readMatch = content.match(/read.*?(\d+)\s*lines?/i);

    let summary: string;
    if (readMatch) {
      summary = `Read ${readMatch[1]} lines`;
    } else if (lineMatch) {
      summary = `Found ${lineMatch[1]} line${lineMatch[1] === '1' ? '' : 's'}`;
    } else if (fileMatch) {
      summary = `Found ${fileMatch[1]} file${fileMatch[1] === '1' ? '' : 's'}`;
    } else if (content.match(/^(success|ok|done|completed|written|edited|created)/i)) {
      summary = '✓';
    } else {
      // Use content directly, truncated if needed
      summary = content.length > 40 ? content.slice(0, 37) + '…' : content;
    }

    const coloredSummary = this.colorResultSummary(summary);
    return `  ${theme.ui.muted('⎿')}  ${coloredSummary} ${theme.ui.muted('(ctrl+o to expand)')}\n`;
  }

  private colorResultSummary(summary: string): string {
    if (!summary) return summary;
    const lower = summary.toLowerCase();
    if (lower.includes('fail') || lower.includes('error')) {
      return theme.error(summary);
    }
    if (summary.startsWith('✓') || lower.includes('updated') || lower.includes('created') || lower.includes('written')) {
      return theme.success(summary);
    }
    return theme.info(summary);
  }

  /**
   * Format a compact response with bullet on first line
   */
  private formatCompactResponse(content: string): string {
    return this.wrapBulletText(content);
  }

  /**
   * Wrap text with a single bullet on the first line and tidy indentation for readability.
   * Prevents awkward mid-word terminal wrapping by handling the layout ourselves.
   */
  private wrapBulletText(
    content: string,
    options: { maxWidth?: number; label?: string; labelColor?: (value: string) => string } = {}
  ): string {
    const bullet = '⏺';
    const cleaned = content.replace(/^[⏺•○]\s*/, '').trimEnd();
    if (!cleaned.trim()) {
      return '';
    }

    // Reserve a little margin to reduce terminal wrap jitter
    const availableWidth = this.safeWidth();
    const maxWidth = Math.max(20, Math.min(options.maxWidth ?? availableWidth - 2, availableWidth));
    const labelText = options.label
      ? `${options.labelColor ? options.labelColor(options.label) : options.label}${theme.ui.muted(' · ')}`
      : '';
    const bulletPrefix = `${bullet} ${labelText}`;
    const indent = ' '.repeat(this.visibleLength(`${bullet} `));

    const lines = cleaned.split('\n');
    const result: string[] = [];
    let firstNonEmpty = true;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        result.push(''); // Preserve intentional spacing between paragraphs
        continue;
      }

      const words = line.split(/\s+/);
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        const prefixLength = this.visibleLength(firstNonEmpty ? bulletPrefix : indent);
        if (prefixLength + this.visibleLength(candidate) > maxWidth && current) {
          result.push(`${firstNonEmpty ? bulletPrefix : indent}${current}`);
          current = word;
          firstNonEmpty = false;
        } else {
          current = candidate;
        }
      }

      if (current) {
        result.push(`${firstNonEmpty ? bulletPrefix : indent}${current}`);
        firstNonEmpty = false;
      }
    }

    return result.join('\n') + '\n';
  }

  /**
   * Format thinking block with enhanced visual design.
   * Uses a distinct visual style to clearly separate thinking from responses.
   *
   * In plain output mode we keep it simple and inline with the rest of the
   * stream so transcripts remain easy to scan.
   */
  private formatThinkingBlock(content: string): string {
    if (!content.trim()) return '';

    const normalized = content.replace(/\s+/g, ' ').trim();
    return this.wrapBulletText(normalized, {
      label: 'thinking',
      labelColor: theme.info ?? ((value: string) => value),
    });
  }

  private wrapTextToWidth(text: string, width: number): string[] {
    if (!text.trim()) return [''];
    const lines: string[] = [];
    const words = text.trim().split(/\s+/);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.visibleLength(candidate) > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines;
  }

  /**
   * Format streaming elapsed time in Claude Code style: 3m 30s
   */
  private formatStreamingElapsed(): string | null {
    if (!this.streamingStartTime) return null;
    const elapsed = Math.floor((Date.now() - this.streamingStartTime) / 1000);
    if (elapsed < 5) return null; // Don't show for very short durations
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }

  /**
   * Format a compact conversation block (Claude Code style)
   * Shows a visual separator with "history" label and ctrl+o hint
   */
  private formatCompactBlock(content: string, label: string = 'history'): string {
    const maxWidth = Math.min(this.cols, 80);
    const labelText = ` ${label} `;
    const padding = Math.max(0, maxWidth - labelText.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = Math.ceil(padding / 2);

    // Claude Code style: ══ history ═════════════
    const separator = theme.ui.muted('═'.repeat(leftPad) + labelText + '═'.repeat(rightPad));

    return `\n${separator}\n${content}\n`;
  }

  /**
   * Add a compact conversation block to the event queue
   * This displays a collapsed view with expansion hint (Claude Code style)
   */
  addCompactBlock(content: string, label: string = 'history'): void {
    const formattedContent = this.formatCompactBlock(content, label);
    this.eventQueue.push({
      type: 'response',
      rawType: 'response',
      content: formattedContent,
      timestamp: Date.now(),
      isCompacted: true,
    });
    if (!this.isProcessingQueue) {
      void this.processQueue();
    }
  }

  /**
   * Expand the most recent tool result inline (Ctrl+O support).
   */
  expandLastToolResult(): boolean {
    if (!this.lastToolResult) {
      return false;
    }
    const rendered = this.wrapBulletText(this.lastToolResult, { label: 'tool', labelColor: theme.info });
    this.eventQueue.push({
      type: 'response',
      rawType: 'response',
      content: rendered,
      timestamp: Date.now(),
      isCompacted: false,
    });
    if (!this.isProcessingQueue) {
      void this.processQueue();
    }
    return true;
  }

  // ------------ Status / mode ------------

  setMode(mode: 'idle' | 'streaming'): void {
    const wasStreaming = this.mode === 'streaming';
    this.mode = mode;

    // Track streaming start time for elapsed display
    if (mode === 'streaming' && !wasStreaming) {
      this.streamingStartTime = Date.now();
      this.streamingTokens = 0; // Reset token count
      // Clear inline panel when entering streaming mode to prevent stale menus
      if (this.inlinePanel.length > 0) {
        this.inlinePanel = [];
      }
      this.startSpinnerAnimation();
    } else if (mode === 'idle' && wasStreaming) {
      this.streamingStartTime = null;
      this.stopSpinnerAnimation();
    }

    if (wasStreaming && mode === 'idle' && !this.lastOutputEndedWithNewline) {
      // Finish streaming on a fresh line so the next prompt/event doesn't collide
      this.write('\n');
      this.lastOutputEndedWithNewline = true;
    }
    if (!this.plainMode) {
      // Always render prompt to keep bottom UI persistent (rich mode only)
      this.renderPrompt();
    }
  }

  /**
   * Start the animated spinner for streaming status
   */
  private startSpinnerAnimation(): void {
    if (this.spinnerInterval) return; // Already running
    this.spinnerFrame = 0;
    this.activityStarFrame = 0;
    this.activityScrollOffset = 0;
    this.activityScrollDirection = 1;
    this.elapsedColorFrame = 0;
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % spinnerFrames.braille.length;
      this.activityStarFrame = (this.activityStarFrame + 1) % this.activityStarFrames.length;
      // Update elapsed time color animation (slower cycle)
      if (this.spinnerFrame % 3 === 0) {
        this.elapsedColorFrame = (this.elapsedColorFrame + 1) % this.elapsedColorFrames.length;
      }
      // Update horizontal scroll for long activity lines (slower scroll)
      if (this.spinnerFrame % 4 === 0) {
        this.activityScrollOffset += this.activityScrollDirection;
      }
      // Re-render to show updated spinner/star frame
      if (!this.plainMode && this.mode === 'streaming') {
        this.renderPrompt();
      }
    }, 80); // ~12 FPS for smooth spinner animation
  }

  /**
   * Stop the animated spinner
   */
  private stopSpinnerAnimation(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
    this.spinnerFrame = 0;
    this.activityStarFrame = 0;
    this.activityMessage = null;
    this.activityScrollOffset = 0;
    this.activityScrollDirection = 1;
    this.elapsedColorFrame = 0;
  }

  /**
   * Set the activity message displayed with animated star
   * Example: "Ruminating…" shows as "✳ Ruminating… (esc to interrupt · 34s · ↑1.2k)"
   */
  setActivity(message: string | null): void {
    this.activityMessage = message;
    if (!this.plainMode) {
      this.renderPrompt();
    }
  }

  /**
   * Update the token count displayed in the activity line
   */
  updateStreamingTokens(tokens: number): void {
    this.streamingTokens = tokens;
  }

  /**
   * Format token count as compact string (e.g., 1.2k, 24k, 128k)
   */
  private formatTokenCount(tokens: number): string {
    if (tokens < 1000) return String(tokens);
    if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`;
    return `${Math.round(tokens / 1000)}k`;
  }

  getMode(): 'idle' | 'streaming' {
    return this.mode;
  }

  updateStatus(message: string | null): void {
    this.updateStatusBundle({ main: message, override: null, streaming: null });
  }

  updateStatusBundle(
    status: { main?: string | null; override?: string | null; streaming?: string | null },
    options: { render?: boolean } = {}
  ): void {
    const prevStreaming = this.statusStreaming;
    let changed = false;
    let mainChanged = false;
    let overrideChanged = false;

    if (status.main !== undefined && status.main !== this.statusMessage) {
      this.statusMessage = status.main;
      changed = true;
      mainChanged = true;
    }
    if (status.override !== undefined && status.override !== this.statusOverride) {
      this.statusOverride = status.override;
      changed = true;
      overrideChanged = true;
    }

    const streamingChanged = status.streaming !== undefined && status.streaming !== prevStreaming;
    if (status.streaming !== undefined) {
      if (streamingChanged) {
        changed = true;
      }
      this.statusStreaming = status.streaming;
    }

    const streamingIntroduce =
      streamingChanged && prevStreaming === null && status.streaming !== null && this.mode === 'streaming';
    const streamingCleared =
      streamingChanged && status.streaming === null && this.mode === 'streaming';
    const onlyStreamingChanged = streamingChanged && !mainChanged && !overrideChanged;
    const skipStreamingRender =
      onlyStreamingChanged && this.mode === 'streaming' && !streamingIntroduce && !streamingCleared;

    const shouldRender = options.render !== false && changed && !skipStreamingRender;
    if (shouldRender) {
      this.renderPrompt();
    }
  }

  updateStatusMeta(
    meta: {
      model?: string;
      provider?: string;
      sessionTime?: string;
      contextPercent?: number;
      profile?: string;
      workspace?: string;
      directory?: string;
      writes?: string;
      sessionLabel?: string;
      thinkingLabel?: string;
      autosave?: boolean;
      version?: string;
      toolSummary?: string;
    },
    options: { render?: boolean } = {}
  ): void {
    const next = { ...this.statusMeta, ...meta };
    const changed = JSON.stringify(next) !== JSON.stringify(this.statusMeta);
    this.statusMeta = next;
    const shouldRender = options.render !== false && changed;
    if (shouldRender) {
      this.renderPrompt();
    }
  }

  updateModeToggles(state: Partial<ModeToggleState>): void {
    this.toggleState = { ...this.toggleState, ...state };
    if (
      !state.verificationHotkey &&
      !state.thinkingHotkey &&
      !state.criticalApprovalHotkey &&
      !state.autoContinueHotkey &&
      !state.dualRlHotkey &&
      !state.debugHotkey
    ) {
      this.hotkeysInToggleLine.clear();
    }
    this.renderPrompt();
  }

  setInlinePanel(lines: string[]): void {
    const normalized = (lines ?? []).map(line => line.replace(/\s+$/g, ''));
    const hasContent = normalized.some((line) => line.trim().length > 0);
    if (!hasContent) {
      if (this.inlinePanel.length) {
        this.inlinePanel = [];
        this.renderPrompt();
      }
      return;
    }
    const limited = this.limitInlinePanel(normalized);
    if (JSON.stringify(limited) === JSON.stringify(this.inlinePanel)) {
      return;
    }
    this.inlinePanel = limited;
    this.renderPrompt();
  }

  supportsInlinePanel(): boolean {
    return this.interactive && !this.plainMode;
  }

  clearInlinePanel(): void {
    if (!this.inlinePanel.length) return;
    this.inlinePanel = [];
    this.renderPrompt();
  }

  private limitInlinePanel(lines: string[]): string[] {
    const maxLines = Math.max(4, Math.min(this.maxInlinePanelLines, Math.max(2, this.rows - 8)));
    if (lines.length <= maxLines) {
      return lines;
    }
    const overflow = lines.length - maxLines;
    const indicator = theme.ui.muted(`… ${overflow} more lines`);
    const tailCount = Math.max(1, maxLines - 1);
    const tail = lines.slice(-tailCount);
    return [indicator, ...tail];
  }

  // ------------ Prompt rendering ------------

  private renderPrompt(): void {
    // Don't render if disposed
    if (this.disposed) return;

    // Throttle renders to prevent excessive redraws during rapid input
    const now = Date.now();
    if (now - this.lastRenderTime < this.renderThrottleMs) {
      if (!this.pendingRender) {
        this.pendingRender = true;
        // Track the timer for cleanup
        this.renderThrottleTimer = setTimeout(() => {
          this.renderThrottleTimer = null;
          this.pendingRender = false;
          if (!this.disposed) {
            this.renderPromptImmediate();
          }
        }, this.renderThrottleMs);
      }
      return;
    }
    this.renderPromptImmediate();
  }

  private renderPromptImmediate(): void {
    // Don't render if disposed
    if (this.disposed) return;

    this.lastRenderTime = Date.now();

    if (!this.interactive) {
      this.isPromptActive = false;
      return;
    }

    if (this.promptRenderingSuspended) {
      this.isPromptActive = false;
      return;
    }

    if (this.plainMode) {
      const line = `> ${this.buffer}`;
      if (!this.isPromptActive && !this.lastOutputEndedWithNewline) {
        this.write('\n');
        this.lastOutputEndedWithNewline = true;
      }
      this.write(`\r${ESC.CLEAR_LINE}${line}`);
      this.cursorVisibleColumn = line.length + 1;
      this.hasRenderedPrompt = true;
      this.isPromptActive = true;
      this.lastOutputEndedWithNewline = false; // prompt ends mid-line by design
      this.promptHeight = 1;
      return;
    }

    if (!this.allowPromptRender) {
      return;
    }

    // Rich inline mode: prompt flows naturally with content
    this.updateTerminalSize();
    const maxWidth = this.safeWidth();
    this.lastRenderWidth = maxWidth;

    const overlay = this.buildOverlayLines();
    if (!overlay.lines.length) {
      return;
    }

    const renderedLines = overlay.lines.map(line => this.truncateLine(line, maxWidth));
    if (!renderedLines.length) {
      return;
    }

    const promptIndex = Math.max(0, Math.min(overlay.promptIndex, renderedLines.length - 1));
    const height = renderedLines.length;

    // Clear previous prompt and handle height changes
    // Note: We check lastOverlayHeight > 0 to know if there's something to clear,
    // but we use lastOverlay?.promptIndex for cursor positioning (defaulting to 0 if cleared)
    if (this.hasEverRenderedOverlay && this.lastOverlayHeight > 0) {
      // Move up from prompt row to top of overlay
      const linesToTop = this.lastOverlay?.promptIndex ?? 0;
      if (linesToTop > 0) {
        this.write(`\x1b[${linesToTop}A`);
      }

      // Clear all previous lines
      for (let i = 0; i < this.lastOverlayHeight; i++) {
        this.write('\r');
        this.write(ESC.CLEAR_LINE);
        if (i < this.lastOverlayHeight - 1) {
          this.write('\x1b[B');
        }
      }

      // If new height is greater, we need to add blank lines
      const extraLines = height - this.lastOverlayHeight;
      if (extraLines > 0) {
        for (let i = 0; i < extraLines; i++) {
          this.write('\n');
        }
      }

      // Move back to top of where overlay should start
      const moveBackUp = Math.max(0, height - 1);
      if (moveBackUp > 0) {
        this.write(`\x1b[${moveBackUp}A`);
      }
    }

    // Write prompt lines (no trailing newline on last line)
    for (let i = 0; i < renderedLines.length; i++) {
      this.write('\r');
      this.write(ESC.CLEAR_LINE);
      this.write(renderedLines[i] || '');
      if (i < renderedLines.length - 1) {
        this.write('\n');
      }
    }

    // Position cursor at prompt input line
    const promptCol = Math.min(Math.max(1, 3 + this.cursor), this.cols || 80);
    // Cursor is now at the last line. Move up to the prompt row.
    const linesToMoveUp = height - 1 - promptIndex;
    if (linesToMoveUp > 0) {
      this.write(`\x1b[${linesToMoveUp}A`);
    }
    this.write(`\x1b[${promptCol}G`);

    this.cursorVisibleColumn = promptCol;
    this.hasRenderedPrompt = true;
    this.hasEverRenderedOverlay = true;
    this.isPromptActive = true;
    this.lastOverlayHeight = height;
    this.lastOverlay = { lines: renderedLines, promptIndex };
    this.lastOutputEndedWithNewline = false;
    this.promptHeight = height;
  }

  private buildOverlayLines(): { lines: string[]; promptIndex: number } {
    const lines: string[] = [];
    const maxWidth = this.safeWidth();
    // Simple horizontal divider - clean and reliable
    const divider = theme.ui.muted('─'.repeat(maxWidth));

    const fallbackActivity = (() => {
      const raw = this.statusStreaming || this.statusOverride || this.statusMessage;
      if (!raw) return null;
      const cleaned = this.stripAnsi(raw).replace(/^[⏺•]\s*/, '').trim();
      return cleaned || null;
    })();

    // Activity line (only when streaming) - shows: ◐ Working… (esc to interrupt · 34s)
    if (this.mode === 'streaming' && (this.activityMessage || fallbackActivity)) {
      // Clean spinner animation using braille dots + shimmer accent for a richer feel
      const spinnerChars = spinnerFrames.braille;
      const spinnerChar = spinnerChars[this.spinnerFrame % spinnerChars.length] ?? '⠋';
      const starChar = this.activityStarFrames[this.activityStarFrame % this.activityStarFrames.length] ?? '✶';
      const spinnerDecorated = `${theme.info(spinnerChar)}${theme.accent ? theme.accent(starChar) : starChar}`;
      const elapsed = this.formatStreamingElapsed();
      const genericActivities = ['Streaming', 'Thinking', 'Processing'];
      let displayActivity = this.activityMessage || fallbackActivity || '';
      if (genericActivities.includes(displayActivity) && fallbackActivity) {
        displayActivity = fallbackActivity;
      }
      if (!displayActivity.trim()) {
        displayActivity = fallbackActivity || 'Working';
      }
      const needsEllipsis = !displayActivity.trimEnd().endsWith('…') && !displayActivity.trimEnd().endsWith('...');
      // Format: ⠋ Working… (esc to interrupt · 1m 19s · ↑1.2k tokens)
      // Build parts with animated elapsed time color
      const elapsedColor = chalk.hex(this.elapsedColorFrames[this.elapsedColorFrame % this.elapsedColorFrames.length] ?? '#F59E0B');
      const parts: string[] = ['esc to interrupt'];
      if (elapsed) parts.push(elapsedColor(elapsed));
      if (this.streamingTokens > 0) {
        parts.push(`↑${this.formatTokenCount(this.streamingTokens)} tokens`);
      }
      const prefix = `${spinnerDecorated} `;
      const activityText = `${displayActivity.trim()}${needsEllipsis ? '…' : ''}`;
      const suffix = ` ${theme.ui.muted('(')}${parts.join(theme.ui.muted(' · '))}${theme.ui.muted(')')}`;

      // Build the full activity line with animated color for elapsed time
      const activityLine = `${prefix}${activityText}${suffix}`;

      // Always show full text - wrap to multiple lines if needed
      const indent = ' '.repeat(this.visibleLength(prefix));
      const wrapped = this.wrapOverlayLine(activityLine, maxWidth, indent);
      lines.push(...wrapped);
    }

    // Top divider
    lines.push(divider);

    // Input prompt line
    const promptIndex = lines.length;
    const inputLine = this.buildInputLine();
    // Handle multi-line input by splitting on newlines
    const inputLines = inputLine.split('\n');
    for (const line of inputLines) {
      lines.push(this.truncateLine(line, maxWidth));
    }

    // Bottom divider
    lines.push(divider);

    // Inline panel (pinned scroll box for live output/menus)
    if (this.inlinePanel.length > 0) {
      for (const panelLine of this.inlinePanel) {
        lines.push(this.truncateLine(`  ${panelLine}`, maxWidth));
      }
      // Separate inline content from suggestions/toggles
      lines.push(divider);
    }

    // Slash command suggestions
    if (this.suggestions.length > 0) {
      for (let index = 0; index < this.suggestions.length; index++) {
        const suggestion = this.suggestions[index]!;
        const isActive = index === this.suggestionIndex;
        const marker = isActive ? theme.primary('▸') : theme.ui.muted(' ');
        const cmdText = isActive ? theme.primary(suggestion.command) : theme.ui.muted(suggestion.command);
        const descText = isActive ? suggestion.description : theme.ui.muted(suggestion.description);
        lines.push(this.truncateLine(`  ${marker} ${cmdText} — ${descText}`, maxWidth));
      }
    }

    // Model and context info
    const modelContextLine = this.buildModelContextLine();
    if (modelContextLine) {
      lines.push(this.truncateLine(`  ${modelContextLine}`, maxWidth));
    }

    // Status + meta block (includes dir/version/tool summary)
    const chromeLines = this.buildChromeLines();
    if (chromeLines.length) {
      for (const chromeLine of chromeLines) {
        lines.push(this.truncateLine(`  ${chromeLine}`, maxWidth));
      }
    }

    // Mode toggles
    const toggleLines = this.buildInlineToggleLine();
    if (toggleLines.length > 0) {
      for (const toggleLine of toggleLines) {
        lines.push(this.truncateLine(`  ${toggleLine}`, maxWidth));
      }
      const legendLines = this.buildToggleLegend();
      for (const legend of legendLines) {
        lines.push(this.truncateLine(`  ${legend}`, maxWidth));
      }
    }

    // Help hint
    lines.push(this.truncateLine(`  ${theme.ui.muted('? for shortcuts')}`, maxWidth));

    return { lines, promptIndex };
  }

  /**
   * Build model name and context usage line with mini progress bar
   * Format: gpt-4 · ████░░ 85% context
   */
  private buildModelContextLine(): string | null {
    const parts: string[] = [];

    // Model name (provider / model or just model)
    const model = this.statusMeta.provider && this.statusMeta.model
      ? `${this.statusMeta.provider} · ${this.statusMeta.model}`
      : this.statusMeta.model || this.statusMeta.provider;
    if (model) {
      parts.push(theme.info(model));
    }

    // Context meter with mini progress bar (shows used percentage, not remaining)
    if (this.statusMeta.contextPercent !== undefined) {
      const used = Math.min(100, Math.max(0, this.statusMeta.contextPercent));
      const barWidth = 6;
      const filled = Math.round((used / 100) * barWidth);
      const empty = barWidth - filled;
      // Color based on how full the context is (green=low usage, yellow=medium, red=high)
      const barColor = used < 50 ? theme.success : used < 80 ? theme.warning : theme.error;
      const bar = barColor('█'.repeat(filled)) + theme.ui.muted('░'.repeat(empty));
      parts.push(`${bar} ${barColor(`${used}%`)} ${theme.ui.muted('ctx')}`);
    }

    return parts.length > 0 ? parts.join(theme.ui.muted('  ·  ')) : null;
  }

  /**
   * Build inline toggle controls - Claude Code style
   * Format: ⏵⏵ accept edits on (shift+tab to cycle)
   * Returns wrapped lines to ensure all toggles (including RL) are visible below the chat box.
   */
  /**
   * Build unified toggle status line with color-coded states and integrated explanations.
   * Each toggle has a distinct color for easy identification.
   */
  private buildInlineToggleLine(): string[] {
    const autoContinueActive = this.toggleState.autoContinueEnabled ?? false;
    const verificationActive = this.toggleState.verificationEnabled ?? false;
    const approvalMode = this.toggleState.criticalApprovalMode || 'auto';
    const thinkingLabel = (this.toggleState.thinkingModeLabel || 'balanced').trim().toLowerCase();

    // Build unified toggle segments with DISTINCT colors for each toggle
    const toggles: string[] = [];

    // 1. RL mode (CYAN) - multi-agent vs single-pass
    const rlOn = this.toggleState.dualRlEnabled;
    const rlIcon = rlOn ? '🤖' : '⚡';
    const rlStatus = rlOn ? theme.info('dual') : theme.ui.muted('single');
    const rlExplain = rlOn ? 'multi-agent' : 'one-pass';
    toggles.push(`${rlIcon} ${rlStatus} ${theme.ui.muted('[⌥D]')} ${theme.ui.muted(rlExplain)}`);

    // 2. Auto-continue (MAGENTA/PURPLE) - keep going until done
    const contIcon = autoContinueActive ? '🔄' : '⏸';
    const contStatus = autoContinueActive ? theme.primary('loop') : theme.ui.muted('stop');
    const contExplain = autoContinueActive ? 'until done' : 'each response';
    toggles.push(`${contIcon} ${contStatus} ${theme.ui.muted('[⌥G]')} ${theme.ui.muted(contExplain)}`);

    // 3. Verify (YELLOW) - auto-tests after edits
    const verifyIcon = verificationActive ? '✓' : '○';
    const verifyStatus = verificationActive ? theme.warning('test') : theme.ui.muted('skip');
    const verifyExplain = verificationActive ? 'auto-test' : 'no tests';
    toggles.push(`${verifyIcon} ${verifyStatus} ${theme.ui.muted('[⌥V]')} ${theme.ui.muted(verifyExplain)}`);

    // 4. Approvals (GREEN/ORANGE) - auto or ask for permission
    const apprIcon = approvalMode === 'approval' ? '🛡' : '✔';
    const apprStatus = approvalMode === 'approval' ? theme.warning('ask') : theme.success('auto');
    const apprExplain = approvalMode === 'approval' ? 'confirm all' : 'auto-approve';
    toggles.push(`${apprIcon} ${apprStatus} ${theme.ui.muted('[⌥A]')} ${theme.ui.muted(apprExplain)}`);

    // 5. Thinking (BLUE) - balanced or deep reasoning
    const thinkingIsDeep = thinkingLabel === 'extended' || thinkingLabel === 'deep';
    const thinkIcon = thinkingIsDeep ? '🧠' : '💭';
    const thinkStatus = thinkingIsDeep ? theme.info('deep') : theme.ui.muted('quick');
    const thinkExplain = thinkingIsDeep ? 'thorough' : 'concise';
    toggles.push(`${thinkIcon} ${thinkStatus} ${theme.ui.muted('[TAB]')} ${theme.ui.muted(thinkExplain)}`);

    // 6. Debug logging indicator (RED) - toggle shows whether console logging is enabled
    const debugActive = this.toggleState.debugEnabled ?? false;
    const debugIcon = debugActive ? '🐞' : '🔍';
    const debugStatus = debugActive ? theme.warning('debug on') : theme.ui.muted('debug off');
    const debugExplain = debugActive ? 'verbose logs' : 'silent';
    toggles.push(`${debugIcon} ${debugStatus} ${theme.ui.muted('[/debug]')} ${theme.ui.muted(debugExplain)}`);

    // 7. Shortcut hint
    toggles.push(`${theme.ui.muted('? help')}`);

    const maxWidth = Math.max(10, this.safeWidth() - 2);
    return this.wrapSegments(toggles, maxWidth);
  }

  /**
   * @deprecated Legend is now integrated into buildInlineToggleLine for unified display
   */
  private buildToggleLegend(): string[] {
    // Legend explanations now integrated directly into toggle line
    return [];
  }

  private buildChromeLines(): string[] {
    const maxWidth = this.safeWidth();
    const statusLines = this.buildStatusBlock(maxWidth);
    const metaLines = this.buildMetaBlock(maxWidth);
    return [...statusLines, ...metaLines];
  }

  private abbreviatePath(pathValue: string): string {
    const home = homedir();
    if (home && pathValue.startsWith(home)) {
      return pathValue.replace(home, '~');
    }
    return pathValue;
  }

  private buildStatusBlock(maxWidth: number): string[] {
    const statusLabel = this.composeStatusLabel();
    if (!statusLabel) {
      return [];
    }

    const segments: string[] = [];

    // Add animated spinner when streaming for dynamic visual feedback
    if (this.mode === 'streaming') {
      const spinnerChars = spinnerFrames.braille;
      const spinnerChar = spinnerChars[this.spinnerFrame % spinnerChars.length] ?? '⠋';
      segments.push(`${theme.info(spinnerChar)} ${this.applyTone(statusLabel.text, statusLabel.tone)}`);
    } else {
      segments.push(`${theme.ui.muted('status')} ${this.applyTone(statusLabel.text, statusLabel.tone)}`);
    }

    if (this.statusMeta.sessionTime) {
      segments.push(`${theme.ui.muted('runtime')} ${theme.ui.muted(this.statusMeta.sessionTime)}`);
    }

    if (this.statusMeta.contextPercent !== undefined) {
      // Use animated context meter for smooth color transitions
      this.contextMeter.update(this.statusMeta.contextPercent);
      segments.push(this.contextMeter.render());
    }

    return this.wrapSegments(segments, maxWidth);
  }

  private buildMetaBlock(maxWidth: number): string[] {
    const segments: string[] = [];

    if (this.statusMeta.profile) {
      segments.push(this.formatMetaSegment('profile', this.statusMeta.profile, 'info'));
    }

    const model = this.statusMeta.provider && this.statusMeta.model
      ? `${this.statusMeta.provider} / ${this.statusMeta.model}`
      : this.statusMeta.model || this.statusMeta.provider;
    if (model) {
      segments.push(this.formatMetaSegment('model', model, 'info'));
    }

    const workspace = this.statusMeta.workspace || this.statusMeta.directory;
    if (workspace) {
      segments.push(this.formatMetaSegment('dir', this.abbreviatePath(workspace), 'muted'));
    }

    if (this.statusMeta.writes) {
      segments.push(this.formatMetaSegment('writes', this.statusMeta.writes, 'muted'));
    }

    if (this.statusMeta.toolSummary) {
      segments.push(this.formatMetaSegment('tools', this.statusMeta.toolSummary, 'muted'));
    }

    if (this.statusMeta.sessionLabel) {
      segments.push(this.formatMetaSegment('session', this.statusMeta.sessionLabel, 'muted'));
    }

    if (this.statusMeta.version) {
      segments.push(this.formatMetaSegment('build', `v${this.statusMeta.version}`, 'muted'));
    }

    if (segments.length === 0) {
      return [];
    }

    return this.wrapSegments(segments, maxWidth);
  }

  private composeStatusLabel(): { text: string; tone: 'success' | 'info' | 'warn' | 'error' } | null {
    const statuses = [this.statusStreaming, this.statusOverride, this.statusMessage].filter(
      (value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index
    );
    const text = statuses.length > 0 ? statuses.join(' / ') : 'Ready for prompts';
    if (!text.trim()) {
      return null;
    }
    const normalized = text.toLowerCase();
    const tone: 'success' | 'info' | 'warn' | 'error' = normalized.includes('ready') ? 'success' : 'info';
    return { text, tone };
  }

  private formatMetaSegment(
    label: string,
    value: string,
    tone: 'info' | 'success' | 'warn' | 'error' | 'muted'
  ): string {
    const colorizer =
      tone === 'success'
        ? theme.success
        : tone === 'warn'
          ? theme.warning
          : tone === 'error'
            ? theme.error
            : tone === 'muted'
              ? theme.ui.muted
              : theme.info;
    return `${theme.ui.muted(label)} ${colorizer(value)}`;
  }

  private applyTone(text: string, tone: 'success' | 'info' | 'warn' | 'error'): string {
    switch (tone) {
      case 'success':
        return theme.success(text);
      case 'warn':
        return theme.warning(text);
      case 'error':
        return theme.error(text);
      case 'info':
      default:
        return theme.info(text);
    }
  }

  private wrapSegments(segments: string[], maxWidth: number): string[] {
    const lines: string[] = [];
    const separator = theme.ui.muted('  |  ');

    let current = '';
    for (const segment of segments) {
      const normalized = segment.trim();
      if (!normalized) continue;
      if (!current) {
        current = this.truncateLine(normalized, maxWidth);
        continue;
      }
      const candidate = `${current}${separator}${normalized}`;
      if (this.visibleLength(candidate) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(this.truncateLine(current, maxWidth));
        current = this.truncateLine(normalized, maxWidth);
      }
    }

    if (current) {
      lines.push(this.truncateLine(current, maxWidth));
    }

    return lines;
  }

  private buildControlLines(): string[] {
    const lines: string[] = [];
    const toggleLine = this.buildToggleLine();
    if (toggleLine) {
      lines.push(`${theme.ui.muted('modes')} ${theme.ui.muted('›')} ${toggleLine}`);
    }

    const shortcutLine = this.buildShortcutLine();
    if (shortcutLine) {
      lines.push(`${theme.ui.muted('keys')}  ${shortcutLine}`);
    }

    return lines;
  }

  /**
   * Build a compact toggle line like Claude Code:
   * "⏵⏵ accept edits on (shift+tab to cycle)"
   */
  private buildCompactToggleLine(): string | null {
    // Show the most relevant mode based on current state
    const parts: string[] = [];
    const verificationActive = this.toggleState.verificationEnabled || this.toggleState.autoContinueEnabled;

    // Edit mode indicator
    const editIcon = '⏵⏵';
    const editState = verificationActive ? 'approval required' : 'accept edits';
    parts.push(`${theme.ui.muted(editIcon)} ${editState} ${theme.success('on')}`);

    // Thinking mode (if active)
    const thinkingLabel = (this.toggleState.thinkingModeLabel || '').trim().toLowerCase();
    if (thinkingLabel && thinkingLabel !== 'off') {
      parts.push(`${theme.ui.muted('thinking')} ${theme.info(thinkingLabel)}`);
    }

    // Cycle hint
    const cycleHint = theme.ui.muted('(shift+tab to cycle)');

    if (parts.length === 0) {
      return null;
    }

    return `  ${parts.join(theme.ui.muted(' · '))} ${cycleHint}`;
  }

  private buildToggleLine(): string | null {
    const toggles: Array<{
      label: string;
      on: boolean;
      value?: string;
      hotkey?: string | null;
    }> = [];

    const addToggle = (label: string, on: boolean, hotkey?: string, value?: string) => {
      toggles.push({ label, on, hotkey: this.formatHotkey(hotkey), value });
    };

    const autoVerifyActive = this.toggleState.autoContinueEnabled ?? false;
    const verificationActive = this.toggleState.verificationEnabled || autoVerifyActive;
    const verifyValue = autoVerifyActive
      ? 'auto'
      : verificationActive
        ? 'on'
        : 'off';

    addToggle('Verify', verificationActive, this.toggleState.verificationHotkey, verifyValue);
    const approvalMode = this.toggleState.criticalApprovalMode || 'auto';
    const approvalActive = approvalMode !== 'auto';
    addToggle(
      'Approvals',
      approvalActive,
      this.toggleState.criticalApprovalHotkey,
      approvalMode === 'auto' ? 'auto' : 'ask'
    );

    const autoContinueActive = autoVerifyActive;
    addToggle(
      'Auto-continue',
      autoContinueActive,
      this.toggleState.autoContinueHotkey,
      autoContinueActive ? 'auto-verify' : 'off'
    );

    const thinkingLabelRaw = (this.toggleState.thinkingModeLabel || 'balanced').trim();
    const thinkingLabel =
      thinkingLabelRaw.toLowerCase() === 'extended' ? 'deep' : thinkingLabelRaw || 'balanced';
    const thinkingActive = thinkingLabel.length > 0;
    addToggle('Thinking', thinkingActive, this.toggleState.thinkingHotkey, thinkingLabel);

    const dualRlActive = this.toggleState.dualRlEnabled ?? false;
    const modeValue = dualRlActive ? 'dual-rl-cont' : 'single-cont';
    addToggle('Mode', dualRlActive, this.toggleState.dualRlHotkey, modeValue);

    const buildLine = (includeHotkeys: boolean): string => {
      return toggles
        .map(toggle => {
          const stateText = toggle.on ? theme.success(toggle.value || 'on') : theme.ui.muted(toggle.value || 'off');
          const hotkeyText =
            includeHotkeys && toggle.hotkey ? theme.ui.muted(` [${toggle.hotkey}]`) : '';
          return `${theme.ui.muted(`${toggle.label}:`)} ${stateText}${hotkeyText}`;
        })
        .join(theme.ui.muted('  '));
    };

    const maxWidth = this.safeWidth();
    let line = buildLine(true);

    // Record which hotkeys are actually shown so the shortcut line can avoid duplicates
    this.hotkeysInToggleLine = new Set(
      toggles
        .map(toggle => (toggle.hotkey ? toggle.hotkey : null))
        .filter((key): key is string => Boolean(key))
    );

    // If the line is too wide, drop hotkey hints to preserve all toggle labels
    if (this.visibleLength(line) > maxWidth) {
      this.hotkeysInToggleLine.clear();
      line = buildLine(false);
    }

    return line.trim() ? line : null;
  }

  private buildShortcutLine(): string | null {
    const parts: string[] = [];

    const addHotkey = (label: string, combo?: string) => {
      const normalized = this.formatHotkey(combo);
      if (!normalized) return;
      if (this.hotkeysInToggleLine.has(normalized)) {
        return;
      }
      parts.push(`${theme.info(normalized)} ${theme.ui.muted(label)}`);
    };

    // Core controls
    addHotkey('interrupt', 'Ctrl+C');
    addHotkey('clear input', 'Ctrl+U');

    // Feature toggles (only if hotkeys are defined)
    addHotkey('verify', this.toggleState.verificationHotkey);
    addHotkey('auto-continue', this.toggleState.autoContinueHotkey);
    addHotkey('thinking', this.toggleState.thinkingHotkey);
    addHotkey('mode', this.toggleState.dualRlHotkey);

    if (parts.length === 0) {
      return null;
    }
    return parts.join(theme.ui.muted('   '));
  }


  private buildInputLine(): string {
    if (this.collapsedPaste) {
      const summary = `[pasted ${this.collapsedPaste.lines} lines, ${this.collapsedPaste.chars} chars] (Enter/Ctrl+L insert, Backspace discard)`;
      return this.truncateLine(`${theme.primary('> ')}${theme.ui.muted(summary)}`, this.safeWidth());
    }

    // Claude Code uses simple '>' prompt
    const prompt = theme.primary('> ');
    const promptWidth = this.visibleLength(prompt);
    const maxWidth = this.safeWidth();
    const continuationIndent = '  '; // 2 spaces for continuation lines
    const continuationWidth = continuationIndent.length;

    // Handle multi-line input - split buffer on newlines first
    // In secret mode, mask all characters with bullets
    const rawBuffer = this.buffer.replace(/\r/g, '\n');
    const normalized = this.secretMode ? '•'.repeat(rawBuffer.length) : rawBuffer;
    const bufferLines = normalized.split('\n');

    // Wrap each logical line to fit terminal width, expanding vertically
    const result: string[] = [];
    let totalChars = 0;
    let cursorLine = 0;
    let cursorCol = 0;
    let foundCursor = false;

    for (let lineIndex = 0; lineIndex < bufferLines.length; lineIndex++) {
      const line = bufferLines[lineIndex] ?? '';
      const isFirstLogicalLine = lineIndex === 0;
      const lineStartChar = totalChars;

      // Determine available width for this line
      const firstLineWidth = maxWidth - promptWidth;
      const contLineWidth = maxWidth - continuationWidth;

      // Wrap this logical line into display lines
      let remaining = line;
      let isFirstDisplayLine = true;

      while (remaining.length > 0 || isFirstDisplayLine) {
        const availableWidth = (isFirstLogicalLine && isFirstDisplayLine) ? firstLineWidth : contLineWidth;
        const chunk = remaining.slice(0, availableWidth);
        remaining = remaining.slice(availableWidth);

        // Build the display line
        let displayLine: string;
        if (isFirstLogicalLine && isFirstDisplayLine) {
          displayLine = `${prompt}${chunk}`;
        } else {
          displayLine = `${continuationIndent}${chunk}`;
        }

        // Track cursor position
        if (!foundCursor) {
          const chunkStart = lineStartChar + (line.length - remaining.length - chunk.length);
          const chunkEnd = chunkStart + chunk.length;
          if (this.cursor >= chunkStart && this.cursor <= chunkEnd) {
            cursorLine = result.length;
            const offsetInChunk = this.cursor - chunkStart;
            cursorCol = ((isFirstLogicalLine && isFirstDisplayLine) ? promptWidth : continuationWidth) + offsetInChunk;
            foundCursor = true;
          }
        }

        result.push(displayLine);
        isFirstDisplayLine = false;

        // If nothing left and this was an empty line, we already added it
        if (remaining.length === 0 && chunk.length === 0) break;
      }

      totalChars += line.length + 1; // +1 for the newline separator
    }

    // Handle cursor at very end
    if (!foundCursor) {
      cursorLine = Math.max(0, result.length - 1);
      const lastLine = result[cursorLine] ?? '';
      cursorCol = this.visibleLength(lastLine);
    }

    // Add cursor highlight to the appropriate position
    if (result.length > 0) {
      const targetLine = result[cursorLine] ?? '';
      const visiblePart = this.stripAnsi(targetLine);
      const cursorPos = Math.min(cursorCol, visiblePart.length);

      // Rebuild the line with cursor highlight
      const before = visiblePart.slice(0, cursorPos);
      const at = visiblePart.charAt(cursorPos) || ' ';
      const after = visiblePart.slice(cursorPos + 1);

      // Preserve the prompt/indent styling
      const prefix = cursorLine === 0 ? prompt : continuationIndent;
      const textPart = cursorLine === 0 ? before.slice(promptWidth) : before.slice(continuationWidth);
      result[cursorLine] = `${prefix}${textPart}${ESC.REVERSE}${at}${ESC.RESET}${after}`;
    }

    // Store cursor column for terminal positioning
    this.cursorVisibleColumn = cursorCol + 1;

    return result.join('\n');
  }

  private buildInputWindow(available: number): { text: string; cursor: number } {
    if (available <= 0) {
      return { text: '', cursor: 0 };
    }

    if (this.collapsedPaste) {
      return { text: '', cursor: 0 };
    }

    const normalized = this.buffer.replace(/\r/g, '\n');
    const cursorIndex = Math.min(this.cursor, normalized.length);

    let offset = this.inputRenderOffset;
    if (cursorIndex < offset) {
      offset = cursorIndex;
    }
    const overflow = cursorIndex - offset - available + 1;
    if (overflow > 0) {
      offset += overflow;
    }
    const maxOffset = Math.max(0, normalized.length - available);
    if (offset > maxOffset) {
      offset = maxOffset;
    }
    this.inputRenderOffset = offset;

    const window = normalized.slice(offset, offset + available);
    const display = window.split('').map(char => (char === '\n' ? NEWLINE_PLACEHOLDER : char)).join('');
    const cursorInWindow = Math.min(display.length, Math.max(0, cursorIndex - offset));

    const before = display.slice(0, cursorInWindow);
    const at = display.charAt(cursorInWindow) || ' ';
    const after = display.slice(cursorInWindow + 1);

    return {
      text: `${before}${ESC.REVERSE}${at}${ESC.RESET}${after}`,
      cursor: cursorInWindow,
    };
  }

  private expandCollapsedPaste(): void {
    if (!this.collapsedPaste) return;
    this.buffer = this.collapsedPaste.text;
    this.cursor = this.buffer.length;
    this.collapsedPaste = null;
    this.updateSuggestions();
    this.renderPrompt();
    this.emitInputChange();
  }

  captureInput(options: { allowEmpty?: boolean; trim?: boolean; resetBuffer?: boolean } = {}): Promise<string> {
    if (this.inputCapture) {
      return Promise.reject(new Error('Input capture already in progress'));
    }

    if (options.resetBuffer) {
      this.buffer = '';
      this.cursor = 0;
      this.inputRenderOffset = 0;
      this.resetSuggestions();
      this.renderPrompt();
      this.emitInputChange();
    }

    return new Promise<string>((resolve, reject) => {
      this.inputCapture = {
        resolve,
        reject,
        options: {
          trim: options.trim !== false,
          allowEmpty: options.allowEmpty ?? false,
        },
      };
    });
  }

  private cancelInputCapture(reason?: unknown): void {
    if (!this.inputCapture) {
      return;
    }
    const capture = this.inputCapture;
    this.inputCapture = null;
    capture.reject?.(reason ?? new Error('Input capture cancelled'));
  }


  // ------------ Helpers ------------

  private wrapOverlayLine(text: string, width: number, indent: string): string[] {
    const words = text.split(/(\s+)/);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const next = current + word;
      if (this.visibleLength(next) > width && current.trim()) {
        lines.push(this.truncateLine(current.trimEnd(), width));
        current = indent + word.trimStart();
      } else {
        current = next;
      }
    }

    if (current.trim()) {
      lines.push(this.truncateLine(current.trimEnd(), width));
    }

    return lines.length ? lines : [this.truncateLine(text, width)];
  }

  private safeWidth(): number {
    const cols = this.output.isTTY ? this.cols || 80 : 80;
    return Math.max(1, cols - 1);
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

  private truncateLine(value: string, width: number): string {
    if (!value) return '';
    const limit = Math.max(1, width);
    // eslint-disable-next-line no-control-regex
    const tokens = value.split(/(\x1b\[[0-9;]*m)/u);
    let visible = 0;
    let truncated = false;
    let result = '';

    for (const token of tokens) {
      if (!token) continue;
      // eslint-disable-next-line no-control-regex
      if (/^\x1b\[[0-9;]*m$/u.test(token)) {
        result += token;
        continue;
      }
      if (visible >= limit) {
        truncated = true;
        continue;
      }
      const remaining = limit - visible;
      if (token.length <= remaining) {
        result += token;
        visible += token.length;
      } else {
        const sliceLength = Math.max(0, remaining - 1);
        if (sliceLength > 0) {
          result += token.slice(0, sliceLength);
          visible += sliceLength;
        }
        result += '…';
        truncated = true;
        break;
      }
    }

    if (truncated && !result.endsWith(ESC.RESET)) {
      result += ESC.RESET;
    }

    return result;
  }

  getBuffer(): string {
    return this.buffer;
  }

  getCursor(): number {
    return this.cursor;
  }

  setBuffer(text: string, cursorPos?: number): void {
    this.buffer = text;
    // Validate cursor position to prevent out-of-bounds issues
    const requestedCursor = cursorPos ?? text.length;
    this.cursor = Math.max(0, Math.min(requestedCursor, text.length));
    this.inputRenderOffset = 0;
    this.updateSuggestions();
    this.renderPrompt();
    this.emitInputChange();
  }

  setSecretMode(enabled: boolean): void {
    this.secretMode = enabled;
    this.renderPrompt();
  }

  clearBuffer(): void {
    this.cancelPlainPasteCapture();
    this.buffer = '';
    this.cursor = 0;
    this.inputRenderOffset = 0;
    this.suggestions = [];
    this.suggestionIndex = -1;
    this.renderPrompt();
    this.emitInputChange();
  }

  setModeStatus(status: string | null): void {
    this.updateStatus(status);
  }

  /**
   * Show a compacting status with animated spinner (Claude Code style)
   * Uses ✻ character with animation to indicate context compaction in progress
   */
  showCompactingStatus(message: string): void {
    this.statusMessage = message;
    if (!this.spinnerInterval) {
      this.spinnerInterval = setInterval(() => {
        this.spinnerFrame++;
        // Cycle activity phrase every ~4 seconds (50 frames at 80ms)
        if (this.spinnerFrame % 50 === 0) {
          this.activityPhraseIndex++;
        }
        this.renderPrompt();
      }, 80);
    }
    this.renderPrompt();
  }

  /**
   * Hide the compacting status and stop spinner animation
   */
  hideCompactingStatus(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
    this.statusMessage = null;
    this.renderPrompt();
  }

  emitPrompt(content: string): void {
    this.pushPromptEvent(content);
  }

  /**
   * Display user prompt immediately in scrollback (Claude Code style)
   * Writes synchronously to ensure it appears ONCE in scrollback before status updates.
   * The prompt input area will then float below this and all subsequent events.
   */
  private displayUserPrompt(text: string): void {
    const normalized = text?.trim();
    if (!normalized) return;

    const now = Date.now();
    this.lastPromptEvent = { text: normalized, at: now };

    // Add to event queue instead of writing directly to ensure proper rendering
    this.addEvent('prompt', normalized);
  }

  render(): void {
    this.renderPrompt();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ------------ Low-level helpers ------------

  private write(data: string): void {
    this.output.write(data);
  }

  private pushPromptEvent(text: string): void {
    const normalized = text?.trim();
    if (!normalized) {
      return;
    }
    const now = Date.now();
    if (this.lastPromptEvent && this.lastPromptEvent.text === normalized && now - this.lastPromptEvent.at < 1500) {
      return;
    }
    this.lastPromptEvent = { text: normalized, at: now };
    this.addEvent('prompt', normalized);
  }

  private clearPromptArea(): void {
    const height = this.lastOverlay?.lines.length ?? this.promptHeight ?? 0;
    if (height === 0) return;

    // Cursor is at prompt row. Move up to top of overlay first.
    if (this.lastOverlay) {
      const linesToTop = this.lastOverlay.promptIndex;
      if (linesToTop > 0) {
        this.write(`\x1b[${linesToTop}A`);
      }
    }

    // Now at top, clear each line downward
    for (let i = 0; i < height; i++) {
      this.write('\r');
      this.write(ESC.CLEAR_LINE);
      if (i < height - 1) {
        this.write('\x1b[B');
      }
    }

    // Move back to top (where content should continue from)
    if (height > 1) {
      this.write(`\x1b[${height - 1}A`);
    }
    this.write('\r');

    this.lastOverlay = null;
    this.promptHeight = 0;
    this.lastOverlayHeight = 0;
    this.isPromptActive = false;
  }

  private updateTerminalSize(): void {
    if (this.output.isTTY) {
      this.rows = this.output.rows || 24;
      this.cols = this.output.columns || 80;
    }
  }
}
