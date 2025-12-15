/**
 * UI constants and configuration for AGI Core
 * Consolidated from various UI modules into a single source
 */

import { theme } from './theme.js';

// Context window management constants
export const CONTEXT_WINDOW_BASE = 4096;
export const MAX_CONTEXT_WINDOW = 32768;
export const CONTEXT_WARNING_THRESHOLD = 0.85; // 85% full
export const CONTEXT_CRITICAL_THRESHOLD = 0.95; // 95% full

// Get context window color based on utilization
export function getContextColor(utilization: number): string {
  if (utilization >= CONTEXT_CRITICAL_THRESHOLD) {
    return theme.ui.error;
  }
  if (utilization >= CONTEXT_WARNING_THRESHOLD) {
    return theme.ui.warning;
  }
  return theme.ui.success;
}

// Clamp percentage to 0-100 range
export function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// UI layout constants
export const LAYOUT = {
  TERMINAL_MIN_WIDTH: 80,
  TERMINAL_MIN_HEIGHT: 24,
  STATUS_LINE_HEIGHT: 1,
  PROMPT_LINE_HEIGHT: 2,
  MAX_LINE_WIDTH: 120,
  INDENT_SIZE: 2,
};

// Tournament/dual RL constants
export const TOURNAMENT = {
  MAX_SCORE_DISPLAY: 1000,
  SCORE_PRECISION: 2,
  ACCURACY_PRECISION: 3,
  MAX_STREAK_DISPLAY: 99,
  PARALLEL_EXECUTION_TIMEOUT: 30000, // 30 seconds
};

// Tool execution constants
export const TOOLS = {
  MAX_TOOL_NAME_DISPLAY: 20,
  MAX_ARG_DISPLAY: 40,
  MAX_RESULT_PREVIEW: 80,
  TOOL_TIMEOUT_WARNING: 10000, // 10 seconds
};

// Agent status constants
export const AGENT_STATUS = {
  THINKING_TIMEOUT: 30000, // 30 seconds
  MAX_THINKING_INDICATOR: 99,
  RESPONSE_TIMEOUT: 60000, // 60 seconds
};

// Event pipeline constants
export const EVENTS = {
  MAX_EVENTS_IN_MEMORY: 1000,
  EVENT_CLEANUP_INTERVAL: 60000, // 1 minute
  STREAM_BUFFER_SIZE: 4096,
  MAX_STREAM_CHUNK: 1024,
};

// Default values
export const DEFAULTS = {
  SPINNER_INTERVAL: 80, // ms
  DEBOUNCE_INTERVAL: 100, // ms
  SCROLL_REFRESH_INTERVAL: 16, // ~60fps
  STATUS_UPDATE_INTERVAL: 250, // ms
};

// UI mode constants
export const MODES = {
  INTERACTIVE: 'interactive',
  QUICK: 'quick',
  HEADLESS: 'headless',
  PIPE: 'pipe',
  JSON: 'json',
};

// Status indicators
export const STATUS = {
  READY: 'Ready',
  WORKING: 'Working',
  THINKING: 'Thinking',
  WAITING: 'Waiting',
  ERROR: 'Error',
  SUCCESS: 'Success',
  COMPLETE: 'Complete',
};

export default {
  CONTEXT_WINDOW_BASE,
  MAX_CONTEXT_WINDOW,
  CONTEXT_WARNING_THRESHOLD,
  CONTEXT_CRITICAL_THRESHOLD,
  getContextColor,
  clampPercentage,
  LAYOUT,
  TOURNAMENT,
  TOOLS,
  AGENT_STATUS,
  EVENTS,
  DEFAULTS,
  MODES,
  STATUS,
};