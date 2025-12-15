/**
 * Apple Security UI Component
 * 
 * Provides rich UI components for displaying Apple security findings,
 * vulnerabilities, exploits, and audit results in AGI Core.
 */

import chalk from 'chalk';
import { theme } from './theme.js';
// Note: formatError and ErrorInfo imported for type compatibility
import { formatError, type ErrorInfo } from './errorFormatter.js';

export interface AppleSecurityUIComponents {
  formatSecurityFinding: (finding: AppleSecurityFinding) => string;
  formatVulnerability: (vuln: AppleVulnerability) => string;
  formatExploit: (exploit: AppleExploit) => string;
  formatService: (service: AppleService) => string;
  formatAuditProgress: (phase: string, progress: number, total: number) => string;
  formatAttackChain: (chain: AppleAttackChain) => string;
  formatRemediation: (category: string, steps: string[]) => string;
  formatSecuritySummary: (results: AppleSecurityResults) => string;
}

export interface AppleSecurityFinding {
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  name: string;
  description: string;
  evidence: string;
  remediation: string;
  timestamp: string;
}

export interface AppleVulnerability {
  id: string;
  name: string;
  cve: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affected: string[];
  exploitation: string;
  patch: string;
  exploitationComplexity: 'low' | 'medium' | 'high';
  impact: string;
}

export interface AppleExploit {
  name: string;
  type: 'ios' | 'macos' | 'network' | 'web' | 'hardware';
  method: string;
  requirements: string;
  supported: boolean;
  version?: string;
}

export interface AppleService {
  name: string;
  domain: string;
  category: 'cloud' | 'developer' | 'media' | 'system' | 'enterprise' | 'security';
  endpoints: string[];
  defaultPorts: number[];
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface AppleAttackChain {
  name: string;
  steps: string[];
  prerequisites: string[];
  successCriteria: string[];
  detectionAvoidance: string[];
}

export interface AppleSecurityResults {
  campaign: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  phases: string[];
  findings: AppleSecurityFinding[];
  evidencePaths: { phase: string; path: string }[];
  metrics: Record<string, any>;
}

export class AppleSecurityUI {
  static severityColors = {
    critical: chalk.redBright,
    high: chalk.red,
    medium: chalk.yellow,
    low: chalk.blue,
    info: chalk.gray
  };

  static complexityColors = {
    high: chalk.red,
    medium: chalk.yellow,
    low: chalk.green
  };

  static categoryColors = {
    cloud: chalk.cyan,
    developer: chalk.magenta,
    media: chalk.blue,
    system: chalk.yellow,
    enterprise: chalk.green,
    security: chalk.red
  };

  /**
   * Format a security finding with appropriate colors and icons
   */
  static formatSecurityFinding(finding: AppleSecurityFinding): string {
    const color = this.severityColors[finding.severity] || chalk.white;
    const severityIcon = this.getSeverityIcon(finding.severity);
    
    const lines: string[] = [];
    lines.push(`${severityIcon} ${color.bold(finding.name)}`);
    lines.push(`  ${chalk.gray('Type:')} ${chalk.white(finding.type)}`);
    lines.push(`  ${chalk.gray('Severity:')} ${color(finding.severity.toUpperCase())}`);
    lines.push(`  ${chalk.gray('Description:')} ${chalk.white(finding.description)}`);
    lines.push(`  ${chalk.gray('Evidence:')} ${chalk.cyan(finding.evidence)}`);
    lines.push(`  ${chalk.gray('Remediation:')} ${chalk.green(finding.remediation)}`);
    lines.push(`  ${chalk.gray('Timestamp:')} ${chalk.gray(finding.timestamp)}`);
    
    return lines.join('\n');
  }

  /**
   * Format a vulnerability with CVE details
   */
  static formatVulnerability(vuln: AppleVulnerability): string {
    const color = this.severityColors[vuln.severity] || chalk.white;
    const complexityColor = this.complexityColors[vuln.exploitationComplexity] || chalk.white;
    
    const lines: string[] = [];
    lines.push(`${this.getVulnerabilityIcon(vuln.severity)} ${color.bold(vuln.cve)}: ${vuln.name}`);
    lines.push(`  ${chalk.gray('Severity:')} ${color(vuln.severity.toUpperCase())}`);
    lines.push(`  ${chalk.gray('Affected:')} ${chalk.white(vuln.affected.join(', '))}`);
    lines.push(`  ${chalk.gray('Exploitation:')} ${chalk.yellow(vuln.exploitation)}`);
    lines.push(`  ${chalk.gray('Complexity:')} ${complexityColor(vuln.exploitationComplexity)}`);
    lines.push(`  ${chalk.gray('Impact:')} ${chalk.red(vuln.impact)}`);
    lines.push(`  ${chalk.gray('Patch:')} ${chalk.green(vuln.patch)}`);
    
    return lines.join('\n');
  }

  /**
   * Format an exploit with method and requirements
   */
  static formatExploit(exploit: AppleExploit): string {
    const typeColor = this.getExploitTypeColor(exploit.type);
    const supportedColor = exploit.supported ? chalk.green : chalk.red;
    
    const lines: string[] = [];
    lines.push(`${this.getExploitIcon(exploit.type)} ${chalk.bold(typeColor(exploit.name))}`);
    lines.push(`  ${chalk.gray('Type:')} ${typeColor(exploit.type)}`);
    lines.push(`  ${chalk.gray('Method:')} ${chalk.white(exploit.method)}`);
    lines.push(`  ${chalk.gray('Requirements:')} ${chalk.cyan(exploit.requirements)}`);
    lines.push(`  ${chalk.gray('Supported:')} ${supportedColor(exploit.supported ? 'Yes' : 'No')}`);
    if (exploit.version) {
      lines.push(`  ${chalk.gray('Version:')} ${chalk.yellow(exploit.version)}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Format an Apple service with category and security level
   */
  static formatService(service: AppleService): string {
    const categoryColor = this.categoryColors[service.category] || chalk.white;
    const securityColor = this.severityColors[service.securityLevel] || chalk.white;
    
    const lines: string[] = [];
    lines.push(`${this.getServiceIcon(service.category)} ${categoryColor.bold(service.name)}`);
    lines.push(`  ${chalk.gray('Domain:')} ${chalk.cyan(service.domain)}`);
    lines.push(`  ${chalk.gray('Category:')} ${categoryColor(service.category)}`);
    lines.push(`  ${chalk.gray('Security Level:')} ${securityColor(service.securityLevel)}`);
    lines.push(`  ${chalk.gray('Ports:')} ${chalk.white(service.defaultPorts.join(', '))}`);
    if (service.endpoints.length > 0) {
      lines.push(`  ${chalk.gray('Endpoints:')} ${chalk.white(service.endpoints.slice(0, 3).join(', '))}`);
      if (service.endpoints.length > 3) {
        lines.push(`  ${chalk.gray('')} ${chalk.gray(`+${service.endpoints.length - 3} more`)}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Format audit progress with visual indicator
   */
  static formatAuditProgress(phase: string, progress: number, total: number): string {
    const percentage = Math.round((progress / total) * 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    
    const progressBar = `${chalk.green('█'.repeat(filled))}${chalk.gray('░'.repeat(empty))}`;
    
    return `${chalk.gray('⏱')} ${chalk.cyan('Apple Security Audit')} - ${chalk.white(phase)}\n` +
           `  ${progressBar} ${chalk.white(`${progress}/${total}`)} ${chalk.gray(`(${percentage}%)`)}`;
  }

  /**
   * Format an attack chain with steps and prerequisites
   */
  static formatAttackChain(chain: AppleAttackChain): string {
    const lines: string[] = [];
    lines.push(`${chalk.red('🛡️')} ${chalk.red.bold('Attack Chain:')} ${chalk.white(chain.name)}`);
    
    lines.push(`  ${chalk.gray('Prerequisites:')}`);
    chain.prerequisites.forEach((prereq, i) => {
      lines.push(`    ${chalk.gray(`${i + 1}.`)} ${chalk.white(prereq)}`);
    });
    
    lines.push(`  ${chalk.gray('Steps:')}`);
    chain.steps.forEach((step, i) => {
      lines.push(`    ${chalk.cyan(`${i + 1}.`)} ${chalk.white(step)}`);
    });
    
    lines.push(`  ${chalk.gray('Success Criteria:')}`);
    chain.successCriteria.forEach((criteria, i) => {
      lines.push(`    ${chalk.green(`${i + 1}.`)} ${chalk.white(criteria)}`);
    });
    
    lines.push(`  ${chalk.gray('Detection Avoidance:')}`);
    chain.detectionAvoidance.forEach((avoidance, i) => {
      lines.push(`    ${chalk.yellow(`${i + 1}.`)} ${chalk.white(avoidance)}`);
    });
    
    return lines.join('\n');
  }

  /**
   * Format remediation steps for a category
   */
  static formatRemediation(category: string, steps: string[]): string {
    const lines: string[] = [];
    lines.push(`${chalk.green('✓')} ${chalk.green.bold('Remediation:')} ${chalk.white(category)}`);
    
    steps.forEach((step, i) => {
      lines.push(`  ${chalk.green(`${i + 1}.`)} ${chalk.white(step)}`);
    });
    
    return lines.join('\n');
  }

  /**
   * Format comprehensive security summary
   */
  static formatSecuritySummary(results: AppleSecurityResults): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`${chalk.cyan('='.repeat(70))}`);
    lines.push(`${chalk.cyan('🛡️')} ${chalk.cyan.bold('APPLE SECURITY AUDIT SUMMARY')}`);
    lines.push(`${chalk.cyan('='.repeat(70))}`);
    
    // Metadata
    lines.push(`  ${chalk.gray('Campaign:')} ${chalk.white(results.campaign)}`);
    lines.push(`  ${chalk.gray('Start Time:')} ${chalk.white(results.startTime)}`);
    if (results.endTime) {
      lines.push(`  ${chalk.gray('End Time:')} ${chalk.white(results.endTime)}`);
    }
    if (results.duration) {
      lines.push(`  ${chalk.gray('Duration:')} ${chalk.white(`${results.duration}ms`)}`);
    }
    
    // Phases
    lines.push(`  ${chalk.gray('Phases Completed:')} ${chalk.white(results.phases.length)}`);
    lines.push(`  ${chalk.gray('Phases:')} ${chalk.white(results.phases.join(', '))}`);
    
    // Findings by severity
    if (results.findings && results.findings.length > 0) {
      const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      results.findings.forEach(f => {
        counts[f.severity] = (counts[f.severity] || 0) + 1;
      });
      
      lines.push(`  ${chalk.gray('Findings:')}`);
      Object.entries(counts).forEach(([severity, count]) => {
        if (count > 0) {
          const color = this.severityColors[severity as keyof typeof this.severityColors] || chalk.white;
          lines.push(`    ${color(`${severity.toUpperCase()}:`)} ${chalk.white(count)}`);
        }
      });
      lines.push(`    ${chalk.gray('Total:')} ${chalk.white(results.findings.length)}`);
    }
    
    // Metrics
    if (results.metrics) {
      lines.push(`  ${chalk.gray('Metrics:')}`);
      Object.entries(results.metrics).forEach(([key, value]) => {
        if (typeof value === 'object') {
          lines.push(`    ${chalk.gray(`${key}:`)}`);
          Object.entries(value as Record<string, any>).forEach(([subKey, subValue]) => {
            lines.push(`      ${chalk.gray(`${subKey}:`)} ${chalk.white(subValue)}`);
          });
        } else {
          lines.push(`    ${chalk.gray(`${key}:`)} ${chalk.white(value)}`);
        }
      });
    }
    
    // Evidence
    if (results.evidencePaths && results.evidencePaths.length > 0) {
      lines.push(`  ${chalk.gray('Evidence Files:')}`);
      results.evidencePaths.forEach(evidence => {
        lines.push(`    ${chalk.gray(`${evidence.phase}:`)} ${chalk.cyan(evidence.path)}`);
      });
    }
    
    lines.push(`${chalk.cyan('='.repeat(70))}`);
    
    return lines.join('\n');
  }

  /**
   * Format a quick security status badge
   */
  static formatSecurityStatus(status: 'healthy' | 'degraded' | 'unavailable', details: string): string {
    const statusIcons = {
      healthy: `${chalk.green('●')}`,
      degraded: `${chalk.yellow('●')}`,
      unavailable: `${chalk.red('●')}`
    };
    
    const statusColors = {
      healthy: chalk.green,
      degraded: chalk.yellow,
      unavailable: chalk.red
    };
    
    return `${statusIcons[status]} ${statusColors[status].bold('Apple Security')}: ${chalk.white(details)}`;
  }

  // Helper methods for icons
  private static getSeverityIcon(severity: string): string {
    const icons = {
      critical: chalk.red('⚠'),
      high: chalk.red('▲'),
      medium: chalk.yellow('▲'),
      low: chalk.blue('▼'),
      info: chalk.gray('ℹ')
    };
    return icons[severity as keyof typeof icons] || chalk.gray('•');
  }

  private static getVulnerabilityIcon(severity: string): string {
    const icons = {
      critical: chalk.red('💥'),
      high: chalk.red('🔥'),
      medium: chalk.yellow('⚠'),
      low: chalk.blue('💡'),
      info: chalk.gray('📝')
    };
    return icons[severity as keyof typeof icons] || chalk.gray('📄');
  }

  private static getExploitIcon(type: string): string {
    const icons = {
      ios: chalk.magenta('📱'),
      macos: chalk.blue('💻'),
      network: chalk.cyan('📡'),
      web: chalk.yellow('🌐'),
      hardware: chalk.red('🔧')
    };
    return icons[type as keyof typeof icons] || chalk.gray('⚙');
  }

  static getServiceIcon(category: string): string {
    const icons = {
      cloud: chalk.cyan('☁️'),
      developer: chalk.magenta('🔧'),
      media: chalk.blue('🎵'),
      system: chalk.yellow('⚙️'),
      enterprise: chalk.green('🏢'),
      security: chalk.red('🛡️')
    };
    return icons[category as keyof typeof icons] || chalk.gray('🔗');
  }

  private static getExploitTypeColor(type: string): any {
    const colors: Record<string, (text: string) => string> = {
      ios: chalk.magenta,
      macos: chalk.blue,
      network: chalk.cyan,
      web: chalk.yellow,
      hardware: chalk.red
    };
    return colors[type] || chalk.white;
  }

  /**
   * Create a banner for Apple security operations
   */
  static createSecurityBanner(title: string, subtitle?: string): string {
    const banner = [
      `${chalk.cyan('╔' + '═'.repeat(68) + '╗')}`,
      `${chalk.cyan('║')} ${chalk.cyan.bold(title.padEnd(66))} ${chalk.cyan('║')}`,
      subtitle ? `${chalk.cyan('║')} ${chalk.white(subtitle.padEnd(66))} ${chalk.cyan('║')}` : null,
      `${chalk.cyan('╚' + '═'.repeat(68) + '╝')}`
    ].filter(Boolean).join('\n');
    
    return banner;
  }

  /**
   * Create a progress spinner for Apple security operations
   */
  static createSecuritySpinner(message: string): string {
    return `${chalk.cyan('⠋')} ${chalk.white(message)}`;
  }

  /**
   * Format a table of Apple security findings
   */
  static formatFindingsTable(findings: AppleSecurityFinding[]): string {
    if (findings.length === 0) {
      return chalk.gray('No findings to display.');
    }

    const headers = ['Severity', 'Type', 'Name', 'Remediation'];
    const rows = findings.map(finding => [
      this.severityColors[finding.severity](finding.severity.toUpperCase().padEnd(8)),
      chalk.white(finding.type.padEnd(15)),
      chalk.white(finding.name.substring(0, 30).padEnd(30)),
      chalk.green(finding.remediation.substring(0, 40).padEnd(40))
    ]);

    const headerRow = headers.map((h, i) => chalk.cyan.bold(h.padEnd(i === 0 ? 8 : i === 1 ? 15 : i === 2 ? 30 : 40))).join(' ');
    const separator = chalk.gray('─'.repeat(headerRow.length));
    
    const table = [headerRow, separator, ...rows.map(row => row.join(' '))];
    
    return table.join('\n');
  }

  /**
   * Format a comparison between before/after security states
   */
  static formatSecurityComparison(before: any, after: any): string {
    const lines: string[] = [];
    
    lines.push(`${chalk.cyan('Security State Comparison')}`);
    lines.push(chalk.gray('─'.repeat(40)));
    
    // Compare findings counts
    if (before.findings && after.findings) {
      const beforeCounts = this.countFindingsBySeverity(before.findings);
      const afterCounts = this.countFindingsBySeverity(after.findings);
      
      lines.push(`${chalk.white('Findings Comparison:')}`);
      Object.keys(beforeCounts).forEach(severity => {
        const beforeCount = beforeCounts[severity];
        const afterCount = afterCounts[severity] || 0;
        const change = afterCount - beforeCount;
        const changeColor = change < 0 ? chalk.green : change > 0 ? chalk.red : chalk.gray;
        const changeSymbol = change < 0 ? '↓' : change > 0 ? '↑' : '→';
        
        lines.push(`  ${this.severityColors[severity](severity.padEnd(10))}: ${chalk.white(beforeCount)} ${changeColor(`${changeSymbol}${Math.abs(change)}`)} → ${chalk.white(afterCount)}`);
      });
    }
    
    // Compare metrics
    if (before.metrics && after.metrics) {
      lines.push(`\n${chalk.white('Metrics Comparison:')}`);
      Object.keys(before.metrics).forEach(key => {
        if (typeof before.metrics[key] === 'number' && typeof after.metrics[key] === 'number') {
          const change = after.metrics[key] - before.metrics[key];
          const changeColor = change > 0 ? chalk.green : change < 0 ? chalk.red : chalk.gray;
          const changeSymbol = change > 0 ? '↑' : change < 0 ? '↓' : '→';
          
          lines.push(`  ${chalk.gray(key.padEnd(20))}: ${chalk.white(before.metrics[key])} ${changeColor(`${changeSymbol}${Math.abs(change)}`)} → ${chalk.white(after.metrics[key])}`);
        }
      });
    }
    
    return lines.join('\n');
  }

  /**
   * Helper: Count findings by severity
   */
  private static countFindingsBySeverity(findings: AppleSecurityFinding[]): Record<string, number> {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    findings.forEach(finding => {
      counts[finding.severity] = (counts[finding.severity] || 0) + 1;
    });
    return counts;
  }

  /**
   * Export all UI components
   */
  static get components(): AppleSecurityUIComponents {
    return {
      formatSecurityFinding: this.formatSecurityFinding.bind(this),
      formatVulnerability: this.formatVulnerability.bind(this),
      formatExploit: this.formatExploit.bind(this),
      formatService: this.formatService.bind(this),
      formatAuditProgress: this.formatAuditProgress.bind(this),
      formatAttackChain: this.formatAttackChain.bind(this),
      formatRemediation: this.formatRemediation.bind(this),
      formatSecuritySummary: this.formatSecuritySummary.bind(this)
    };
  }
}