/**
 * UI Layer - AGI CLI User Interface System
 *
 * Architecture Overview:
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The UI layer is organized into clear abstraction levels:
 *
 * Layer 1 - Core Primitives (lowest level):
 * ─────────────────────────────────────────────────────────────────────────────
 * - theme.ts: Color palette, semantic colors, text styling
 * - layout.ts: Terminal measurements, box drawing, padding
 * - richText.ts: Markdown parsing and formatting
 *
 * Layer 2 - Specialized Renderers:
 * ─────────────────────────────────────────────────────────────────────────────
 * - codeHighlighter.ts: Syntax highlighting for code blocks
 * - textHighlighter.ts: Search/match highlighting
 * - errorFormatter.ts: Error message formatting and display
 * - toolDisplay.ts: Tool invocation and result rendering
 *
 * Layer 3 - Components:
 * ─────────────────────────────────────────────────────────────────────────────
 * - animatedStatus.ts: Animated spinners and progress indicators
 * - inPlaceUpdater.ts: In-place terminal updates (same-line rewrites)
 * - shortcutsHelp.ts: Keyboard shortcuts display
 * - designSystem.ts: Reusable UI component definitions
 *
 * Layer 4 - Controllers:
 * ─────────────────────────────────────────────────────────────────────────────
 * - PromptController.ts: User input handling and command line interface
 * - UnifiedUIController.ts: Central UI state and event coordination
 *
 * Layer 5 - High-Level Renderers:
 * ─────────────────────────────────────────────────────────────────────────────
 * - UnifiedUIRenderer.ts: Main rendering engine, composes all layers
 * - display.ts: Legacy display functions (being migrated to UnifiedUIRenderer)
 *
 * Layer 6 - Integration:
 * ─────────────────────────────────────────────────────────────────────────────
 * - ShellUIAdapter.ts: Bridges shell and UI systems
 * - outputMode.ts: Output format selection (interactive/JSON/plain)
 * - globalWriteLock.ts: Prevents concurrent terminal writes
 *
 *
 * Usage Guidelines:
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. For theme colors: import { theme } from './theme.js';
 * 2. For formatted output: import { UnifiedUIRenderer } from './UnifiedUIRenderer.js';
 * 3. For shell integration: import { ShellUIAdapter } from './ShellUIAdapter.js';
 * 4. For user input: import { PromptController } from './PromptController.js';
 *
 *
 * Module Relationships:
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *                        ┌────────────────────────┐
 *                        │    ShellUIAdapter      │
 *                        │   (Integration Layer)  │
 *                        └───────────┬────────────┘
 *                                    │
 *           ┌────────────────────────┼────────────────────────┐
 *           │                        │                        │
 *           ▼                        ▼                        ▼
 * ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 * │PromptController │    │UnifiedUIRenderer│    │UnifiedUIControl │
 * │  (Input)        │    │  (Output)       │    │  (State)        │
 * └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
 *          │                      │                      │
 *          │           ┌──────────┴──────────┐          │
 *          │           ▼                     ▼          │
 *          │  ┌────────────────┐   ┌────────────────┐  │
 *          │  │ codeHighlight  │   │  toolDisplay   │  │
 *          │  │ errorFormatter │   │ animatedStatus │  │
 *          │  └────────────────┘   └────────────────┘  │
 *          │           │                     │          │
 *          └───────────┴─────────┬───────────┴──────────┘
 *                                ▼
 *                    ┌─────────────────────┐
 *                    │   theme / layout    │
 *                    │   (Core Primitives) │
 *                    └─────────────────────┘
 *
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
} from './theme.js';

export * from './layout.js';

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
export * from './inPlaceUpdater.js';
export { formatShortcutsHelp } from './shortcutsHelp.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 4 - Controllers
// ═══════════════════════════════════════════════════════════════════════════════

export { PromptController } from './PromptController.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 5 - High-Level Renderers
// ═══════════════════════════════════════════════════════════════════════════════

export { UnifiedUIRenderer } from './UnifiedUIRenderer.js';
export { Display, display, type DisplayMessageMetadata } from './display.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 6 - Integration
// ═══════════════════════════════════════════════════════════════════════════════

export * from './outputMode.js';
export * from './globalWriteLock.js';
