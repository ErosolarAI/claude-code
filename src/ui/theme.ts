import chalk from 'chalk';

// Type for gradient function returned by gradientString
type GradientFunction = (text: string) => string;

/**
 * Theme system for the AGI CLI
 * Clean, minimal, and professional color scheme
 */

// Create a consistent color style
const createStyle = (baseColor: string, accentColor?: string) => {
  const accent = accentColor || baseColor;
  return {
    text: chalk.hex(baseColor).bold,
    bright: chalk.hex(accent).bold,
    dim: chalk.hex(baseColor),
    bg: chalk.bgHex(baseColor).hex('#FFFFFF'),
  };
};

// Modern, professional color palette
export const palette = {
  // Primary colors
  indigo: '#4F46E5',
  purple: '#7C3AED',
  violet: '#8B5CF6',
  blue: '#3D8BFF',
  cyan: '#00D4FF',
  teal: '#00C7B3',
  emerald: '#00D68F',
  green: '#10B981',
  amber: '#FFB224',
  orange: '#FF6B35',
  red: '#FF4757',
  pink: '#DB2777',
  rose: '#F472B6',
  
  // Neutrals
  slate50: '#F8FAFF',
  slate100: '#F1F5FF',
  slate200: '#E2E8FF',
  slate300: '#CBD5FF',
  slate400: '#94A3FF',
  slate500: '#6474FF',
  slate600: '#4756FF',
  slate700: '#3341FF',
  slate800: '#1E29FF',
  slate900: '#0F17FF',
  
  // Status colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

// Professional style variants
export const style = {
  primary: createStyle(palette.indigo),
  secondary: createStyle(palette.purple),
  success: createStyle(palette.success),
  warning: createStyle(palette.warning),
  error: createStyle(palette.error),
  info: createStyle(palette.info),
  cyan: createStyle(palette.cyan),
  teal: createStyle(palette.teal),
  emerald: createStyle(palette.emerald),
};

// Spinner frames for loading animations
export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const theme = {
  // Primary UI colors
  ui: {
    primary: style.primary.text,
    secondary: style.secondary.text,
    success: style.success.text,
    warning: style.warning.text,
    error: style.error.text,
    info: style.info.text,
    muted: chalk.gray,
    subtle: chalk.gray.dim,
    highlight: chalk.white.bold,
  },
  
  // Tool colors by category
  tools: {
    edit: style.emerald.text,
    bash: style.cyan.text,
    search: style.teal.text,
    file: style.primary.text,
    git: style.secondary.text,
    web: style.info.text,
    meta: chalk.magenta,
  },
  
  // Agent status colors
  agent: {
    thinking: style.cyan.text,
    working: style.teal.text,
    done: style.success.text,
    error: style.error.text,
    idle: chalk.gray,
  },
  
  // Status line colors
  status: {
    active: style.success.text,
    paused: style.warning.text,
    stopped: style.error.text,
    pending: chalk.gray,
  },
  
  // Tournament/dual RL colors
  tournament: {
    primary: style.primary.text,
    refiner: style.secondary.text,
    winner: style.success.text,
    tie: style.warning.text,
    score: style.cyan.text,
    accuracy: style.teal.text,
  },
  
  // Progress indicators
  progress: {
    bar: style.primary.text,
    percentage: style.cyan.text,
    step: style.info.text,
    complete: style.success.text,
  },
  
  // Code highlighting
  code: {
    keyword: chalk.blue,
    string: chalk.green,
    number: chalk.yellow,
    comment: chalk.gray,
    function: chalk.cyan,
    variable: chalk.white,
    type: chalk.magenta,
  },
};

// Get appropriate color for a tool based on its name
export function getToolColor(toolName: string): (text: string) => string {
  const lowerName = toolName.toLowerCase();
  
  if (lowerName.includes('edit') || lowerName.includes('write') || lowerName.includes('modify')) {
    return theme.tools.edit;
  }
  if (lowerName.includes('bash') || lowerName.includes('exec') || lowerName.includes('run')) {
    return theme.tools.bash;
  }
  if (lowerName.includes('search') || lowerName.includes('find') || lowerName.includes('grep')) {
    return theme.tools.search;
  }
  if (lowerName.includes('file') || lowerName.includes('read') || lowerName.includes('write')) {
    return theme.tools.file;
  }
  if (lowerName.includes('git') || lowerName.includes('commit') || lowerName.includes('branch')) {
    return theme.tools.git;
  }
  if (lowerName.includes('web') || lowerName.includes('http') || lowerName.includes('fetch')) {
    return theme.tools.web;
  }
  
  return theme.tools.meta;
}

// Helper to create a consistent banner
export function createBanner(title: string, subtitle?: string): string {
  const lines: string[] = [];
  lines.push(theme.ui.primary('╔' + '═'.repeat(68) + '╗'));
  lines.push(theme.ui.primary('║ ') + theme.ui.primary.bold(title.padEnd(66)) + theme.ui.primary(' ║'));
  if (subtitle) {
    lines.push(theme.ui.primary('║ ') + theme.ui.muted(subtitle.padEnd(66)) + theme.ui.primary(' ║'));
  }
  lines.push(theme.ui.primary('╚' + '═'.repeat(68) + '╝'));
  return lines.join('\n');
}

// Helper to create a progress bar
export function formatProgress(phase: string, step: number, totalSteps: number): string {
  const percentage = Math.round((step / totalSteps) * 100);
  const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
  return `${theme.ui.primary('⠋')} ${theme.ui.highlight(phase)}: [${theme.progress.bar(progressBar)}] ${theme.progress.percentage(percentage + '%')} ${theme.ui.muted('(' + step + '/' + totalSteps + ')')}`;
}

export default theme;