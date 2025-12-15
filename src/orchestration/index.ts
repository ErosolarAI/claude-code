/**
 * Orchestration Module Index
 *
 * Exports orchestration runners for AGI Core operations including
 * repository upgrades and security audits.
 */

export {
  runRepoUpgradeFlow,
  type RepoUpgradeFlowOptions,
  type EnhancedRepoUpgradeReport,
} from './repoUpgradeRunner.js';

export {
  SecurityAuditRunner,
  runSecurityAuditWithDualTournamentRL,
  type SecurityAuditRunnerOptions,
  type SecurityAuditProgress,
  type SecurityAuditResult,
  type SecurityAuditMetrics,
  type SecurityFix,
  type TournamentStats,
} from './securityAuditRunner.js';
