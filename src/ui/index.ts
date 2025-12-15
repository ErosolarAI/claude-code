/**
 * UI Layer - AGI CLI User Interface System
 *
 * Layers (current stack):
 * - Core primitives: theme.ts, layout.ts, uiConstants.ts, richText.ts
 * - Render helpers: codeHighlighter.ts, textHighlighter.ts, errorFormatter.ts, toolDisplay.ts
 * - Animation: animatedStatus.ts (uses animation/AnimationScheduler)
 * - Controllers: PromptController.ts (input + key handling)
 * - Renderer: UnifiedUIRenderer.ts (single event pipeline for terminal UI)
 * - Integration: outputMode.ts + globalWriteLock.ts for shell safety
 *
 * Usage:
 * - Colors/primitives: import { theme } from './theme.js';
 * - Renderer: import { UnifiedUIRenderer } from './UnifiedUIRenderer.js';
 * - Input handling: import { PromptController } from './PromptController.js';
 * - Output selection helpers: import { isPlainOutputMode } from './outputMode.js';
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 1 - Core Primitives
// ═══════════════════════════════════════════════════════════════════════════════

export {
  theme,
  icons,
  spinnerFrames,
  progressChars,
  boxChars,
  formatBanner,
  formatUserPrompt,
  USER_PROMPT_PREFIX,
  formatToolCall,
  formatMessage,
  neon,
  // palette, // Temporarily commented out due to export issue
} from './theme.js';

export * from './layout.js';
export * from './uiConstants.js';
export * from './designSystem.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 2 - Specialized Renderers
// ═══════════════════════════════════════════════════════════════════════════════

export * from './codeHighlighter.js';
export * from './textHighlighter.js';
export {
  formatError,
  formatErrorList,
  type ErrorInfo,
  type ErrorFormatOptions,
} from './errorFormatter.js';
export * from './toolDisplay.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 3 - Components
// ═══════════════════════════════════════════════════════════════════════════════

export * from './animatedStatus.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 4 - Controllers
// ═══════════════════════════════════════════════════════════════════════════════

export { PromptController } from './PromptController.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 5 - High-Level Renderers
// ═══════════════════════════════════════════════════════════════════════════════

export { UnifiedUIRenderer } from './UnifiedUIRenderer.js';
// export * from './modern-ui-system.js'; // File removed - was truncated
// export * from './designSystem.js'; // File doesn't exist

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 6 - Integration
// ═══════════════════════════════════════════════════════════════════════════════

export * from './outputMode.js';
export * from './globalWriteLock.js';
