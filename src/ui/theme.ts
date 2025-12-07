import chalk from 'chalk';
import gradientString from 'gradient-string';

/**
 * Theme system with advanced graphics for the AGI CLI
 * Enhanced with neon effects, dynamic gradients, and rich visual styling
 */

// Advanced color utilities


// Create a neon glow effect (simulated with bright colors)
const createNeonStyle = (baseColor: string, glowColor?: string) => {
  const glow = glowColor || baseColor;
  return {
    text: chalk.hex(baseColor).bold,
    bright: chalk.hex(glow).bold,
    dim: chalk.hex(baseColor),
    bg: chalk.bgHex(baseColor).hex('#FFFFFF'),
  };
};

// Dynamic color palette with neon variants
const palette = {
  // Core colors
  indigo: '#6366F1',
  purple: '#8B5CF6',
  violet: '#A78BFA',
  pink: '#EC4899',
  rose: '#F472B6',
  fuchsia: '#D946EF',

  // Neon variants
  neonBlue: '#00D4FF',
  neonPurple: '#BD00FF',
  neonPink: '#FF00E5',
  neonGreen: '#00FF9F',
  neonCyan: '#00FFFF',
  neonYellow: '#FFFF00',
  neonOrange: '#FF6B00',

  // Status colors
  emerald: '#10B981',
  teal: '#14B8A6',
  cyan: '#06B6D4',
  sky: '#0EA5E9',
  blue: '#3B82F6',
  amber: '#F59E0B',
  orange: '#F97316',
  red: '#EF4444',

  // Neutrals
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',
};

// Neon effect styles
export const neon = {
  blue: createNeonStyle(palette.neonBlue),
  purple: createNeonStyle(palette.neonPurple),
  pink: createNeonStyle(palette.neonPink),
  green: createNeonStyle(palette.neonGreen),
  cyan: createNeonStyle(palette.neonCyan),
  yellow: createNeonStyle(palette.neonYellow),
  orange: createNeonStyle(palette.neonOrange),
};

export const theme = {
  primary: chalk.hex(palette.indigo), // Indigo
  secondary: chalk.hex(palette.purple), // Purple
  accent: chalk.hex(palette.pink), // Pink
  success: chalk.hex(palette.emerald), // Green
  warning: chalk.hex(palette.amber), // Amber
  error: chalk.hex(palette.red), // Red
  info: chalk.hex(palette.blue), // Blue

  dim: chalk.dim,
  bold: chalk.bold,
  italic: chalk.italic,
  underline: chalk.underline,

  // Enhanced gradients with more options
  gradient: {
    primary: gradientString([palette.indigo, palette.purple, palette.pink]),
    cool: gradientString([palette.blue, palette.indigo, palette.purple]),
    warm: gradientString([palette.amber, palette.pink, palette.red]),
    success: gradientString([palette.emerald, palette.teal]),
    // New advanced gradients
    neon: gradientString([palette.neonCyan, palette.neonBlue, palette.neonPurple, palette.neonPink]),
    sunset: gradientString([palette.neonOrange, palette.pink, palette.neonPurple]),
    aurora: gradientString([palette.neonGreen, palette.neonCyan, palette.neonBlue, palette.neonPurple]),
    fire: gradientString([palette.neonYellow, palette.neonOrange, palette.red]),
    ocean: gradientString([palette.cyan, palette.blue, palette.indigo]),
    rainbow: gradientString(['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3']),
    matrix: gradientString(['#003300', '#00FF00', '#00FF00', '#003300']),
    synthwave: gradientString(['#FF00FF', '#00FFFF', '#FF00FF']),
    cyberpunk: gradientString([palette.neonPink, palette.neonCyan, palette.neonYellow]),
  },

  // Neon text styles for special effects
  neon: {
    blue: chalk.hex(palette.neonBlue).bold,
    purple: chalk.hex(palette.neonPurple).bold,
    pink: chalk.hex(palette.neonPink).bold,
    green: chalk.hex(palette.neonGreen).bold,
    cyan: chalk.hex(palette.neonCyan).bold,
    yellow: chalk.hex(palette.neonYellow).bold,
    orange: chalk.hex(palette.neonOrange).bold,
  },

  ui: {
    border: chalk.hex('#4B5563'),
    background: chalk.bgHex('#1F2937'),
    userPromptBackground: chalk.bgHex('#4C1D95'),
    muted: chalk.hex('#9CA3AF'),
    text: chalk.hex('#F3F4F6'),
    highlight: chalk.hex('#FCD34D').bold, // Important text
    emphasis: chalk.hex('#F472B6').bold, // Emphasized text
    code: chalk.hex('#A78BFA'), // Inline code
    number: chalk.hex('#60A5FA'), // Numbers
    string: chalk.hex('#34D399'), // Strings
    keyword: chalk.hex('#F472B6'), // Keywords
    operator: chalk.hex('#9CA3AF'), // Operators
  },

  metrics: {
    elapsedLabel: chalk.hex('#FBBF24').bold,
    elapsedValue: chalk.hex('#F472B6'),
  },

  fields: {
    label: chalk.hex('#FCD34D').bold,
    agent: chalk.hex('#F472B6'),
    profile: chalk.hex('#C084FC'),
    model: chalk.hex('#A855F7'),
    workspace: chalk.hex('#38BDF8'),
  },

  link: {
    label: chalk.hex('#F472B6').underline,
    url: chalk.hex('#38BDF8'),
  },

  diff: {
    header: chalk.hex('#FBBF24'),
    hunk: chalk.hex('#60A5FA'),
    added: chalk.hex('#10B981'),
    removed: chalk.hex('#EF4444'),
    meta: chalk.hex('#9CA3AF'),
  },

  // Thinking/reasoning block styling - distinct from regular output
  thinking: {
    icon: chalk.hex('#06B6D4'),        // Cyan for the 💭 icon
    text: chalk.hex('#67E8F9'),        // Light cyan for thinking content
    border: chalk.hex('#0E7490'),      // Darker cyan for borders
    label: chalk.hex('#22D3EE').bold,  // Bright cyan for "Thinking" label
  },

  // Badge styles for compact status indicators
  badge: {
    success: chalk.bgHex('#10B981').hex('#000000'),     // Green bg, dark text
    error: chalk.bgHex('#EF4444').hex('#FFFFFF'),       // Red bg, white text
    warning: chalk.bgHex('#F59E0B').hex('#000000'),     // Amber bg, dark text
    info: chalk.bgHex('#3B82F6').hex('#FFFFFF'),        // Blue bg, white text
    muted: chalk.bgHex('#4B5563').hex('#F3F4F6'),       // Gray bg, light text
    primary: chalk.bgHex('#6366F1').hex('#FFFFFF'),     // Indigo bg, white text
    accent: chalk.bgHex('#EC4899').hex('#FFFFFF'),      // Pink bg, white text
    cached: chalk.bgHex('#8B5CF6').hex('#FFFFFF'),      // Purple bg, white text
  },

  // Inline badge styles (lighter, no background)
  inlineBadge: {
    success: chalk.hex('#34D399'),    // Light green
    error: chalk.hex('#F87171'),      // Light red
    warning: chalk.hex('#FBBF24'),    // Light amber
    info: chalk.hex('#60A5FA'),       // Light blue
    muted: chalk.hex('#9CA3AF'),      // Gray
    primary: chalk.hex('#818CF8'),    // Light indigo
    accent: chalk.hex('#F472B6'),     // Light pink
  },

  // Progress indicators
  progress: {
    bar: chalk.hex('#6366F1'),         // Progress bar fill
    empty: chalk.hex('#374151'),       // Progress bar empty
    text: chalk.hex('#D1D5DB'),        // Progress text
    percentage: chalk.hex('#F59E0B'),  // Percentage number
  },

  // Status line styles
  status: {
    active: chalk.hex('#10B981'),      // Active/running status
    pending: chalk.hex('#6B7280'),     // Pending/waiting status
    completed: chalk.hex('#9CA3AF'),   // Completed status
    separator: chalk.hex('#4B5563'),   // Status separator
  },

  // File operation styles
  file: {
    path: chalk.hex('#38BDF8'),        // File paths
    additions: chalk.hex('#10B981'),   // +X additions
    removals: chalk.hex('#EF4444'),    // -X removals
    unchanged: chalk.hex('#6B7280'),   // Unchanged indicator
  },

  // Enhanced edit display styles
  edit: {
    header: chalk.hex('#FCD34D').bold,           // Edit header
    filePath: chalk.hex('#38BDF8').bold,         // File being edited
    lineNumber: chalk.hex('#6B7280'),            // Line numbers
    addedLine: chalk.hex('#10B981'),             // Added lines (green)
    addedBg: chalk.bgHex('#052e16').hex('#4ade80'),  // Added line background
    removedLine: chalk.hex('#EF4444'),           // Removed lines (red)
    removedBg: chalk.bgHex('#450a0a').hex('#f87171'), // Removed line background
    contextLine: chalk.hex('#9CA3AF'),           // Context lines
    separator: chalk.hex('#4B5563'),             // Separators
    summary: chalk.hex('#A78BFA'),               // Summary text
    badge: chalk.bgHex('#6366F1').hex('#FFFFFF').bold, // Edit badge
  },

  // Search result styles
  search: {
    match: chalk.hex('#FCD34D').bold,  // Matching text highlight
    context: chalk.hex('#9CA3AF'),     // Context lines
    lineNum: chalk.hex('#6B7280'),     // Line numbers
    filename: chalk.hex('#38BDF8'),    // File names in results
  },

  // Agent/task styles
  agent: {
    name: chalk.hex('#EC4899'),        // Agent name
    task: chalk.hex('#8B5CF6'),        // Task description
    result: chalk.hex('#10B981'),      // Task result
    duration: chalk.hex('#F59E0B'),    // Task duration
  },

  user: chalk.hex('#3B82F6'),
  assistant: chalk.hex('#8B5CF6'),
  system: chalk.hex('#6B7280'),
  tool: chalk.hex('#10B981'),

  // Tool-specific colors for different categories
  toolColors: {
    // Bash/Execute - Orange/Amber for shell commands
    bash: chalk.hex('#F97316'),
    execute: chalk.hex('#F97316'),

    // Read/File operations - Cyan/Sky blue
    read: chalk.hex('#06B6D4'),
    file: chalk.hex('#38BDF8'),

    // Write/Edit - Green/Emerald
    write: chalk.hex('#10B981'),
    edit: chalk.hex('#34D399'),

    // Search/Grep - Yellow/Amber
    search: chalk.hex('#FBBF24'),
    grep: chalk.hex('#FCD34D'),
    glob: chalk.hex('#F59E0B'),

    // Web operations - Blue/Indigo
    web: chalk.hex('#6366F1'),
    fetch: chalk.hex('#818CF8'),

    // Task/Agent - Purple/Violet
    task: chalk.hex('#A855F7'),
    agent: chalk.hex('#C084FC'),

    // Todo - Pink
    todo: chalk.hex('#EC4899'),

    // Notebook - Teal
    notebook: chalk.hex('#14B8A6'),

    // User interaction - Rose
    ask: chalk.hex('#FB7185'),

    // Default - Green
    default: chalk.hex('#10B981'),
  },
};

/**
 * Erosolar-CLI style icons
 * Following the official Erosolar-CLI UI conventions:
 * - ⏺ (action): Used for tool calls, actions, and thinking/reasoning
 * - ⎿ (subaction): Used for results, details, and nested information
 * - ─ (separator): Horizontal lines for dividing sections (not in this object)
 * - > (user prompt): User input prefix (used in formatUserPrompt)
 */
export const icons = {
  // Status indicators
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  pending: '○',
  running: '◐',
  cached: '⚡',

  // Navigation & flow
  arrow: '→',
  arrowRight: '▸',
  arrowDown: '▾',
  bullet: '•',
  dot: '·',

  // Tool indicators
  thinking: '◐',
  tool: '⚙',
  action: '⏺',      // Erosolar-CLI: tool actions and thoughts
  subaction: '⎿',   // Erosolar-CLI: results and details

  // User/assistant
  user: '❯',
  assistant: '◆',
  sparkle: '✨',     // Erosolar branding

  // Progress & loading
  loading: '⣾',
  spinner: ['◐', '◓', '◑', '◒'],
  progress: ['░', '▒', '▓', '█'],

  // File operations
  file: '📄',
  folder: '📁',
  edit: '✏️',
  read: '📖',
  write: '💾',
  delete: '🗑️',

  // Search & find
  search: '🔍',
  match: '◉',
  noMatch: '○',

  // Grouping & hierarchy
  branch: '│',
  corner: '└',
  tee: '├',
  horizontal: '─',

  // Context & metrics
  context: '⊛',
  time: '⏱',
  memory: '◈',
};

/**
 * Spinner animation frames (braille dots style)
 */
export const spinnerFrames = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
  circle: ['◐', '◓', '◑', '◒'],
  bounce: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
  braille: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
};

/**
 * Progress bar characters
 */
export const progressChars = {
  filled: '█',
  empty: '░',
  partial: ['▏', '▎', '▍', '▌', '▋', '▊', '▉'],
};

/**
 * Box drawing characters for panels
 */
export const boxChars = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
  cross: '┼',
};

/**
 * Get the appropriate color function for a tool name
 * Returns different colors based on tool category
 */
export function getToolColor(toolName: string): (text: string) => string {
  const name = toolName.toLowerCase();

  // Bash/Execute commands - Orange
  if (name.includes('bash') || name.includes('execute') || name === 'killshell' || name === 'bashoutput') {
    return theme.toolColors.bash;
  }

  // Read/File operations - Cyan
  if (name.includes('read') || name === 'glob' || name === 'list_files') {
    return theme.toolColors.read;
  }

  // Write operations - Green
  if (name.includes('write')) {
    return theme.toolColors.write;
  }

  // Edit operations - Light green
  if (name.includes('edit')) {
    return theme.toolColors.edit;
  }

  // Search/Grep - Yellow
  if (name.includes('grep') || name.includes('search')) {
    return theme.toolColors.grep;
  }

  // Glob pattern search - Amber
  if (name === 'glob') {
    return theme.toolColors.glob;
  }

  // Web operations - Indigo
  if (name.includes('web') || name.includes('fetch')) {
    return theme.toolColors.web;
  }

  // Task/Agent - Purple
  if (name === 'task' || name.includes('agent')) {
    return theme.toolColors.task;
  }

  // Todo - Pink
  if (name.includes('todo')) {
    return theme.toolColors.todo;
  }

  // Notebook - Teal
  if (name.includes('notebook')) {
    return theme.toolColors.notebook;
  }

  // User interaction - Rose
  if (name.includes('ask') || name.includes('question')) {
    return theme.toolColors.ask;
  }

  // Default - Green
  return theme.toolColors.default;
}

/**
 * Format a tool name with category-specific coloring
 */
export function formatToolName(toolName: string): string {
  const colorFn = getToolColor(toolName);
  return colorFn(`[${toolName}]`);
}

export function formatBanner(profileLabel: string, model: string): string {
  const name = profileLabel || 'Agent';
  const title = theme.gradient.primary(name);
  const subtitle = theme.ui.muted(`${model} • Interactive Shell`);

  return `\n${title}\n${subtitle}\n`;
}

export function formatUserPrompt(_profile?: string): string {
  // Always use '>' as the user input prefix for consistent look
  const glyph = theme.user('>');
  return `${glyph} `;
}

/**
 * Get the raw '>' prompt character for display consistency
 */
export const USER_PROMPT_PREFIX = '> ';

export function formatToolCall(name: string, status: 'running' | 'success' | 'error'): string {
  const statusIcon = status === 'running' ? icons.thinking :
                     status === 'success' ? icons.success : icons.error;
  const statusColor = status === 'running' ? theme.info :
                      status === 'success' ? theme.success : theme.error;

  // Use category-specific coloring for tool names
  const toolColor = getToolColor(name);
  return `${statusColor(statusIcon)} ${toolColor(`[${name}]`)}`;
}

export function formatMessage(role: 'user' | 'assistant' | 'system', content: string): string {
  switch (role) {
    case 'user':
      return `${theme.user('You:')} ${content}`;
    case 'assistant':
      return `${theme.assistant('Assistant:')} ${content}`;
    case 'system':
      return theme.system(`[System] ${content}`);
  }
}
