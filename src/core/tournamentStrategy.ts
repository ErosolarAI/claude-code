import type { RepoUpgradeModule } from './repoUpgradeOrchestrator.js';
import { DEFAULT_HUMAN_REWARD_WEIGHTS, type HumanRewardWeights } from './dualTournament.js';
import { clampScore } from './repoUpgradeOrchestrator.js';

export interface EvaluatorConfig {
  rewardWeights: HumanRewardWeights;
  evaluators: Array<{
    id: string;
    label: string;
    weight: number;
    kind: 'hard' | 'soft' | 'hybrid';
    elo?: number;
  }>;
}

export function buildEvaluatorConfig(
  module: RepoUpgradeModule,
  telemetry?: Map<string, TelemetrySnapshot>
): EvaluatorConfig {
  const repoType = getRepoTypeFromModule(module);

  // Default: balanced weights
  let rewardWeights = DEFAULT_HUMAN_REWARD_WEIGHTS;
  let hardWeight = 1.35;
  let qualityWeight = 1.0;
  let rewardWeight = 0.9;

  if (repoType === 'tests') {
    rewardWeights = { alpha: 0.7, beta: 0.15, gamma: 0.15 };
    hardWeight = 1.55;
    qualityWeight = 0.9;
    rewardWeight = 0.85;
  } else if (repoType === 'docs') {
    rewardWeights = { alpha: 0.45, beta: 0.3, gamma: 0.25 };
    hardWeight = 1.0;
    qualityWeight = 1.2;
    rewardWeight = 1.0;
  } else if (repoType === 'refactor') {
    rewardWeights = { alpha: 0.55, beta: 0.25, gamma: 0.2 };
    hardWeight = 1.25;
    qualityWeight = 1.15;
    rewardWeight = 0.95;
  }

  const telemetrySnapshot = telemetry?.get(repoType);
  if (telemetrySnapshot) {
    const total = Math.max(1, telemetrySnapshot.winsPrimary + telemetrySnapshot.winsRefiner);
    const bias = (telemetrySnapshot.winsPrimary - telemetrySnapshot.winsRefiner) / total;
    if (bias > 0.1) {
      hardWeight = clampScore(hardWeight + 0.1, 0.8, 2);
      rewardWeights = {
        alpha: clampScore((rewardWeights.alpha ?? 0.6) + 0.05, 0, 1),
        beta: rewardWeights.beta,
        gamma: clampScore((rewardWeights.gamma ?? 0.2) - 0.02, 0, 1),
      };
    } else if (bias < -0.1) {
      qualityWeight = clampScore(qualityWeight + 0.1, 0.8, 2);
      rewardWeight = clampScore(rewardWeight + 0.05, 0.5, 1.5);
      rewardWeights = {
        alpha: clampScore((rewardWeights.alpha ?? 0.6) - 0.05, 0, 1),
        beta: clampScore((rewardWeights.beta ?? 0.25) + 0.05, 0, 1),
        gamma: clampScore((rewardWeights.gamma ?? 0.2) + 0.02, 0, 1),
      };
    }
  }

  return {
    rewardWeights,
    evaluators: [
      { id: 'hard-metrics', label: 'Hard metrics', weight: hardWeight, kind: 'hard' },
      { id: 'quality', label: 'Quality', weight: qualityWeight, kind: 'hybrid' },
      { id: 'reward-signal', label: 'Reward signal', weight: rewardWeight, kind: 'hybrid' },
    ],
  };
}

export interface TelemetrySnapshot {
  winsPrimary: number;
  winsRefiner: number;
}

function getRepoTypeFromModule(module: RepoUpgradeModule): string {
  const scope = (module.scope || []).join(' ').toLowerCase();
  const label = (module.label || '').toLowerCase();
  if (/\btest|__tests__|spec\b/i.test(scope) || /\btest\b/i.test(label)) return 'tests';
  if (/\bdocs?\b/i.test(scope) || /\bdoc\b/i.test(label)) return 'docs';
  if (/\brefactor|cleanup|source\b/i.test(scope + ' ' + label)) return 'refactor';
  return 'general';
}
