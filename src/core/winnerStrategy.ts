import type { TournamentOutcome } from './dualTournament.js';
import type {
  RepoUpgradeModeDefinition,
  UpgradeStepResult,
  UpgradeVariant,
} from './repoUpgradeOrchestrator.js';

export interface WinnerResolutionInput {
  modeDefinition: RepoUpgradeModeDefinition;
  variantResults: Partial<Record<UpgradeVariant, UpgradeStepResult>>;
  tournamentOutcome: TournamentOutcome | null;
}

export type PickWinnerFn = (
  definition: RepoUpgradeModeDefinition,
  primary: UpgradeStepResult,
  refiner?: UpgradeStepResult
) => { winner: UpgradeStepResult; winnerVariant: UpgradeVariant };

/**
 * Resolve the winner for an upgrade step using tournament rankings when present,
 * otherwise falling back to the provided pickWinner strategy.
 */
export function resolveWinner(
  input: WinnerResolutionInput,
  pickWinner: PickWinnerFn
): { winner: UpgradeStepResult; winnerVariant: UpgradeVariant } {
  const primary = input.variantResults.primary as UpgradeStepResult;
  const refiner = input.variantResults.refiner;

  if (input.tournamentOutcome?.ranked?.length) {
    const top = input.tournamentOutcome.ranked[0];
    const topVariant: UpgradeVariant = top.candidateId === 'refiner' && refiner ? 'refiner' : 'primary';
    const winner = topVariant === 'refiner' && refiner ? refiner : primary;
    return { winner, winnerVariant: topVariant };
  }

  return pickWinner(input.modeDefinition, primary, refiner);
}
