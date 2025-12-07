/**
 * Global Write Lock - Simplified streaming-safe output coordination
 *
 * This module provides a simple mechanism to ensure streaming content
 * is not interrupted by other UI components during streaming.
 *
 * Design Principle:
 * - During streaming, ONLY streaming content writes to stdout
 * - All other UI components (status, input area, etc.) wait until streaming ends
 * - No complex lock nesting or queuing - just a simple boolean flag
 *
 * This prevents the garbled output and cutoffs that occur when multiple
 * components try to write simultaneously with cursor positioning.
 */

let streamingActive = false;

/**
 * Check if streaming mode is currently active
 */
export function isStreamingMode(): boolean {
  return streamingActive;
}

/**
 * Enter streaming mode - blocks all non-streaming output
 */
export function enterStreamingMode(): void {
  if (streamingActive) {
    console.warn('[StreamingMode] enterStreamingMode() called while already in streaming mode');
  }
  streamingActive = true;
}

/**
 * Exit streaming mode - allows normal UI output to resume
 */
export function exitStreamingMode(): void {
  // Be tolerant of double-exit; just clear the flag.
  streamingActive = false;
}

/**
 * Execute a callback only if not in streaming mode.
 * Returns true if the callback was executed, false if skipped.
 */
export function ifNotStreaming(callback: () => void): boolean {
  if (streamingActive) {
    return false;
  }
  callback();
  return true;
}

/**
 * Legacy: installGlobalWriteLock is now a no-op
 * The old approach of wrapping stdout.write caused nested lock issues.
 * We now use a simpler streaming mode flag instead.
 */
export function installGlobalWriteLock(): void {
  // No-op - we no longer wrap stdout.write
  // The streaming mode flag handles coordination instead
}
