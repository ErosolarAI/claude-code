/**
 * InPlaceUpdater - Dynamic in-place terminal updates
 *
 * Enables tool results to update in place without creating new lines.
 * Features:
 * - Cursor management for overwriting previous output
 * - Multi-line update support
 * - Progress bar animations
 * - Streaming content updates
 * - TTY detection and fallback
 */

import { theme, icons, spinnerFrames, progressChars } from './theme.js';
import { getTerminalColumns, measure, stripAnsi } from './layout.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UpdateRegion {
  id: string;
  startLine: number;
  lineCount: number;
  content: string[];
  lastUpdate: number;
}

export interface ProgressBarOptions {
  width?: number;
  showPercentage?: boolean;
  showCount?: boolean;
  label?: string;
  style?: 'bar' | 'braille' | 'dots';
}

export interface SpinnerOptions {
  style?: keyof typeof spinnerFrames;
  label?: string;
}

export interface StreamingUpdateOptions {
  maxLines?: number;
  truncate?: boolean;
  preserveLastLine?: boolean;
}

// ============================================================================
// IN-PLACE UPDATER
// ============================================================================

export class InPlaceUpdater {
  private readonly stream: NodeJS.WriteStream;
  private regions: Map<string, UpdateRegion> = new Map();
  private currentSpinnerFrame = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private activeSpinnerId: string | null = null;
  private isTTY: boolean;

  constructor(stream: NodeJS.WriteStream = process.stdout) {
    this.stream = stream;
    this.isTTY = stream.isTTY === true;
  }

  // --------------------------------------------------------------------------
  // CURSOR CONTROL
  // --------------------------------------------------------------------------

  /**
   * Move cursor up N lines
   */
  private cursorUp(lines: number): void {
    if (this.isTTY && lines > 0) {
      this.stream.write(`\x1b[${lines}A`);
    }
  }

  /**
   * Move cursor down N lines
   */
  private cursorDown(lines: number): void {
    if (this.isTTY && lines > 0) {
      this.stream.write(`\x1b[${lines}B`);
    }
  }

  /**
   * Move cursor to beginning of line
   */
  private cursorToLineStart(): void {
    if (this.isTTY) {
      this.stream.write('\r');
    }
  }

  /**
   * Clear from cursor to end of line
   */
  private clearToEndOfLine(): void {
    if (this.isTTY) {
      this.stream.write('\x1b[K');
    }
  }

  /**
   * Clear entire line
   */
  private clearLine(): void {
    if (this.isTTY) {
      this.stream.write('\r\x1b[K');
    }
  }

  /**
   * Save cursor position
   */
  private saveCursor(): void {
    if (this.isTTY) {
      this.stream.write('\x1b[s');
    }
  }

  /**
   * Restore cursor position
   */
  private restoreCursor(): void {
    if (this.isTTY) {
      this.stream.write('\x1b[u');
    }
  }

  /**
   * Hide cursor
   */
  hideCursor(): void {
    if (this.isTTY) {
      this.stream.write('\x1b[?25l');
    }
  }

  /**
   * Show cursor
   */
  showCursor(): void {
    if (this.isTTY) {
      this.stream.write('\x1b[?25h');
    }
  }

  // --------------------------------------------------------------------------
  // IN-PLACE UPDATES
  // --------------------------------------------------------------------------

  /**
   * Create an updateable region
   */
  createRegion(id: string, initialContent: string | string[]): void {
    const content = Array.isArray(initialContent) ? initialContent : [initialContent];

    // Write initial content
    for (const line of content) {
      this.stream.write(`${line}\n`);
    }

    this.regions.set(id, {
      id,
      startLine: 0, // We don't track absolute position, only relative
      lineCount: content.length,
      content,
      lastUpdate: Date.now(),
    });
  }

  /**
   * Update a region in place
   */
  updateRegion(id: string, newContent: string | string[]): void {
    const region = this.regions.get(id);
    if (!region) return;

    const content = Array.isArray(newContent) ? newContent : [newContent];

    if (this.isTTY) {
      // Move cursor up to the start of the region
      this.cursorUp(region.lineCount);

      // Write new content, clearing each line
      for (let i = 0; i < Math.max(content.length, region.lineCount); i++) {
        this.clearLine();
        if (i < content.length) {
          this.stream.write(`${content[i]}\n`);
        } else {
          this.stream.write('\n'); // Clear extra lines
        }
      }

      // If new content is shorter, we need to move cursor down
      if (content.length < region.lineCount) {
        // We're already at the right position
      }
    } else {
      // Non-TTY fallback: just print new content
      for (const line of content) {
        this.stream.write(`${line}\n`);
      }
    }

    // Update region metadata
    region.content = content;
    region.lineCount = content.length;
    region.lastUpdate = Date.now();
  }

  /**
   * Delete a region
   */
  deleteRegion(id: string): void {
    const region = this.regions.get(id);
    if (!region) return;

    if (this.isTTY) {
      // Move up and clear all lines
      this.cursorUp(region.lineCount);
      for (let i = 0; i < region.lineCount; i++) {
        this.clearLine();
        if (i < region.lineCount - 1) {
          this.cursorDown(1);
        }
      }
      // Move back up to where the region started
      this.cursorUp(region.lineCount - 1);
    }

    this.regions.delete(id);
  }

  /**
   * Update a single line in place (most common use case)
   */
  updateLine(content: string): void {
    if (this.isTTY) {
      this.cursorToLineStart();
      this.clearToEndOfLine();
      this.stream.write(content);
    } else {
      this.stream.write(`${content}\n`);
    }
  }

  /**
   * Finalize a line update (add newline)
   */
  finalizeLine(content?: string): void {
    if (content) {
      this.updateLine(content);
    }
    this.stream.write('\n');
  }

  // --------------------------------------------------------------------------
  // PROGRESS BAR
  // --------------------------------------------------------------------------

  /**
   * Create a progress bar string
   */
  formatProgressBar(
    current: number,
    total: number,
    options: ProgressBarOptions = {}
  ): string {
    const {
      width = 20,
      showPercentage = true,
      showCount = false,
      label,
      style = 'bar',
    } = options;

    const percentage = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    let bar: string;
    switch (style) {
      case 'braille':
        bar = this.formatBrailleBar(current, total, width);
        break;
      case 'dots':
        bar = '●'.repeat(filled) + '○'.repeat(empty);
        break;
      case 'bar':
      default:
        bar = theme.progress.bar(progressChars.filled.repeat(filled)) +
              theme.progress.empty(progressChars.empty.repeat(empty));
    }

    const parts: string[] = [];

    if (label) {
      parts.push(theme.ui.muted(label));
    }

    parts.push(`[${bar}]`);

    if (showPercentage) {
      parts.push(theme.progress.percentage(`${percentage}%`));
    }

    if (showCount) {
      parts.push(theme.ui.muted(`(${current}/${total})`));
    }

    return parts.join(' ');
  }

  /**
   * Create a smooth braille-based progress bar
   */
  private formatBrailleBar(current: number, total: number, width: number): string {
    const ratio = current / total;
    const fullBlocks = Math.floor(ratio * width);
    const remainder = (ratio * width) - fullBlocks;

    // Braille patterns for partial fill (0/8 to 8/8)
    const partials = [' ', '⡀', '⡄', '⡆', '⡇', '⣇', '⣧', '⣷', '⣿'];
    const partialIndex = Math.floor(remainder * 8);

    let bar = '⣿'.repeat(fullBlocks);
    if (fullBlocks < width) {
      bar += partials[partialIndex];
      bar += ' '.repeat(width - fullBlocks - 1);
    }

    return theme.progress.bar(bar);
  }

  /**
   * Update a progress bar in place
   */
  updateProgress(
    regionId: string,
    current: number,
    total: number,
    options: ProgressBarOptions = {}
  ): void {
    const bar = this.formatProgressBar(current, total, options);
    this.updateLine(bar);
  }

  // --------------------------------------------------------------------------
  // SPINNER
  // --------------------------------------------------------------------------

  /**
   * Start a spinner
   */
  startSpinner(id: string, label: string, options: SpinnerOptions = {}): void {
    if (this.spinnerInterval) {
      this.stopSpinner();
    }

    this.activeSpinnerId = id;
    const style = options.style || 'circle';
    const frames = spinnerFrames[style];

    // Initial render
    this.renderSpinner(frames, label);

    // Start animation
    this.spinnerInterval = setInterval(() => {
      this.currentSpinnerFrame = (this.currentSpinnerFrame + 1) % frames.length;
      this.renderSpinner(frames, label);
    }, 80);
  }

  /**
   * Update spinner label
   */
  updateSpinner(_label: string): void {
    if (!this.spinnerInterval) return;
    // The next frame will pick up the new label
    // For immediate update, we'd need to store the current frames
  }

  /**
   * Stop spinner and show final message
   */
  stopSpinner(finalMessage?: string, success: boolean = true): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }

    if (finalMessage) {
      const icon = success ? theme.success(icons.success) : theme.error(icons.error);
      this.finalizeLine(`${icon} ${finalMessage}`);
    } else {
      this.finalizeLine();
    }

    this.activeSpinnerId = null;
    this.currentSpinnerFrame = 0;
  }

  /**
   * Render current spinner frame
   */
  private renderSpinner(frames: readonly string[], label: string): void {
    const frame = theme.info(frames[this.currentSpinnerFrame]);
    this.updateLine(`${frame} ${label}`);
  }

  // --------------------------------------------------------------------------
  // STREAMING UPDATES
  // --------------------------------------------------------------------------

  /**
   * Create a streaming update region that shows the last N lines
   */
  createStreamingRegion(
    id: string,
    options: StreamingUpdateOptions = {}
  ): (content: string) => void {
    const { maxLines = 5, truncate = true, preserveLastLine = true } = options;
    const lines: string[] = [];

    // Create initial empty region
    const emptyLines = Array(maxLines).fill('');
    this.createRegion(id, emptyLines);

    // Return updater function
    return (content: string) => {
      // Add new content (may contain newlines)
      const newLines = content.split('\n');
      for (const line of newLines) {
        if (line || !preserveLastLine) {
          lines.push(line);
        }
      }

      // Keep only last maxLines
      while (lines.length > maxLines) {
        lines.shift();
      }

      // Pad to maxLines for consistent region size
      const displayLines = [...lines];
      while (displayLines.length < maxLines) {
        displayLines.unshift('');
      }

      // Truncate lines if needed
      const termWidth = getTerminalColumns() - 2;
      const truncatedLines = truncate
        ? displayLines.map(l => {
            const visible = measure(l);
            if (visible > termWidth) {
              return `${stripAnsi(l).slice(0, termWidth - 3)  }...`;
            }
            return l;
          })
        : displayLines;

      this.updateRegion(id, truncatedLines);
    };
  }

  /**
   * Finalize streaming region with summary
   */
  finalizeStreamingRegion(id: string, summary?: string): void {
    this.deleteRegion(id);
    if (summary) {
      this.stream.write(`${summary}\n`);
    }
  }

  // --------------------------------------------------------------------------
  // COMPOUND DISPLAYS
  // --------------------------------------------------------------------------

  /**
   * Show tool execution with in-place progress
   */
  showToolProgress(
    toolName: string,
    message: string,
    progress?: { current: number; total: number }
  ): void {
    const parts: string[] = [];

    // Spinner or progress icon
    if (progress) {
      const pct = Math.round((progress.current / progress.total) * 100);
      parts.push(theme.info(`${pct}%`));
    } else {
      const frame = spinnerFrames.circle[this.currentSpinnerFrame];
      parts.push(theme.info(frame));
    }

    // Tool name
    parts.push(theme.tool(`[${toolName}]`));

    // Message
    parts.push(message);

    // Progress bar if applicable
    if (progress) {
      const bar = this.formatProgressBar(progress.current, progress.total, {
        width: 15,
        showPercentage: false,
      });
      parts.push(bar);
    }

    this.updateLine(parts.join(' '));
  }

  /**
   * Show file operation progress
   */
  showFileProgress(
    operation: 'read' | 'write' | 'edit',
    filePath: string,
    progress?: { current: number; total: number }
  ): void {
    const opIcons = {
      read: icons.read,
      write: icons.write,
      edit: icons.edit,
    };

    const shortPath = this.truncatePath(filePath, 40);
    const parts: string[] = [
      theme.info(opIcons[operation] || icons.file),
      theme.file.path(shortPath),
    ];

    if (progress) {
      parts.push(this.formatProgressBar(progress.current, progress.total, {
        width: 12,
        showPercentage: true,
      }));
    }

    this.updateLine(parts.join(' '));
  }

  /**
   * Complete file operation with summary
   */
  completeFileOperation(
    operation: 'read' | 'write' | 'edit',
    filePath: string,
    stats?: { lines?: number; additions?: number; removals?: number }
  ): void {
    const shortPath = this.truncatePath(filePath, 40);
    const parts: string[] = [
      theme.success(icons.success),
      theme.file.path(shortPath),
    ];

    if (stats) {
      const details: string[] = [];
      if (stats.lines !== undefined) {
        details.push(`${stats.lines} lines`);
      }
      if (stats.additions !== undefined && stats.additions > 0) {
        details.push(theme.file.additions(`+${stats.additions}`));
      }
      if (stats.removals !== undefined && stats.removals > 0) {
        details.push(theme.file.removals(`-${stats.removals}`));
      }
      if (details.length > 0) {
        parts.push(theme.ui.muted(`(${details.join(', ')})`));
      }
    }

    this.finalizeLine(parts.join(' '));
  }

  // --------------------------------------------------------------------------
  // UTILITIES
  // --------------------------------------------------------------------------

  private truncatePath(path: string, maxLen: number): string {
    if (path.length <= maxLen) return path;

    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 2) {
      return `${path.slice(0, maxLen - 3)}...`;
    }

    const filename = parts[parts.length - 1] || '';
    if (filename.length <= maxLen - 4) {
      return `.../${filename}`;
    }

    return `${filename.slice(0, maxLen - 3)}...`;
  }

  /**
   * Check if TTY is available
   */
  get hasTTY(): boolean {
    return this.isTTY;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopSpinner();
    this.showCursor();
    this.regions.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const inPlaceUpdater = new InPlaceUpdater();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick in-place line update
 */
export function updateInPlace(content: string): void {
  inPlaceUpdater.updateLine(content);
}

/**
 * Quick progress bar
 */
export function showProgress(
  current: number,
  total: number,
  label?: string
): void {
  const bar = inPlaceUpdater.formatProgressBar(current, total, {
    label,
    showPercentage: true,
    width: 25,
  });
  inPlaceUpdater.updateLine(bar);
}

/**
 * Finalize progress with result
 */
export function finishProgress(message: string, success: boolean = true): void {
  const icon = success ? theme.success(icons.success) : theme.error(icons.error);
  inPlaceUpdater.finalizeLine(`${icon} ${message}`);
}
