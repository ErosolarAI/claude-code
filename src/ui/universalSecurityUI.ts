/**
 * Universal Security UI Component
 *
 * Provides rich UI components for displaying security findings,
 * vulnerabilities, and audit results for ALL cloud providers.
 * This is the DEFAULT UI for AGI Core security operations.
 */

import chalk from 'chalk';
import type {
  SecurityFinding,
  AuditSummary,
  RemediationResult,
  RemediationSummary,
  CloudProvider,
  SeverityLevel,
  Exploitability,
} from '../core/universalSecurityAudit.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Color Schemes
// ═══════════════════════════════════════════════════════════════════════════════

const SEVERITY_COLORS = {
  critical: chalk.redBright,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.blue,
  info: chalk.gray,
};

const PROVIDER_COLORS = {
  gcp: chalk.cyan,
  aws: chalk.yellow,
  azure: chalk.blue,
  custom: chalk.magenta,
};

const EXPLOITABILITY_COLORS = {
  trivial: chalk.redBright,
  moderate: chalk.yellow,
  complex: chalk.blue,
  theoretical: chalk.gray,
};

const SEVERITY_ICONS = {
  critical: chalk.redBright('⚠'),
  high: chalk.red('▲'),
  medium: chalk.yellow('▲'),
  low: chalk.blue('▼'),
  info: chalk.gray('ℹ'),
};

const PROVIDER_ICONS = {
  gcp: chalk.cyan('☁'),
  aws: chalk.yellow('◆'),
  azure: chalk.blue('◈'),
  custom: chalk.magenta('★'),
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main UI Class
// ═══════════════════════════════════════════════════════════════════════════════

export class UniversalSecurityUI {
  /**
   * Format a single security finding with full details
   */
  static formatFinding(finding: SecurityFinding): string {
    const severityColor = SEVERITY_COLORS[finding.severity];
    const providerColor = PROVIDER_COLORS[finding.provider];
    const exploitColor = EXPLOITABILITY_COLORS[finding.exploitability];
    const severityIcon = SEVERITY_ICONS[finding.severity];
    const providerIcon = PROVIDER_ICONS[finding.provider];

    const lines: string[] = [];
    lines.push(`${severityIcon} ${severityColor.bold(finding.vulnerability)}`);
    lines.push(`  ${chalk.gray('ID:')} ${chalk.white(finding.id)}`);
    lines.push(`  ${chalk.gray('Provider:')} ${providerIcon} ${providerColor(finding.provider.toUpperCase())}`);
    lines.push(`  ${chalk.gray('Severity:')} ${severityColor(finding.severity.toUpperCase())}`);
    lines.push(`  ${chalk.gray('Confidence:')} ${chalk.white(`${(finding.confidence * 100).toFixed(1)}%`)}`);
    lines.push(`  ${chalk.gray('Exploitability:')} ${exploitColor(finding.exploitability)}`);
    lines.push(`  ${chalk.gray('Resource:')} ${chalk.cyan(finding.resource)}`);
    lines.push(`  ${chalk.gray('Technique:')} ${chalk.white(finding.technique)}`);
    if (finding.aptPhase) {
      lines.push(`  ${chalk.gray('APT Phase:')} ${chalk.yellow(finding.aptPhase)}`);
    }
    if (finding.verified) {
      lines.push(`  ${chalk.gray('Status:')} ${chalk.green('VERIFIED')}`);
    } else {
      lines.push(`  ${chalk.gray('Status:')} ${chalk.yellow('PREDICTED')}`);
    }
    lines.push(`  ${chalk.gray('Evidence:')}`);
    for (const evidence of finding.evidence.slice(0, 5)) {
      lines.push(`    ${chalk.gray('•')} ${chalk.white(evidence)}`);
    }
    if (finding.evidence.length > 5) {
      lines.push(`    ${chalk.gray(`+${finding.evidence.length - 5} more...`)}`);
    }
    if (finding.remediation) {
      lines.push(`  ${chalk.gray('Remediation:')} ${chalk.green(finding.remediation)}`);
    }
    lines.push(`  ${chalk.gray('Timestamp:')} ${chalk.gray(finding.timestamp)}`);

    return lines.join('\n');
  }

  /**
   * Format a compact finding for list views
   */
  static formatFindingCompact(finding: SecurityFinding): string {
    const severityColor = SEVERITY_COLORS[finding.severity];
    const severityIcon = SEVERITY_ICONS[finding.severity];
    const providerIcon = PROVIDER_ICONS[finding.provider];
    const verifiedBadge = finding.verified ? chalk.green('[V]') : chalk.yellow('[P]');

    return `${severityIcon} ${verifiedBadge} ${providerIcon} ${severityColor(finding.severity.toUpperCase().padEnd(8))} ${chalk.white(finding.vulnerability)}`;
  }

  /**
   * Format audit summary statistics
   */
  static formatSummary(summary: AuditSummary): string {
    const providerColor = PROVIDER_COLORS[summary.provider];
    const duration = summary.duration < 1000
      ? `${summary.duration}ms`
      : `${(summary.duration / 1000).toFixed(2)}s`;

    const lines: string[] = [];
    lines.push(chalk.cyan('═'.repeat(70)));
    lines.push(`${chalk.cyan.bold('SECURITY AUDIT SUMMARY')}`);
    lines.push(chalk.cyan('═'.repeat(70)));
    lines.push(`  ${chalk.gray('Provider:')} ${providerColor(summary.provider.toUpperCase())}`);
    lines.push(`  ${chalk.gray('Start:')} ${chalk.white(summary.startTime)}`);
    lines.push(`  ${chalk.gray('End:')} ${chalk.white(summary.endTime)}`);
    lines.push(`  ${chalk.gray('Duration:')} ${chalk.white(duration)}`);
    lines.push('');
    lines.push(`  ${chalk.gray('Total Findings:')} ${chalk.white(summary.total)}`);
    lines.push(`  ${chalk.gray('Verified:')} ${chalk.green(summary.verified)}`);
    lines.push(`  ${SEVERITY_COLORS.critical('Critical:')} ${summary.critical}`);
    lines.push(`  ${SEVERITY_COLORS.high('High:')} ${summary.high}`);
    lines.push(`  ${SEVERITY_COLORS.medium('Medium:')} ${summary.medium}`);
    lines.push(`  ${SEVERITY_COLORS.low('Low:')} ${summary.low}`);
    if (summary.zeroDay > 0) {
      lines.push(`  ${chalk.magenta('Zero-Day Predictions:')} ${summary.zeroDay}`);
    }
    lines.push(chalk.cyan('═'.repeat(70)));

    return lines.join('\n');
  }

  /**
   * Format remediation result
   */
  static formatRemediationResult(result: RemediationResult): string {
    const statusIcon = result.success ? chalk.green('✓') : chalk.red('✗');
    const statusColor = result.success ? chalk.green : chalk.red;

    const lines: string[] = [];
    lines.push(`${statusIcon} ${statusColor.bold(result.findingId)}`);
    lines.push(`  ${chalk.gray('Action:')} ${chalk.white(result.action)}`);
    lines.push(`  ${chalk.gray('Status:')} ${statusColor(result.success ? 'FIXED' : 'FAILED')}`);
    lines.push(`  ${chalk.gray('Details:')}`);
    for (const detail of result.details.slice(0, 5)) {
      lines.push(`    ${chalk.gray('•')} ${chalk.white(detail)}`);
    }
    if (result.rollbackCommand) {
      lines.push(`  ${chalk.gray('Rollback:')} ${chalk.yellow(result.rollbackCommand)}`);
    }
    lines.push(`  ${chalk.gray('Timestamp:')} ${chalk.gray(result.timestamp)}`);

    return lines.join('\n');
  }

  /**
   * Format remediation summary
   */
  static formatRemediationSummary(summary: RemediationSummary): string {
    const lines: string[] = [];
    lines.push(chalk.green('═'.repeat(70)));
    lines.push(`${chalk.green.bold('REMEDIATION SUMMARY')}`);
    lines.push(chalk.green('═'.repeat(70)));
    lines.push(`  ${chalk.gray('Total:')} ${chalk.white(summary.total)}`);
    lines.push(`  ${chalk.green('Fixed:')} ${summary.fixed}`);
    lines.push(`  ${chalk.red('Failed:')} ${summary.failed}`);
    lines.push(`  ${chalk.yellow('Skipped:')} ${summary.skipped}`);

    const successRate = summary.total > 0
      ? ((summary.fixed / summary.total) * 100).toFixed(1)
      : '0';
    lines.push(`  ${chalk.gray('Success Rate:')} ${chalk.white(`${successRate}%`)}`);
    lines.push(chalk.green('═'.repeat(70)));

    return lines.join('\n');
  }

  /**
   * Create a banner for security operations
   */
  static createBanner(title: string, subtitle?: string): string {
    const width = 70;
    const lines: string[] = [];
    lines.push(chalk.cyan('╔' + '═'.repeat(width - 2) + '╗'));
    lines.push(chalk.cyan('║') + chalk.cyan.bold(` ${title}`.padEnd(width - 2)) + chalk.cyan('║'));
    if (subtitle) {
      lines.push(chalk.cyan('║') + chalk.white(` ${subtitle}`.padEnd(width - 2)) + chalk.cyan('║'));
    }
    lines.push(chalk.cyan('╚' + '═'.repeat(width - 2) + '╝'));
    return lines.join('\n');
  }

  /**
   * Format progress indicator
   */
  static formatProgress(phase: string, current: number, total: number): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    return `${chalk.gray('⏱')} ${chalk.cyan('Security Audit')} - ${chalk.white(phase)}\n  ${bar} ${chalk.white(`${current}/${total}`)} ${chalk.gray(`(${percentage}%)`)}`;
  }

  /**
   * Format a findings table
   */
  static formatFindingsTable(findings: SecurityFinding[]): string {
    if (findings.length === 0) {
      return chalk.gray('No findings to display.');
    }

    const headers = ['Sev', 'Provider', 'Vulnerability', 'Status', 'Confidence'];
    const widths = [8, 8, 35, 8, 10];

    const headerRow = headers.map((h, i) => chalk.cyan.bold(h.padEnd(widths[i]))).join(' ');
    const separator = chalk.gray('─'.repeat(75));

    const rows = findings.map(f => {
      const severityColor = SEVERITY_COLORS[f.severity];
      const status = f.verified ? chalk.green('VERIFIED') : chalk.yellow('PREDICT');
      return [
        severityColor(f.severity.toUpperCase().substring(0, 4).padEnd(widths[0])),
        PROVIDER_COLORS[f.provider](f.provider.toUpperCase().padEnd(widths[1])),
        chalk.white(f.vulnerability.substring(0, widths[2] - 1).padEnd(widths[2])),
        status.padEnd(widths[3] + 9), // Account for ANSI codes
        chalk.white(`${(f.confidence * 100).toFixed(0)}%`.padEnd(widths[4])),
      ].join(' ');
    });

    return [headerRow, separator, ...rows].join('\n');
  }

  /**
   * Format severity distribution chart
   */
  static formatSeverityChart(findings: SecurityFinding[]): string {
    const counts = {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length,
    };

    const max = Math.max(...Object.values(counts), 1);
    const scale = 30 / max;

    const lines: string[] = [];
    lines.push(chalk.cyan('Severity Distribution:'));

    for (const [severity, count] of Object.entries(counts)) {
      const barLength = Math.round(count * scale);
      const bar = '█'.repeat(barLength);
      const color = SEVERITY_COLORS[severity as SeverityLevel];
      lines.push(`  ${color(severity.padEnd(10))} ${color(bar)} ${chalk.white(count)}`);
    }

    return lines.join('\n');
  }

  /**
   * Format provider distribution
   */
  static formatProviderChart(findings: SecurityFinding[]): string {
    const counts: Record<string, number> = {};
    for (const f of findings) {
      counts[f.provider] = (counts[f.provider] || 0) + 1;
    }

    const max = Math.max(...Object.values(counts), 1);
    const scale = 30 / max;

    const lines: string[] = [];
    lines.push(chalk.cyan('Provider Distribution:'));

    for (const [provider, count] of Object.entries(counts)) {
      const barLength = Math.round(count * scale);
      const bar = '█'.repeat(barLength);
      const color = PROVIDER_COLORS[provider as CloudProvider] || chalk.white;
      lines.push(`  ${color(provider.toUpperCase().padEnd(10))} ${color(bar)} ${chalk.white(count)}`);
    }

    return lines.join('\n');
  }

  /**
   * Format APT kill chain coverage
   */
  static formatAPTCoverage(findings: SecurityFinding[]): string {
    const phases = [
      'reconnaissance',
      'weaponization',
      'delivery',
      'exploitation',
      'installation',
      'command-control',
      'actions',
    ];

    const coverage: Record<string, number> = {};
    for (const f of findings) {
      if (f.aptPhase) {
        coverage[f.aptPhase] = (coverage[f.aptPhase] || 0) + 1;
      }
    }

    const lines: string[] = [];
    lines.push(chalk.cyan('APT Kill Chain Coverage:'));
    lines.push(chalk.gray('─'.repeat(50)));

    for (const phase of phases) {
      const count = coverage[phase] || 0;
      const bar = count > 0 ? chalk.red('█'.repeat(Math.min(count * 3, 20))) : chalk.gray('░'.repeat(3));
      const countStr = count > 0 ? chalk.white(count) : chalk.gray('0');
      lines.push(`  ${chalk.yellow(phase.padEnd(15))} ${bar} ${countStr}`);
    }

    return lines.join('\n');
  }

  /**
   * Format security status badge
   */
  static formatSecurityStatus(findings: SecurityFinding[]): string {
    const critical = findings.filter(f => f.severity === 'critical' && f.verified).length;
    const high = findings.filter(f => f.severity === 'high' && f.verified).length;

    let status: string;
    let color: (text: string) => string;
    let icon: string;

    if (critical > 0) {
      status = 'CRITICAL';
      color = chalk.redBright;
      icon = chalk.redBright('⚠');
    } else if (high > 0) {
      status = 'AT RISK';
      color = chalk.red;
      icon = chalk.red('▲');
    } else if (findings.some(f => f.verified)) {
      status = 'NEEDS ATTENTION';
      color = chalk.yellow;
      icon = chalk.yellow('●');
    } else {
      status = 'HEALTHY';
      color = chalk.green;
      icon = chalk.green('✓');
    }

    return `${icon} ${chalk.bold(color('Security Status:'))} ${color(status)}`;
  }

  /**
   * Create a full security report
   */
  static createFullReport(
    findings: SecurityFinding[],
    summary: AuditSummary,
    remediation?: RemediationSummary
  ): string {
    const sections: string[] = [];

    // Banner
    sections.push(this.createBanner(
      'UNIVERSAL SECURITY AUDIT REPORT',
      `Generated: ${new Date().toISOString()}`
    ));
    sections.push('');

    // Status
    sections.push(this.formatSecurityStatus(findings));
    sections.push('');

    // Summary
    sections.push(this.formatSummary(summary));
    sections.push('');

    // Charts
    sections.push(this.formatSeverityChart(findings));
    sections.push('');
    sections.push(this.formatProviderChart(findings));
    sections.push('');
    sections.push(this.formatAPTCoverage(findings));
    sections.push('');

    // Findings table
    sections.push(chalk.cyan('Findings Detail:'));
    sections.push(this.formatFindingsTable(findings));
    sections.push('');

    // Remediation if available
    if (remediation) {
      sections.push(this.formatRemediationSummary(remediation));
    }

    return sections.join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export Default
// ═══════════════════════════════════════════════════════════════════════════════

export default UniversalSecurityUI;
