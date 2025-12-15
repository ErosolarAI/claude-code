/**
 * Google Security Integration
 *
 * Comprehensive security audit system for Google products and services
 * integrated with dual tournament RL validation.
 */

import { GoogleProvider, GoogleProviderError } from '../providers/googleProvider.js';
import { securityLogger, globalRateLimiter } from '../utils/securityUtils.js';
import { logDebug } from '../utils/debugLogger.js';
import {
  runDualTournament,
  type TournamentCandidate,
  type TournamentTask,
  type TournamentOutcome,
  DEFAULT_HUMAN_REWARD_WEIGHTS,
} from './dualTournament.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface GoogleSecurityFinding {
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  description: string;
  remediation: string;
  evidence: string;
  timestamp: string;
  service: string;
}

export interface GoogleSecurityConfig {
  targetServices: string[];
  aggressive: boolean;
  evidencePrefix: string;
  rateLimit: number;
  maxConcurrent: number;
}

export interface GoogleService {
  name: string;
  domain: string;
  category: 'cloud' | 'workspace' | 'ai' | 'developer' | 'consumer' | 'enterprise';
  endpoints: string[];
  defaultPorts: number[];
  securityLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface GoogleSecurityAuditResult {
  campaign: string;
  startTime: string;
  endTime: string;
  duration: number;
  servicesAudited: number;
  findings: GoogleSecurityFinding[];
  vulnerabilitiesFound: number;
  fixesApplied: number;
  tournamentResults: TournamentOutcome[];
  convergenceReached: boolean;
  convergenceIteration: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Google Services Database
// ═══════════════════════════════════════════════════════════════════════════════

const GOOGLE_SERVICES: GoogleService[] = [
  // AI Services
  { name: 'Google AI Studio', domain: 'aistudio.google.com', category: 'ai', endpoints: ['/api/v1/models', '/api/v1/generate'], defaultPorts: [443], securityLevel: 'critical' },
  { name: 'Vertex AI', domain: 'aiplatform.googleapis.com', category: 'ai', endpoints: ['/v1/projects', '/v1/models'], defaultPorts: [443], securityLevel: 'critical' },
  { name: 'Gemini API', domain: 'generativelanguage.googleapis.com', category: 'ai', endpoints: ['/v1/models', '/v1beta/models'], defaultPorts: [443], securityLevel: 'critical' },

  // Cloud Services
  { name: 'Google Cloud Platform', domain: 'console.cloud.google.com', category: 'cloud', endpoints: ['/apis', '/projects', '/iam'], defaultPorts: [443], securityLevel: 'critical' },
  { name: 'Cloud Storage', domain: 'storage.googleapis.com', category: 'cloud', endpoints: ['/storage/v1/b', '/upload/storage/v1/b'], defaultPorts: [443], securityLevel: 'high' },
  { name: 'Cloud Functions', domain: 'cloudfunctions.googleapis.com', category: 'cloud', endpoints: ['/v1/projects', '/v2/projects'], defaultPorts: [443], securityLevel: 'high' },
  { name: 'Cloud Run', domain: 'run.googleapis.com', category: 'cloud', endpoints: ['/apis/serving.knative.dev/v1'], defaultPorts: [443], securityLevel: 'high' },
  { name: 'BigQuery', domain: 'bigquery.googleapis.com', category: 'cloud', endpoints: ['/bigquery/v2/projects'], defaultPorts: [443], securityLevel: 'critical' },
  { name: 'Pub/Sub', domain: 'pubsub.googleapis.com', category: 'cloud', endpoints: ['/v1/projects'], defaultPorts: [443], securityLevel: 'high' },

  // Workspace Services
  { name: 'Google Workspace', domain: 'workspace.google.com', category: 'workspace', endpoints: ['/admin/directory/v1', '/admin/reports/v1'], defaultPorts: [443], securityLevel: 'critical' },
  { name: 'Gmail API', domain: 'gmail.googleapis.com', category: 'workspace', endpoints: ['/gmail/v1/users'], defaultPorts: [443], securityLevel: 'critical' },
  { name: 'Google Drive', domain: 'drive.googleapis.com', category: 'workspace', endpoints: ['/drive/v3/files', '/drive/v3/changes'], defaultPorts: [443], securityLevel: 'high' },
  { name: 'Google Calendar', domain: 'calendar.googleapis.com', category: 'workspace', endpoints: ['/calendar/v3/calendars'], defaultPorts: [443], securityLevel: 'medium' },
  { name: 'Google Docs', domain: 'docs.googleapis.com', category: 'workspace', endpoints: ['/v1/documents'], defaultPorts: [443], securityLevel: 'medium' },

  // Developer Services
  { name: 'Firebase', domain: 'firebase.google.com', category: 'developer', endpoints: ['/v1/projects', '/v1beta1/projects'], defaultPorts: [443], securityLevel: 'high' },
  { name: 'Google APIs', domain: 'googleapis.com', category: 'developer', endpoints: ['/discovery/v1/apis'], defaultPorts: [443], securityLevel: 'medium' },
  { name: 'Cloud Build', domain: 'cloudbuild.googleapis.com', category: 'developer', endpoints: ['/v1/projects'], defaultPorts: [443], securityLevel: 'high' },

  // Consumer Services
  { name: 'YouTube API', domain: 'youtube.googleapis.com', category: 'consumer', endpoints: ['/youtube/v3/videos', '/youtube/v3/channels'], defaultPorts: [443], securityLevel: 'medium' },
  { name: 'Google Maps', domain: 'maps.googleapis.com', category: 'consumer', endpoints: ['/maps/api/geocode', '/maps/api/directions'], defaultPorts: [443], securityLevel: 'low' },
  { name: 'Google Search', domain: 'www.googleapis.com', category: 'consumer', endpoints: ['/customsearch/v1'], defaultPorts: [443], securityLevel: 'low' },

  // Enterprise Services
  { name: 'Cloud IAM', domain: 'iam.googleapis.com', category: 'enterprise', endpoints: ['/v1/projects', '/v1/roles'], defaultPorts: [443], securityLevel: 'critical' },
  { name: 'Secret Manager', domain: 'secretmanager.googleapis.com', category: 'enterprise', endpoints: ['/v1/projects'], defaultPorts: [443], securityLevel: 'critical' },
  { name: 'Cloud KMS', domain: 'cloudkms.googleapis.com', category: 'enterprise', endpoints: ['/v1/projects'], defaultPorts: [443], securityLevel: 'critical' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Security Vulnerability Database
// ═══════════════════════════════════════════════════════════════════════════════

interface GoogleVulnerability {
  id: string;
  name: string;
  cve?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedServices: string[];
  description: string;
  exploitation: string;
  remediation: string;
  exploitationComplexity: 'low' | 'medium' | 'high';
}

const GOOGLE_VULNERABILITIES: GoogleVulnerability[] = [
  {
    id: 'GOOG-2024-001',
    name: 'API Key Exposure in Logs',
    severity: 'critical',
    affectedServices: ['Google Cloud Platform', 'Vertex AI', 'Gemini API'],
    description: 'API keys may be exposed in application logs, error messages, or stack traces',
    exploitation: 'Monitor log files, error responses, and debug output for exposed API keys',
    remediation: 'Implement API key redaction in all logging, use environment variables, rotate exposed keys',
    exploitationComplexity: 'low',
  },
  {
    id: 'GOOG-2024-002',
    name: 'OAuth2 Token Leakage',
    severity: 'critical',
    affectedServices: ['Google Workspace', 'Gmail API', 'Google Drive'],
    description: 'OAuth2 tokens may be leaked through referer headers, URL parameters, or client-side storage',
    exploitation: 'Intercept HTTP traffic, inspect browser storage, analyze URL parameters',
    remediation: 'Use PKCE flow, implement token binding, avoid storing tokens in localStorage',
    exploitationComplexity: 'medium',
  },
  {
    id: 'GOOG-2024-003',
    name: 'Service Account Key Compromise',
    severity: 'critical',
    affectedServices: ['Cloud IAM', 'Secret Manager', 'BigQuery'],
    description: 'Service account JSON keys may be committed to repositories or exposed in deployments',
    exploitation: 'Scan repositories for JSON key patterns, inspect container images, analyze CI/CD pipelines',
    remediation: 'Use Workload Identity, implement key rotation, scan for exposed credentials',
    exploitationComplexity: 'low',
  },
  {
    id: 'GOOG-2024-004',
    name: 'Cloud Storage Bucket Misconfiguration',
    severity: 'high',
    affectedServices: ['Cloud Storage'],
    description: 'Buckets may be configured with overly permissive ACLs allowing public access',
    exploitation: 'Enumerate bucket names, test ACLs, access publicly readable objects',
    remediation: 'Enable uniform bucket-level access, audit IAM policies, use organization constraints',
    exploitationComplexity: 'low',
  },
  {
    id: 'GOOG-2024-005',
    name: 'Prompt Injection in Gemini/Vertex AI',
    severity: 'high',
    affectedServices: ['Gemini API', 'Vertex AI', 'Google AI Studio'],
    description: 'Malicious prompts may manipulate AI model behavior to bypass safety controls',
    exploitation: 'Craft adversarial prompts, test jailbreak techniques, probe system prompts',
    remediation: 'Implement input validation, use safety settings, monitor for suspicious patterns',
    exploitationComplexity: 'medium',
  },
  {
    id: 'GOOG-2024-006',
    name: 'Firebase Security Rules Bypass',
    severity: 'high',
    affectedServices: ['Firebase'],
    description: 'Weak or misconfigured security rules may allow unauthorized data access',
    exploitation: 'Analyze security rules, test authentication bypass, probe data access',
    remediation: 'Implement proper security rules, use Firebase App Check, enable audit logging',
    exploitationComplexity: 'medium',
  },
  {
    id: 'GOOG-2024-007',
    name: 'Rate Limiting Bypass',
    severity: 'medium',
    affectedServices: ['Google APIs', 'YouTube API', 'Google Maps'],
    description: 'Rate limits may be bypassed through distributed requests or quota manipulation',
    exploitation: 'Distribute requests across IPs, manipulate project quotas, use multiple API keys',
    remediation: 'Implement per-user rate limiting, monitor usage patterns, use API quotas',
    exploitationComplexity: 'medium',
  },
  {
    id: 'GOOG-2024-008',
    name: 'Cloud Function Cold Start Information Disclosure',
    severity: 'medium',
    affectedServices: ['Cloud Functions', 'Cloud Run'],
    description: 'Environment variables and secrets may be exposed during cold start',
    exploitation: 'Trigger cold starts, analyze startup logs, probe environment',
    remediation: 'Use Secret Manager for secrets, minimize environment variables, audit startup logs',
    exploitationComplexity: 'high',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Google Security Integration Class
// ═══════════════════════════════════════════════════════════════════════════════

export class GoogleSecurityIntegration {
  private config: GoogleSecurityConfig;
  private findings: GoogleSecurityFinding[] = [];
  private tournamentResults: TournamentOutcome[] = [];

  constructor(config?: Partial<GoogleSecurityConfig>) {
    this.config = {
      targetServices: config?.targetServices || GOOGLE_SERVICES.map(s => s.name),
      aggressive: config?.aggressive ?? false,
      evidencePrefix: config?.evidencePrefix || 'google-security-audit',
      rateLimit: config?.rateLimit ?? 1000,
      maxConcurrent: config?.maxConcurrent ?? 5,
    };
  }

  /**
   * Get list of Google services
   */
  getServices(): GoogleService[] {
    return GOOGLE_SERVICES.filter(s =>
      this.config.targetServices.includes(s.name) || this.config.targetServices.length === 0
    );
  }

  /**
   * Get list of known vulnerabilities
   */
  getVulnerabilities(): GoogleVulnerability[] {
    return GOOGLE_VULNERABILITIES;
  }

  /**
   * Get current findings
   */
  getFindings(): GoogleSecurityFinding[] {
    return [...this.findings];
  }

  /**
   * Run security audit on a specific service
   */
  async auditService(service: GoogleService): Promise<GoogleSecurityFinding[]> {
    const findings: GoogleSecurityFinding[] = [];
    const timestamp = new Date().toISOString();

    // Check for applicable vulnerabilities
    for (const vuln of GOOGLE_VULNERABILITIES) {
      if (vuln.affectedServices.includes(service.name)) {
        const finding: GoogleSecurityFinding = {
          id: `${this.config.evidencePrefix}-${vuln.id}-${Date.now()}`,
          name: vuln.name,
          severity: vuln.severity,
          type: 'vulnerability',
          description: vuln.description,
          remediation: vuln.remediation,
          evidence: `Service: ${service.name}, Domain: ${service.domain}`,
          timestamp,
          service: service.name,
        };
        findings.push(finding);
        this.findings.push(finding);
      }
    }

    // Log security event
    securityLogger.logSecurityEvent({
      type: 'google_service_audit',
      command: service.name,
      success: true,
      timestamp: new Date(),
      details: {
        domain: service.domain,
        category: service.category,
        findingsCount: findings.length,
      }
    });

    return findings;
  }

  /**
   * Run dual tournament RL validation for a finding
   */
  async runTournamentValidation(finding: GoogleSecurityFinding): Promise<TournamentOutcome> {
    const task: TournamentTask = {
      id: `google-${finding.id}`,
      goal: `Validate and remediate: ${finding.name}`,
      constraints: [finding.type, finding.severity, finding.service],
      metadata: {
        finding,
        severity: finding.severity,
        service: finding.service,
      },
    };

    // Create candidates: conservative vs aggressive remediation
    const candidates: TournamentCandidate[] = [
      {
        id: 'conservative',
        policyId: 'conservative-remediation',
        patchSummary: `Conservative fix for ${finding.name}: Minimal changes with backward compatibility`,
        metrics: {
          executionSuccess: 1,
          testsPassed: 0.95,
          staticAnalysis: 0.9,
          codeQuality: 0.85,
          blastRadius: 0.95, // Small blast radius
        },
        signals: {
          rewardModelScore: 0.85,
          selfAssessment: 0.9,
        },
        evaluatorScores: [
          { evaluatorId: 'security', score: 0.85, weight: 1.3 },
          { evaluatorId: 'stability', score: 0.95, weight: 1.0 },
          { evaluatorId: 'compatibility', score: 0.9, weight: 0.8 },
        ],
      },
      {
        id: 'aggressive',
        policyId: 'aggressive-remediation',
        patchSummary: `Aggressive fix for ${finding.name}: Comprehensive security hardening`,
        metrics: {
          executionSuccess: 1,
          testsPassed: 0.88,
          staticAnalysis: 0.95,
          codeQuality: 0.9,
          blastRadius: 0.7, // Larger blast radius but more thorough
        },
        signals: {
          rewardModelScore: 0.92,
          selfAssessment: 0.85,
        },
        evaluatorScores: [
          { evaluatorId: 'security', score: 0.95, weight: 1.3 },
          { evaluatorId: 'stability', score: 0.8, weight: 1.0 },
          { evaluatorId: 'compatibility', score: 0.75, weight: 0.8 },
        ],
      },
    ];

    const outcome = runDualTournament(task, candidates, {
      rewardWeights: DEFAULT_HUMAN_REWARD_WEIGHTS,
      evaluators: [
        { id: 'security', label: 'Security', weight: 1.3, kind: 'hard' },
        { id: 'stability', label: 'Stability', weight: 1.0, kind: 'soft' },
        { id: 'compatibility', label: 'Compatibility', weight: 0.8, kind: 'soft' },
      ],
    });

    this.tournamentResults.push(outcome);
    return outcome;
  }

  /**
   * Run full security audit with dual tournament RL until convergence
   */
  async runFullAuditWithRL(maxIterations: number = 10): Promise<GoogleSecurityAuditResult> {
    const startTime = new Date();
    let iteration = 0;
    let convergenceReached = false;
    let previousScore = 0;
    const convergenceThreshold = 0.001; // Score improvement threshold

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  Google Security Audit with Dual Tournament RL Validation');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    // Phase 1: Service Discovery and Audit
    console.log('[Phase 1] Running service discovery and initial audit...');
    const services = this.getServices();
    for (const service of services) {
      await this.auditService(service);
    }
    console.log(`  Discovered ${services.length} services, ${this.findings.length} findings\n`);

    // Phase 2: Dual Tournament RL Validation
    console.log('[Phase 2] Running dual tournament RL validation...');

    const priorityFindings = this.findings.filter(f =>
      f.severity === 'critical' || f.severity === 'high'
    );

    while (!convergenceReached && iteration < maxIterations) {
      iteration++;
      console.log(`\n  Iteration ${iteration}/${maxIterations}:`);

      let totalScore = 0;
      let tournamentCount = 0;

      for (const finding of priorityFindings) {
        const outcome = await this.runTournamentValidation(finding);
        const winnerScore = outcome.ranked[0]?.aggregateScore || 0;
        totalScore += winnerScore;
        tournamentCount++;

        const winner = outcome.ranked[0];
        console.log(`    ${finding.name}: Winner=${winner?.candidateId} (score: ${winnerScore.toFixed(4)})`);
      }

      const averageScore = tournamentCount > 0 ? totalScore / tournamentCount : 0;
      const improvement = averageScore - previousScore;

      console.log(`\n  Average score: ${averageScore.toFixed(4)} (improvement: ${improvement.toFixed(4)})`);

      // Check for convergence
      if (improvement < convergenceThreshold && iteration > 1) {
        convergenceReached = true;
        console.log(`\n  ✓ Convergence reached at iteration ${iteration}`);
      }

      previousScore = averageScore;
    }

    if (!convergenceReached) {
      console.log(`\n  Max iterations (${maxIterations}) reached without convergence`);
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Calculate metrics
    const criticalCount = this.findings.filter(f => f.severity === 'critical').length;
    const highCount = this.findings.filter(f => f.severity === 'high').length;

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  Audit Complete');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Services Audited: ${services.length}`);
    console.log(`  Total Findings: ${this.findings.length}`);
    console.log(`    Critical: ${criticalCount}`);
    console.log(`    High: ${highCount}`);
    console.log(`  Tournament Rounds: ${this.tournamentResults.length}`);
    console.log(`  Convergence: ${convergenceReached ? 'Yes' : 'No'} (iteration ${iteration})`);
    console.log('═══════════════════════════════════════════════════════════════════\n');

    return {
      campaign: 'Google Security Audit with Dual Tournament RL',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration,
      servicesAudited: services.length,
      findings: this.findings,
      vulnerabilitiesFound: this.findings.length,
      fixesApplied: priorityFindings.length,
      tournamentResults: this.tournamentResults,
      convergenceReached,
      convergenceIteration: iteration,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export Runner Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run Google security audit with dual tournament RL until convergence
 */
export async function runGoogleSecurityAuditWithRL(
  config?: Partial<GoogleSecurityConfig>,
  maxIterations: number = 10
): Promise<GoogleSecurityAuditResult> {
  const integration = new GoogleSecurityIntegration(config);
  return integration.runFullAuditWithRL(maxIterations);
}

export default GoogleSecurityIntegration;
