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

export {
  AlphaZeroRunner,
  runAlphaZeroSelfPlay,
  createAgentStrategy,
  TrueAlphaZeroEngine,
  createSelfPlayTask,
  ALPHA_STRATEGY,
  BETA_STRATEGY,
  type AlphaZeroRunnerOptions,
  type AlphaZeroRunnerResult,
  type AlphaZeroAgent,
  type AgentRole,
  type AgentProposal,
  type EvaluationResult,
  type SelfPlayRound,
  type SelfPlayResult,
  type SelfPlayTask,
  type AlphaZeroCallbacks,
  type AlphaZeroConfig,
  type AgentStrategy,
} from './alphaZeroRunner.js';
