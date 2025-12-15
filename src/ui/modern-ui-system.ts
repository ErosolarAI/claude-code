/**
 * Modern UI System - Enhanced, Robust UI/UX for AGI Core
 * 
 * Consolidates all legacy UI components into a unified, type-safe, and robust system.
 * Features:
 * - Type-safe color and styling system
 * - Robust layout and responsive design
 * - Accessible and semantic components
 * - Performance-optimized rendering
 * - Comprehensive error handling
 * - Cross-platform compatibility
 */

import { theme, icons, neon, palette } from './theme.js';
import * as layout from './layout.js';
import * as uiConstants from './uiConstants.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type VisualTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type LayoutPriority = 'critical' | 'high' | 'medium' | 'low';
export type ResponsiveSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface UIComponentConfig {
  id: string;
  priority: LayoutPriority;
  responsive: boolean;
  accessible: boolean;
  keyboardNavigable: boolean;
  screenReaderLabel?: string;
  ariaLabel?: string;
  ariaLive?: 'off' | 'polite' | 'assertive';
}

export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface ResponsiveConfig {
  terminalWidth: number;
  fontSize: number;
  lineHeight: number;
  padding: number;
  margin: number;
}

// ============================================================================
// Core UI System
// ============================================================================

export class ModernUISystem {
  private config: ResponsiveConfig;
  private colorScheme: ColorScheme;
  private activeComponents: Map<string, UIComponentConfig> = new Map();
  private errorBoundary: ErrorBoundary;

  constructor() {
    this.config = this.detectTerminalConfig();
    this.colorScheme = this.createColorScheme();
    this.errorBoundary = new ErrorBoundary();
  }

  // ============================================================================
  // Configuration & Detection
  // ============================================================================

  private detectTerminalConfig(): ResponsiveConfig {
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;
    
    return {
      terminalWidth: width,
      fontSize: 1, // Normalized unit
      lineHeight: 1.2,
      padding: Math.max(1, Math.floor(width / 80)),
      margin: Math.max(1, Math.floor(width / 40)),
    };
  }

  private createColorScheme(): ColorScheme {
    return {
      primary: palette.indigo,
      secondary: palette.purple,
      accent: palette.neonBlue,
      background: palette.slate900,
      foreground: palette.slate50,
      muted: palette.slate400,
      success: palette.emerald,
      warning: palette.amber,
      error: palette.red,
      info: palette.cyan,
    };
  }

  // ============================================================================
  // Component Registration & Management
  // ============================================================================

  registerComponent(config: UIComponentConfig): void {
    try {
      this.validateComponentConfig(config);
      this.activeComponents.set(config.id, config);
    } catch (error) {
      this.errorBoundary.handle(error, 'Component Registration');
    }
  }

  unregisterComponent(id: string): boolean {
    return this.activeComponents.delete(id);
  }

  getComponent(id: string): UIComponentConfig | undefined {
    return this.activeComponents.get(id);
  }

  // ============================================================================
  // Rendering System
  // ============================================================================

  renderComponent(component: UIComponent): string {
    return this.errorBoundary.execute(() => {
      return component.render(this.config);
    }, 'Component Rendering');
  }

  renderSafe(component: UIComponent, fallback?: string): string {
    try {
      return this.renderComponent(component);
    } catch (error) {
      const errorMsg = this.errorBoundary.handle(error, 'Safe Rendering');
      return fallback || errorMsg;
    }
  }

  // ============================================================================
  // Layout & Responsive Design
  // ============================================================================

  calculateResponsiveWidth(baseWidth: number): number {
    const { terminalWidth } = this.config;
    const responsiveBreakpoints = {
      xs: 40,
      sm: 60,
      md: 80,
      lg: 100,
      xl: 120,
    };

    if (terminalWidth <= responsiveBreakpoints.xs) return Math.min(baseWidth, 40);
    if (terminalWidth <= responsiveBreakpoints.sm) return Math.min(baseWidth, 60);
    if (terminalWidth <= responsiveBreakpoints.md) return Math.min(baseWidth, 80);
    if (terminalWidth <= responsiveBreakpoints.lg) return Math.min(baseWidth, 100);
    return baseWidth;
  }

  wrapText(text: string, width?: number): string[] {
    const wrapWidth = width || this.calculateResponsiveWidth(this.config.terminalWidth);
    const wrapped = layout.wrapParagraph(text, wrapWidth);
    return wrapped.map(line => line.trim());
  }

  // ============================================================================
  // Accessibility & Semantic Markup
  // ============================================================================

  addAccessibilityAttributes(
    content: string,
    config: UIComponentConfig
  ): string {
    const attributes: string[] = [];
    
    if (config.ariaLabel) {
      attributes.push(`aria-label="${config.ariaLabel}"`);
    }
    
    if (config.screenReaderLabel) {
      // Add screen reader only text
      const srText = this.createScreenReaderText(config.screenReaderLabel);
      return `${srText}${content}`;
    }

    return content;
  }

  private createScreenReaderText(text: string): string {
    // For terminal accessibility, we can prepend with a special marker
    // that screen readers or accessibility tools can detect
    return `[SR:${text}] `;
  }

  // ============================================================================
  // Error Boundary & Validation
  // ============================================================================

  private validateComponentConfig(config: UIComponentConfig): void {
    const requiredFields = ['id', 'priority', 'responsive', 'accessible', 'keyboardNavigable'];
    
    for (const field of requiredFields) {
      if (!(field in config)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (config.id.length === 0) {
      throw new Error('Component ID cannot be empty');
    }

    if (config.id.length > 50) {
      throw new Error('Component ID too long (max 50 chars)');
    }

    const validPriorities: LayoutPriority[] = ['critical', 'high', 'medium', 'low'];
    if (!validPriorities.includes(config.priority)) {
      throw new Error(`Invalid priority: ${config.priority}`);
    }
  }
}

// ============================================================================
// Error Boundary System
// ============================================================================

export class ErrorBoundary {
  private errorLog: Array<{timestamp: Date; component: string; error: Error}> = [];

  execute<T>(fn: () => T, component: string): T {
    try {
      return fn();
    } catch (error) {
      this.handle(error, component);
      throw error;
    }
  }

  handle(error: unknown, component: string): string {
    const timestamp = new Date();
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    this.errorLog.push({ timestamp, component, error: errorObj });
    
    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }

    // Return user-friendly error message
    return this.formatErrorMessage(errorObj, component);
  }

  private formatErrorMessage(error: Error, component: string): string {
    const errorId = Math.random().toString(36).substr(2, 9);
    const timestamp = new Date().toISOString();
    
    return [
      theme.error(`✗ UI Error [${errorId}]`),
      theme.ui.muted(`Component: ${component}`),
      theme.ui.muted(`Time: ${timestamp}`),
      theme.ui.text(error.message),
      theme.ui.muted('(Error logged for debugging)'),
    ].join('\n');
  }

  getErrors(): Array<{timestamp: Date; component: string; error: Error}> {
    return [...this.errorLog];
  }

  clearErrors(): void {
    this.errorLog = [];
  }
}

// ============================================================================
// UI Component Interfaces
// ============================================================================

export interface UIComponent {
  render(config: ResponsiveConfig): string;
  getConfig(): UIComponentConfig;
}

export abstract class BaseComponent implements UIComponent {
  abstract render(config: ResponsiveConfig): string;
  abstract getConfig(): UIComponentConfig;

  protected validateRenderResult(result: string): void {
    if (typeof result !== 'string') {
      throw new Error('Render method must return a string');
    }
    
    if (result.length === 0) {
      throw new Error('Render result cannot be empty');
    }
  }
}

// ============================================================================
// Pre-built Components
// ============================================================================

export class StatusBarComponent extends BaseComponent {
  private segments: Array<{label: string; value: string; tone: VisualTone}> = [];

  constructor(
    private id: string,
    private priority: LayoutPriority = 'medium'
  ) {
    super();
  }

  addSegment(label: string, value: string, tone: VisualTone = 'neutral'): void {
    this.segments.push({ label, value, tone });
  }

  render(config: ResponsiveConfig): string {
    if (this.segments.length === 0) {
      return '';
    }

    const maxWidth = this.calculateResponsiveWidth(config);
    const divider = theme.ui.muted(` ${icons.bullet} `);
    const formattedSegments = this.segments.map(segment =>
      this.formatSegment(segment, maxWidth)
    );

    const lines: string[] = [];
    let currentLine = '';

    for (const segment of formattedSegments) {
      if (!currentLine) {
        currentLine = segment;
      } else {
        const candidate = `${currentLine}${divider}${segment}`;
        if (layout.measure(candidate) > maxWidth) {
          lines.push(layout.padLine(currentLine, maxWidth));
          currentLine = segment;
        } else {
          currentLine = candidate;
        }
      }
    }

    if (currentLine) {
      lines.push(layout.padLine(currentLine, maxWidth));
    }

    return lines.join('\n');
  }

  getConfig(): UIComponentConfig {
    return {
      id: this.id,
      priority: this.priority,
      responsive: true,
      accessible: true,
      keyboardNavigable: false,
      screenReaderLabel: 'Status information',
      ariaLabel: 'Application status',
      ariaLive: 'polite',
    };
  }

  private formatSegment(
    segment: {label: string; value: string; tone: VisualTone},
    maxWidth: number
  ): string {
    const toneColors: Record<VisualTone, (text: string) => string> = {
      neutral: theme.ui.text,
      info: theme.info,
      success: theme.success,
      warning: theme.warning,
      danger: theme.error,
      accent: theme.secondary,
    };

    const colorizer = toneColors[segment.tone] || theme.ui.text;
    const icon = segment.label.includes('✓') || segment.label.includes('⚠') 
      ? '' 
      : '';
    
    const label = theme.ui.muted(segment.label.trim().toUpperCase());
    const value = colorizer(segment.value.trim());
    
    return `${icon}${label} ${value}`;
  }

  private calculateResponsiveWidth(config: ResponsiveConfig): number {
    const baseWidth = config.terminalWidth - (config.padding * 2);
    return Math.max(20, baseWidth);
  }
}

export class CalloutComponent extends BaseComponent {
  constructor(
    private id: string,
    private message: string,
    private options: {
      title?: string;
      icon?: string;
      tone?: VisualTone;
      priority?: LayoutPriority;
    } = {}
  ) {
    super();
  }

  render(config: ResponsiveConfig): string {
    const tone = this.options.tone || 'info';
    const icon = this.options.icon || icons.info;
    const title = this.options.title || this.capitalize(tone);
    
    const toneColors: Record<VisualTone, (text: string) => string> = {
      neutral: theme.ui.text,
      info: theme.info,
      success: theme.success,
      warning: theme.warning,
      danger: theme.error,
      accent: theme.secondary,
    };

    const accent = toneColors[tone] || toneColors.info;
    const width = this.calculateResponsiveWidth(config);
    const contentWidth = Math.max(24, layout.normalizePanelWidth(width) - 4);

    // Split and wrap text
    const rawLines = this.message.split('\n');
    const paragraphs: string[] = [];

    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        paragraphs.push('');
      } else {
        const wrapped = layout.wrapParagraph(trimmed, contentWidth);
        paragraphs.push(...wrapped);
      }
    }

    return layout.renderPanel(paragraphs, {
      icon,
      title,
      accentColor: accent,
      borderColor: accent,
      width,
    });
  }

  getConfig(): UIComponentConfig {
    return {
      id: this.id,
      priority: this.options.priority || 'medium',
      responsive: true,
      accessible: true,
      keyboardNavigable: false,
      screenReaderLabel: `${this.options.tone || 'info'} callout: ${this.message.substring(0, 50)}`,
      ariaLabel: `${this.options.title || this.options.tone} message`,
      ariaLive: 'polite',
    };
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private calculateResponsiveWidth(config: ResponsiveConfig): number {
    const baseWidth = config.terminalWidth - (config.padding * 2);
    return Math.max(40, Math.min(baseWidth, 120));
  }
}

export class SectionHeadingComponent extends BaseComponent {
  constructor(
    private id: string,
    private title: string,
    private options: {
      subtitle?: string;
      icon?: string;
      tone?: VisualTone;
      priority?: LayoutPriority;
    } = {}
  ) {
    super();
  }

  render(config: ResponsiveConfig): string {
    const width = this.calculateResponsiveWidth(config);
    const tone = this.options.tone || 'accent';
    
    const toneColors: Record<VisualTone, (text: string) => string> = {
      neutral: theme.ui.text,
      info: theme.info,
      success: theme.success,
      warning: theme.warning,
      danger: theme.error,
      accent: theme.secondary,
    };

    const accent = toneColors[tone] || toneColors.accent;
    const icon = this.options.icon ? `${this.options.icon} ` : '';
    const label = `${icon}${this.title}`.toUpperCase();
    const underline = accent('━'.repeat(width));
    
    const lines = [underline, accent(layout.padLine(label, width))];
    
    if (this.options.subtitle?.trim()) {
      const subtitle = theme.ui.muted(this.options.subtitle.trim());
      lines.push(layout.padLine(subtitle, width));
    }

    return lines.join('\n');
  }

  getConfig(): UIComponentConfig {
    return {
      id: this.id,
      priority: this.options.priority || 'medium',
      responsive: true,
      accessible: true,
      keyboardNavigable: false,
      screenReaderLabel: `Section heading: ${this.title}`,
      ariaLabel: this.title,
      ariaLive: 'off',
    };
  }

  private calculateResponsiveWidth(config: ResponsiveConfig): number {
    const baseWidth = config.terminalWidth - (config.padding * 2);
    return Math.max(20, baseWidth);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createModernUISystem(): ModernUISystem {
  return new ModernUISystem();
}

export function renderSecurityFinding(
  finding: {
    name: string;
    description: string;
    severity: SeverityLevel;
    evidence?: string[];
    remediation?: string;
  },
  config: ResponsiveConfig
): string {
  const severityColors: Record<SeverityLevel, (text: string) => string> = {
    critical: neon.pink.text,
    high: theme.error,
    medium: theme.warning,
    low: theme.info,
    info: theme.ui.text,
  };

  const severityIcons: Record<SeverityLevel, string> = {
    critical: '⚠',
    high: '▲',
    medium: '▲',
    low: '▼',
    info: 'ℹ',
  };

  const color = severityColors[finding.severity] || theme.ui.text;
  const icon = severityIcons[finding.severity] || 'ℹ';

  const lines: string[] = [];
  lines.push(`${icon} ${color(finding.name)}`);
  lines.push(`  ${theme.ui.muted('Description:')} ${theme.ui.text(finding.description)}`);
  
  if (finding.evidence?.length) {
    lines.push(`  ${theme.ui.muted('Evidence:')}`);
    finding.evidence.forEach(evidence => {
      lines.push(`    ${theme.ui.text(`- ${evidence}`)}`);
    });
  }
  
  if (finding.remediation) {
    lines.push(`  ${theme.ui.muted('Remediation:')} ${theme.success(finding.remediation)}`);
  }

  return lines.join('\n');
}

export function renderProgress(
  phase: string,
  current: number,
  total: number,
  config: ResponsiveConfig
): string {
  const percentage = Math.round((current / total) * 100);
  const barWidth = Math.max(10, Math.min(20, config.terminalWidth - 30));
  const filled = Math.round((current / total) * barWidth);
  const empty = barWidth - filled;

  const bar = theme.success('█'.repeat(filled)) + theme.ui.muted('░'.repeat(empty));
  const phaseLabel = theme.info(phase);
  const progressText = theme.ui.muted(`${current}/${total}`);
  const percentText = theme.success(`${percentage}%`);

  return `${phaseLabel} ${bar} ${progressText} ${percentText}`;
}

export function renderBanner(
  title: string,
  subtitle?: string,
  config?: ResponsiveConfig
): string {
  const width = config?.terminalWidth || 70;
  const adjustedWidth = Math.min(width, 80);
  
  const lines: string[] = [];
  lines.push(neon.cyan.text('═'.repeat(adjustedWidth)));
  lines.push(`${theme.primary('🛡️')} ${neon.cyan.text(title.toUpperCase())}`);
  
  if (subtitle) {
    lines.push(theme.ui.muted(`  ${subtitle}`));
  }
  
  lines.push(neon.cyan.text('═'.repeat(adjustedWidth)));
  return lines.join('\n');
}

export function renderDataTable<T extends Record<string, any>>(
  data: T[],
  columns: Array<{key: keyof T; label: string; width?: number; align?: 'left' | 'right' | 'center'}>,
  config: ResponsiveConfig
): string {
  if (data.length === 0) {
    return theme.ui.muted('No data available');
  }

  // Calculate column widths
  const columnWidths = columns.map(col => {
    const contentWidth = Math.max(
      ...data.map(item => String(item[col.key] || '').length),
      col.label.length
    );
    return Math.min(col.width || contentWidth, Math.floor(config.terminalWidth / columns.length));
  });

  // Build header
  const header = columns
    .map((col, i) => {
      const label = col.label.toUpperCase();
      return theme.ui.muted(label.padEnd(columnWidths[i]));
    })
    .join('  ');

  // Build separator
  const separator = columns
    .map((col, i) => theme.ui.muted('─'.repeat(columnWidths[i])))
    .join('──');

  // Build rows
  const rows = data.map(item => {
    return columns
      .map((col, i) => {
        const value = String(item[col.key] || '');
        const align = col.align || 'left';
        const padded = align === 'right' 
          ? value.padStart(columnWidths[i])
          : align === 'center'
            ? value.padStart(Math.floor((columnWidths[i] + value.length) / 2)).padEnd(columnWidths[i])
            : value.padEnd(columnWidths[i]);
        
        return theme.ui.text(padded);
      })
      .join('  ');
  });

  return [header, separator, ...rows].join('\n');
}

export function renderTimeline(
  events: Array<{timestamp: string; event: string; status: 'success' | 'warning' | 'error' | 'info'}>,
  config: ResponsiveConfig
): string {
  const lines: string[] = [];
  const maxWidth = config.terminalWidth - 15;

  const statusIcons = {
    success: theme.success('✓'),
    warning: theme.warning('⚠'),
    error: theme.error('✗'),
    info: theme.info('ℹ'),
  };

  events.forEach((event, index) => {
    const icon = statusIcons[event.status] || statusIcons.info;
    const timestamp = theme.ui.muted(event.timestamp.padEnd(12));
    const eventText = layout.wrapParagraph(event.event, maxWidth)[0];
    
    const connector = index < events.length - 1 ? '├─' : '└─';
    lines.push(`${theme.ui.muted(connector)} ${icon} ${timestamp} ${theme.ui.text(eventText)}`);
  });

  return lines.join('\n');
}

export function createColorScale(
  value: number,
  min: number = 0,
  max: number = 100
): (text: string) => string {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  
  if (normalized >= 0.9) return neon.pink.text;
  if (normalized >= 0.7) return theme.error;
  if (normalized >= 0.5) return theme.warning;
  if (normalized >= 0.3) return theme.info;
  return theme.success;
}

export function formatHumanReadableBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// ============================================================================
// Exports & Quick Access
// ============================================================================

export const ui = {
  system: createModernUISystem,
  components: {
    StatusBar: StatusBarComponent,
    Callout: CalloutComponent,
    SectionHeading: SectionHeadingComponent,
  },
  render: {
    progress: renderProgress,
    banner: renderBanner,
    dataTable: renderDataTable,
    timeline: renderTimeline,
    securityFinding: renderSecurityFinding,
  },
  format: {
    bytes: formatHumanReadableBytes,
    duration: formatDuration,
    colorScale: createColorScale,
  },
  colors: {
    theme,
    neon,
    palette,
  },
  constants: uiConstants,
  layout,
};