/**
 * Unified Launch UI - Single unified interface for all AGI Core operations
 */

import type { UnifiedUIRenderer } from './UnifiedUIRenderer.js';
import chalk from 'chalk';

export class UnifiedLaunchUI {
  public renderer: UnifiedUIRenderer;

  constructor(renderer: UnifiedUIRenderer) {
    this.renderer = renderer;
  }

  // Compatibility methods for AppleSecurityUI
  static severityColors = {
    critical: chalk.redBright,
    high: chalk.red,
    medium: chalk.yellow,
    low: chalk.blue,
    info: chalk.gray
  };

  static categoryColors = {
    cloud: chalk.cyan,
    developer: chalk.magenta,
    media: chalk.green,
    system: chalk.yellow,
    enterprise: chalk.blue,
    security: chalk.red
  };

  createSecurityBanner(title: string, subtitle?: string): string {
    const lines: string[] = [];
    const width = Math.max(title.length, subtitle?.length || 0) + 6;
    lines.push('╭' + '─'.repeat(width) + '╮');
    lines.push(`│   ${title.padEnd(width - 4)}   │`);
    if (subtitle) {
      lines.push(`│   ${subtitle.padEnd(width - 4)}   │`);
    }
    lines.push('╰' + '─'.repeat(width) + '╯');
    return lines.join('\n');
  }

  createSecuritySpinner(message: string): string {
    return `⏳ ${message}`;
  }

  formatAuditProgress(phase: string, progress: number, total: number): string {
    const percent = Math.round((progress / total) * 100);
    return `Progress: ${phase} (${progress}/${total}, ${percent}%)`;
  }

  formatVulnerability(vuln: any): string {
    return `⚠ ${vuln.name || vuln.id || 'Vulnerability'} - ${vuln.severity || 'unknown'}`;
  }

  formatRemediation(category: string, steps: string[]): string {
    return `🔧 ${category}: ${steps.length} steps`;
  }

  formatSecuritySummary(results: any): string {
    const total = results.findings?.length || 0;
    const critical = results.findings?.filter((f: any) => f.severity === 'critical').length || 0;
    return `Findings: ${total} total, ${critical} critical`;
  }

  formatFindingsTable(findings: any[]): string {
    if (findings.length === 0) {
      return 'No findings to display.';
    }
    return `Found ${findings.length} security findings`;
  }

  formatSecurityStatus(status: string, message?: string): string {
    const statusIcon = status === 'secure' ? '✅' : status === 'warning' ? '⚠' : '❌';
    return `${statusIcon} ${status.toUpperCase()}${message ? `: ${message}` : ''}`;
  }

  getServiceIcon(category: string): string {
    const icons: Record<string, string> = {
      cloud: '☁',
      developer: '🛠',
      media: '🎬',
      system: '🖥',
      enterprise: '🏢',
      security: '🛡'
    };
    return icons[category] || '●';
  }

  // Unified launch methods
  async launch(
    operation: 'interactive' | 'quick' | 'security-audit' | 'zero-day' | 'attack' | 'tournament',
    options: any = {}
  ): Promise<void> {
    this.renderer.addEvent('banner', `╭─ ${operation.toUpperCase().replace('-', ' ')} ─╮`);
    this.renderer.addEvent('banner', `╰${'─'.repeat(operation.length + 8)}╯`);
    
    switch (operation) {
      case 'interactive':
        this.renderer.addEvent('response', 'Starting interactive shell...');
        const { runInteractiveShell } = await import('../headless/interactiveShell.js');
        await runInteractiveShell({ argv: options.argv || [] });
        break;
      case 'quick':
        this.renderer.addEvent('response', 'Starting quick mode...');
        const { runQuickMode } = await import('../headless/quickMode.js');
        await runQuickMode({ argv: options.argv || [] });
        break;
      case 'security-audit':
        this.renderer.addEvent('response', 'Starting security audit...');
        const { runDefaultSecurityAudit } = await import('../core/universalSecurityAudit.js');
        const result = await runDefaultSecurityAudit();
        this.renderer.addEvent('response', `Findings: ${result.findings.length}`);
        break;
      case 'zero-day':
        this.renderer.addEvent('response', 'Starting zero-day discovery...');
        const { ZeroDayDiscovery } = await import('../core/zeroDayDiscovery.js');
        const discovery = new ZeroDayDiscovery({
          target: options.target || 'localhost',
          targetType: options.targetType || 'web'
        });
        const zeroDayResult = await discovery.discover();
        this.renderer.addEvent('response', `Status: ${zeroDayResult.status || 'completed'}`);
        break;
      case 'attack':
        this.renderer.addEvent('response', 'Attack mode placeholder...');
        this.renderer.addEvent('response', `Target: ${options.target || 'localhost'}`);
        break;
      case 'tournament':
        this.renderer.addEvent('response', 'Tournament mode placeholder...');
        this.renderer.addEvent('response', `Mode: ${options.mode || 'security'}`);
        break;
    }
  }
}