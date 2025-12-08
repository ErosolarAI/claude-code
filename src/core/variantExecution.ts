import type {
  RepoUpgradeMode,
  RepoUpgradeModeDefinition,
  RepoUpgradeModule,
  RepoUpgradeStep,
  UpgradeStepExecutionInput,
  UpgradeStepResult,
  UpgradeVariant,
} from './repoUpgradeOrchestrator.js';

export interface VariantExecutionContext {
  parallelVariants: boolean;
  variantWorkspaceRoots?: Partial<Record<UpgradeVariant, string>>;
  repoPolicy?: string;
}

export type VariantExecutor = (input: UpgradeStepExecutionInput) => Promise<UpgradeStepResult>;

export interface ExecuteVariantsParams {
  module: RepoUpgradeModule;
  step: RepoUpgradeStep;
  mode: RepoUpgradeMode;
  modeDefinition: RepoUpgradeModeDefinition;
  context: VariantExecutionContext;
  executeVariant: VariantExecutor;
  emit?: (event: { type: string; timestamp: number; data: Record<string, unknown> }) => void;
}

/**
 * Decide if variants can run safely in parallel.
 */
export function canRunVariantsParallel(
  modeDefinition: RepoUpgradeModeDefinition,
  context: VariantExecutionContext
): boolean {
  if (!context.parallelVariants) return false;
  if (!modeDefinition.variants.includes('refiner')) return false;
  const refinerRoot = context.variantWorkspaceRoots?.refiner;
  const primaryRoot = context.variantWorkspaceRoots?.primary;
  return Boolean(refinerRoot && primaryRoot && refinerRoot !== primaryRoot);
}

/**
 * Resolve the workspace root for a variant, falling back to the primary root.
 */
export function resolveWorkspaceRoot(
  variant: UpgradeVariant,
  context: VariantExecutionContext
): string | undefined {
  return context.variantWorkspaceRoots?.[variant] ?? context.variantWorkspaceRoots?.primary;
}

/**
 * Execute primary/refiner variants either in parallel or sequentially, preserving
 * the original behavior where refiner sees the primary result in sequential mode.
 */
export async function executeVariants(params: ExecuteVariantsParams): Promise<
  Partial<Record<UpgradeVariant, UpgradeStepResult>>
> {
  const { module, step, mode, modeDefinition, context, emit, executeVariant } = params;
  const results: Partial<Record<UpgradeVariant, UpgradeStepResult>> = {};
  const parallel = canRunVariantsParallel(modeDefinition, context);

  if (parallel && modeDefinition.variants.length > 1) {
    emit?.({
      type: 'upgrade.step.variants.parallel',
      timestamp: Date.now(),
      data: { moduleId: module.id, stepId: step.id, variants: modeDefinition.variants },
    });

    const promises = modeDefinition.variants.map(async (variant) => {
      const result = await executeVariant({
        module,
        step,
        mode,
        variant,
        previousResult: undefined,
        workspaceRoot: resolveWorkspaceRoot(variant, context),
        repoPolicy: context.repoPolicy,
      });
      return { variant, result };
    });

    const resolved = await Promise.all(promises);
    for (const { variant, result } of resolved) {
      results[variant] = result;
    }
    return results;
  }

  for (const variant of modeDefinition.variants) {
    const previousResult = variant === 'refiner' ? results.primary : undefined;
    const result = await executeVariant({
      module,
      step,
      mode,
      variant,
      previousResult,
      workspaceRoot: resolveWorkspaceRoot(variant, context),
      repoPolicy: context.repoPolicy,
    });
    results[variant] = result;
  }

  return results;
}
