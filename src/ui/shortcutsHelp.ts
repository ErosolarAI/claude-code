/**
 * Keyboard Shortcuts Help Display (AGI CLI style)
 */

import { theme } from './theme.js';
import { getTerminalColumns } from './layout.js';

export interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    keys: string;
    description: string;
  }>;
}

const AGI_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Mode Toggles',
    shortcuts: [
      { keys: 'Shift+Tab', description: 'Cycle edit mode (auto/ask/plan)' },
      { keys: 'Tab', description: 'Toggle thinking (balanced/longer)' },
      { keys: 'Opt+V / ^⇧V', description: 'Toggle verification' },
      { keys: 'Opt+G / ^⇧G', description: 'Toggle auto-continue (loop until done)' },
      { keys: 'Opt+A / ^⇧A', description: 'Toggle approvals for high-impact actions' },
      { keys: 'Opt+D / ^⇧D', description: 'Toggle dual-agent RL orchestration' },
      { keys: 'Ctrl+Shift+E', description: 'Toggle edit permission mode' },
      { keys: 'Ctrl+Shift+X', description: 'Clear/compact context' },
    ],
  },
  {
    title: 'Session Control',
    shortcuts: [
      { keys: 'Esc+Esc', description: 'Open rewind menu' },
      { keys: 'Ctrl+C', description: 'Clear input or pause AI' },
      { keys: 'Ctrl+B', description: 'Run command in background' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'PgUp/PgDn', description: 'Scroll through output' },
      { keys: 'Ctrl+Home', description: 'Scroll to top' },
      { keys: 'Ctrl+End', description: 'Scroll to bottom' },
      { keys: 'Up/Down', description: 'Navigate command history' },
      { keys: 'Ctrl+R', description: 'Search command history' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: 'Ctrl+A', description: 'Move to start of line' },
      { keys: 'Ctrl+E', description: 'Move to end of line' },
      { keys: 'Ctrl+K', description: 'Delete to end of line' },
      { keys: 'Ctrl+U', description: 'Delete to start of line' },
      { keys: 'Ctrl+W', description: 'Delete previous word' },
      { keys: 'Shift+Enter', description: 'Insert newline (multi-line)' },
      { keys: 'Ctrl+Enter', description: 'Insert newline (multi-line)' },
    ],
  },
  {
    title: 'Commands',
    shortcuts: [
      { keys: '/help', description: 'Show all commands & shortcuts' },
      { keys: '/tools', description: 'Enable/disable tools & MCP' },
      { keys: '/model', description: 'Change AI model' },
      { keys: '/thinking', description: 'Set thinking mode' },
      { keys: '/rewind', description: 'Rewind to checkpoint' },
      { keys: '/memory', description: 'Edit EROSOLAR.md' },
      { keys: '/vim', description: 'Toggle vim mode' },
      { keys: '/cost', description: 'Show cost breakdown' },
    ],
  },
];

/**
 * Format keyboard shortcuts help in AGI CLI style
 */
export function formatShortcutsHelp(): string {
  const width = Math.min(getTerminalColumns(), 80);
  const lines: string[] = [];

  // Title
  lines.push('');
  lines.push(theme.gradient.primary('Keyboard Shortcuts'));
  lines.push(theme.ui.muted('─'.repeat(width - 1)));
  lines.push('');

  // Groups
  for (const group of AGI_SHORTCUTS) {
    lines.push(theme.bold(`  ${group.title}`));
    lines.push('');

    for (const shortcut of group.shortcuts) {
      const keys = theme.info(shortcut.keys.padEnd(20));
      const desc = theme.ui.muted(shortcut.description);
      lines.push(`    ${keys} ${desc}`);
    }

    lines.push('');
  }

  // Footer
  lines.push(theme.ui.muted('─'.repeat(width - 1)));
  lines.push(theme.ui.muted('  Press any key to continue...'));
  lines.push('');

  return lines.join('\n');
}

/**
 * Format inline shortcut hint (AGI CLI style)
 */
export function formatShortcutHint(keys: string, description: string): string {
  return `${theme.info(keys)} ${theme.ui.muted(description)}`;
}

/**
 * Quick shortcuts reference (one-line)
 */
export function formatQuickShortcuts(): string {
  const hints = [
    '? for help',
    '/ for commands',
    'ctrl+c to clear/pause',
    'tab toggles thinking',
  ];

  return hints.map(h => theme.ui.muted(h)).join(' · ');
}

/**
 * Get the current edit mode description (AGI CLI style)
 * Format: "⏵⏵ accept edits on"
 */
export function formatEditModeIndicator(mode: 'auto' | 'ask' | 'plan'): string {
  const symbols: Record<string, string> = {
    'auto': '⏵⏵',
    'ask': '⏸',
    'plan': '📋',
  };

  const labels: Record<string, string> = {
    'auto': 'accept edits on',
    'ask': 'ask before edits',
    'plan': 'plan mode',
  };

  const symbol = symbols[mode] || '⏵⏵';
  const label = labels[mode] || 'accept edits on';

  return `${theme.info(symbol)} ${label}`;
}

/**
 * Format a task in progress indicator (AGI CLI style)
 * Format: "✢ Task description…"
 * Optional next step: "  ⎿ Next: description"
 */
export function formatTaskInProgress(task: string, nextStep?: string): string {
  const lines: string[] = [];

  // Main task with ✢ symbol (sparkle variant for active task)
  lines.push(`${theme.info('✢')} ${task}…`);

  // Optional next step
  if (nextStep) {
    lines.push(`  ${theme.ui.muted('⎿')} Next: ${nextStep}`);
  }

  return lines.join('\n');
}

/**
 * Format a completed thought indicator (AGI CLI style)
 * Format: "∴ Thought for Xs"
 */
export function formatThoughtComplete(durationSeconds: number): string {
  const elapsed = durationSeconds < 60
    ? `${durationSeconds}s`
    : `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;

  return `${theme.info('∴')} Thought for ${elapsed}`;
}
