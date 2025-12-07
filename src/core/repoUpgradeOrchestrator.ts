import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { UnifiedOrchestrator, type ExecutionResult, type Finding, type OperationReport } from './unifiedOrchestrator.js';

export type RepoUpgradeMode = 'single-continuous' | 'dual-rl-continuous';
export type UpgradeVariant = 'primary' | 'refiner';

export interface RepoUpgradeModeDefinition {
  id: RepoUpgradeMode;
  label: string;
  description: string;
  /** Ordered list of variants to execute for this mode */
  variants: UpgradeVariant[];
  /** Guidance to inject into prompts per variant */
  variantGuidance?: Partial<Record<UpgradeVariant, string>>;
  /** Bias to apply to the refiner when scores are tied (encourages RL exploration) */
  refinerBias?: number;
}

export const REPO_UPGRADE_MODE_DEFINITIONS: Record<RepoUpgradeMode, RepoUpgradeModeDefinition> = {
  'single-continuous': {
    id: 'single-continuous',
    label: 'Single continuous',
    description: 'Single-pass deterministic execution focused on minimal blast radius.',
    variants: ['primary'],
    variantGuidance: {
      primary: 'Plan and execute the best possible upgrade in one pass. Keep edits surgical and runnable.',
    },
  },
  'dual-rl-continuous': {
    id: 'dual-rl-continuous',
    label: 'Dual-agent RL continuous',
    description: 'Primary + refiner loop where the refiner competes to improve safety and quality.',
    variants: ['primary', 'refiner'],
    variantGuidance: {
      primary: 'Primary pass sets the baseline plan and changes with conservative scope and runnable checks.',
      refiner:
        'RL refiner critiques the primary, fixes gaps, tightens safety, and only repeats steps if they materially improve the result.',
    },
    refinerBias: 0.05,
  },
};

export type UpgradeStepIntent = 'analyze' | 'upgrade' | 'verify' | 'cleanup';

export interface RepoUpgradeStep {
  id: string;
  intent: UpgradeStepIntent;
  description: string;
  /** Optional instruction or prompt to feed into the executor */
  prompt?: string;
}

export interface RepoUpgradeModule {
  id: string;
  label: string;
  description: string;
  scope: string[];
  /** Suggested codemod commands to run for this module (display only, not executed automatically). */
  codemodCommands?: string[];
  /** Suggested validation commands to run for this module (display only, not executed automatically). */
  validationCommands?: string[];
  steps: RepoUpgradeStep[];
}

export interface RepoUpgradePlan {
  modules: RepoUpgradeModule[];
}

export interface UpgradeStepExecutionInput {
  module: RepoUpgradeModule;
  step: RepoUpgradeStep;
  /** Which path we are taking: single-pass primary or the dual RL refiner */
  variant: UpgradeVariant;
  mode: RepoUpgradeMode;
  previousResult?: UpgradeStepResult;
}

export interface UpgradeStepResult {
  success: boolean;
  summary: string;
  detail?: string;
  score?: number;
  durationMs?: number;
  execution?: ExecutionResult;
  findings?: Finding[];
  notes?: string[];
}

export interface UpgradeStepOutcome {
  stepId: string;
  intent: UpgradeStepIntent;
  description: string;
  primary: UpgradeStepResult;
  refiner?: UpgradeStepResult;
  winner: UpgradeStepResult;
  winnerVariant: UpgradeVariant;
  status: 'completed' | 'failed';
}

export interface UpgradeModuleReport {
  id: string;
  label: string;
  scope: string[];
  codemodCommands?: string[];
  validationCommands?: string[];
  steps: UpgradeStepOutcome[];
  status: 'completed' | 'failed' | 'skipped';
  validations?: ValidationRunResult[];
}

export interface RepoUpgradeReport extends OperationReport {
  mode: RepoUpgradeMode;
  continueOnFailure: boolean;
  modules: UpgradeModuleReport[];
  validationArtifacts?: ValidationRunResult[];
  /** True when validation commands were executed instead of just suggested */
  validationsExecuted?: boolean;
}

export interface RepoUpgradeRunOptions {
  objective?: string;
  mode: RepoUpgradeMode;
  continueOnFailure?: boolean;
}

export type UpgradeStepExecutor = (input: UpgradeStepExecutionInput) => Promise<UpgradeStepResult>;

export interface ValidationRunResult {
  command: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  skipped?: boolean;
  reason?: string;
}

/**
 * Build a repo-wide upgrade plan using common directories. Falls back to a single
 * catch-all module when no known scopes are found.
 */
export function buildRepoWidePlan(workspaceRoot: string, additionalScopes: string[] = []): RepoUpgradePlan {
  const areas: Array<{
    id: string;
    label: string;
    description: string;
    scope: string[];
    candidates: string[];
    codemodCommands?: string[];
    validationCommands?: string[];
  }> = [
    {
      id: 'source',
      label: 'Source',
      description: 'Core application and library code.',
      scope: ['src/**/*', 'lib/**/*'],
      candidates: ['src', 'lib'],
      codemodCommands: ['npx jscodeshift -t <transform> src'],
      validationCommands: ['npm run build', 'npm test'],
    },
    {
      id: 'tests',
      label: 'Tests',
      description: 'Unit, integration, and smoke tests.',
      scope: ['test/**/*', '__tests__/**/*'],
      candidates: ['test', '__tests__'],
      validationCommands: ['npm test -- --runInBand', 'npm run lint'],
    },
    {
      id: 'docs',
      label: 'Docs',
      description: 'Documentation and guides.',
      scope: ['docs/**/*', 'README.md'],
      candidates: ['docs', 'README.md'],
    },
    {
      id: 'scripts',
      label: 'Tooling Scripts',
      description: 'Build, migration, and maintenance scripts.',
      scope: ['scripts/**/*'],
      candidates: ['scripts'],
      validationCommands: ['npm run lint -- scripts/**/*.ts'],
    },
    {
      id: 'agents',
      label: 'Agents',
      description: 'Agent rules and behaviors.',
      scope: ['agents/**/*'],
      candidates: ['agents'],
      validationCommands: ['npm run build'],
    },
    {
      id: 'skills',
      label: 'Skills',
      description: 'Skill packs and reusable automation.',
      scope: ['skills/**/*'],
      candidates: ['skills'],
      validationCommands: ['npm run build'],
    },
    {
      id: 'examples',
      label: 'Examples',
      description: 'Example flows and templates.',
      scope: ['examples/**/*'],
      candidates: ['examples'],
    },
    {
      id: 'configs',
      label: 'Configuration',
      description: 'Configuration and deployment settings.',
      scope: ['config/**/*', '*.config.*', '*.rc', '*.json'],
      candidates: ['config'],
    },
  ];

  for (const extra of additionalScopes) {
    if (!extra?.trim()) continue;
    const slug = extra.replace(/[^\w]/g, '-').toLowerCase() || 'custom';
    areas.push({
      id: `custom-${slug}`,
      label: `Custom: ${extra}`,
      description: `User-specified scope: ${extra}`,
      scope: [`${extra}/**/*`],
      candidates: [extra],
    });
  }

  const modules: RepoUpgradeModule[] = [];
  const workspaceModules = detectWorkspaceModules(workspaceRoot);
  modules.push(...workspaceModules);

  for (const area of areas) {
    const matches = area.candidates.some((candidate) => existsSync(join(workspaceRoot, candidate)));
    if (!matches) {
      continue;
    }
    modules.push({
      id: area.id,
      label: area.label,
      description: area.description,
      scope: area.scope,
      codemodCommands: area.codemodCommands,
      validationCommands: area.validationCommands,
      steps: buildDefaultSteps(area.id),
    });
  }

  if (modules.length === 0) {
    modules.push({
      id: 'repo-wide',
      label: 'Repository',
      description: 'Fallback repo-wide upgrade module.',
      scope: ['**/*'],
      steps: buildDefaultSteps('repo'),
    });
  }

  return { modules };
}

function detectWorkspaceModules(workspaceRoot: string): RepoUpgradeModule[] {
  const pkgPath = join(workspaceRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    return [];
  }

  let workspaces: string[] = [];
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    workspaces = parseWorkspaceField(pkg?.workspaces);
  } catch {
    return [];
  }

  if (!workspaces.length) {
    return [];
  }

  const modules: RepoUpgradeModule[] = [];
  const seen = new Set<string>();

  for (const pattern of workspaces) {
    const paths = expandWorkspacePattern(workspaceRoot, pattern);
    for (const relPath of paths) {
      if (seen.has(relPath)) {
        continue;
      }
      seen.add(relPath);

      const cleanPath = relPath.replace(/\/+$/, '');
      const name = cleanPath.split('/').filter(Boolean).pop() ?? cleanPath;
      const normalizedPath = cleanPath.replace(/[/\\]+/g, '-');
      const slug = `workspace-${normalizedPath.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase() || 'default'}`;

      modules.push({
        id: slug,
        label: `Workspace: ${name}`,
        description: `Upgrade tasks scoped to workspace "${name}" (${cleanPath}).`,
        scope: [`${cleanPath}/**/*`],
        validationCommands: [
          `npm test --workspace ${name} --if-present`,
          `npm run lint --workspace ${name} --if-present`,
        ],
        steps: buildDefaultSteps(slug),
      });
    }
  }

  return modules;
}

function parseWorkspaceField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    const record = value as { packages?: unknown };
    if (Array.isArray(record.packages)) {
      return record.packages.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
    }
  }
  return [];
}

function expandWorkspacePattern(workspaceRoot: string, pattern: string): string[] {
  const normalized = pattern.trim();
  if (!normalized) return [];

  if (!normalized.includes('*')) {
    const target = join(workspaceRoot, normalized);
    return existsSync(target) ? [normalized] : [];
  }

  const base = normalized.split('*')[0]?.replace(/\/+$/, '') ?? '';
  if (!base) return [];

  const baseDir = join(workspaceRoot, base);
  if (!existsSync(baseDir)) return [];

  try {
    const entries = readdirSync(baseDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => `${base}/${entry.name}`);
  } catch {
    return [];
  }
}

export class RepoUpgradeOrchestrator extends UnifiedOrchestrator {
  private readonly executor: UpgradeStepExecutor;

  constructor(executor: UpgradeStepExecutor) {
    super();
    this.executor = executor;
  }

  /**
   * Execute the repo-wide plan using either single continuous or dual RL continuous mode.
   */
  async run(plan: RepoUpgradePlan, options: RepoUpgradeRunOptions): Promise<RepoUpgradeReport> {
    const mode = options.mode;
    const continueOnFailure = options.continueOnFailure ?? true;
    const objective = options.objective ?? 'Repository-wide source code upgrade';

    // Reset state per run to keep reports clean
    this.results = [];
    this.findings = [];

    const moduleReports: UpgradeModuleReport[] = [];
    let halted = false;

    for (const module of plan.modules) {
      if (halted) {
        moduleReports.push({
          id: module.id,
          label: module.label,
          scope: module.scope,
          steps: [],
          status: 'skipped',
        });
        continue;
      }

      this.emit({
        type: 'upgrade.module.start',
        timestamp: Date.now(),
        data: { moduleId: module.id, label: module.label, scope: module.scope, mode },
      });

      const moduleReport: UpgradeModuleReport = {
        id: module.id,
        label: module.label,
        scope: module.scope,
        codemodCommands: module.codemodCommands,
        validationCommands: module.validationCommands,
        steps: [],
        status: 'completed',
      };

      for (const step of module.steps) {
        const outcome = await this.runStep(module, step, mode);
        moduleReport.steps.push(outcome);

        if (!outcome.winner.success) {
          moduleReport.status = 'failed';
          if (!continueOnFailure) {
            halted = true;
            break;
          }
        }
      }

      moduleReports.push(moduleReport);

      this.emit({
        type: 'upgrade.module.complete',
        timestamp: Date.now(),
        data: { moduleId: module.id, status: moduleReport.status },
      });
    }

    const baseReport = this.generateReport(objective);
    return { ...baseReport, mode, continueOnFailure, modules: moduleReports };
  }

  private async runStep(
    module: RepoUpgradeModule,
    step: RepoUpgradeStep,
    mode: RepoUpgradeMode
  ): Promise<UpgradeStepOutcome> {
    const modeDefinition = getModeDefinition(mode);
    this.emit({
      type: 'upgrade.step.start',
      timestamp: Date.now(),
      data: { moduleId: module.id, stepId: step.id, variant: 'primary', mode },
    });

    const variantResults: Partial<Record<UpgradeVariant, UpgradeStepResult>> = {};

    for (const variant of modeDefinition.variants) {
      const previousResult = variant === 'refiner' ? variantResults.primary : undefined;
      const result = await this.safeExecuteVariant({ module, step, mode, variant, previousResult });
      variantResults[variant] = result;
    }

    const primary = variantResults.primary as UpgradeStepResult;
    const refiner = variantResults.refiner;

    const { winner, winnerVariant } = this.pickWinner(modeDefinition, primary, refiner);
    this.recordOutcomeArtifacts(module, step, winner, winnerVariant);

    this.emit({
      type: 'upgrade.step.complete',
      timestamp: Date.now(),
      data: { moduleId: module.id, stepId: step.id, variant: winnerVariant, success: winner.success },
    });

    return {
      stepId: step.id,
      intent: step.intent,
      description: step.description,
      primary,
      refiner,
      winner,
      winnerVariant,
      status: winner.success ? 'completed' : 'failed',
    };
  }

  private async safeExecuteVariant(input: UpgradeStepExecutionInput): Promise<UpgradeStepResult> {
    try {
      return await this.executor(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        summary: 'Execution failed',
        detail: message,
        score: 0,
        durationMs: 0,
        execution: {
          success: false,
          output: 'Execution failed',
          duration: 0,
          command: `${input.module.id}/${input.step.id}/${input.variant}`,
          error: message,
        },
        notes: ['Executor threw an error'],
      };
    }
  }

  private pickWinner(
    definition: RepoUpgradeModeDefinition,
    primary: UpgradeStepResult,
    refiner?: UpgradeStepResult
  ): { winner: UpgradeStepResult; winnerVariant: UpgradeVariant } {
    if (!refiner || !definition.variants.includes('refiner')) {
      return { winner: primary, winnerVariant: 'primary' };
    }

    if (refiner.success && !primary.success) {
      return { winner: refiner, winnerVariant: 'refiner' };
    }
    if (primary.success && !refiner.success) {
      return { winner: primary, winnerVariant: 'primary' };
    }

    const primaryScore = typeof primary.score === 'number' ? primary.score : 0;
    const refinerScore = (typeof refiner.score === 'number' ? refiner.score : 0) + (definition.refinerBias ?? 0);

    if (refinerScore > primaryScore) {
      return { winner: refiner, winnerVariant: 'refiner' };
    }
    if (primaryScore > refinerScore) {
      return { winner: primary, winnerVariant: 'primary' };
    }

    // Tie breaker: prefer refiner to encourage RL exploration
    return { winner: refiner, winnerVariant: 'refiner' };
  }

  private recordOutcomeArtifacts(
    module: RepoUpgradeModule,
    step: RepoUpgradeStep,
    result: UpgradeStepResult,
    variant: 'primary' | 'refiner'
  ): void {
    if (result.findings?.length) {
      this.findings.push(...result.findings);
    }

    const execution: ExecutionResult = result.execution ?? {
      success: result.success,
      output: result.summary,
      duration: result.durationMs ?? 0,
      command: `${module.id}/${step.id}/${variant}`,
      error: result.success ? undefined : result.detail ?? result.summary,
    };

    // Ensure we only track a single winner record per step to keep reports clean
    this.results.push(execution);
  }
}

function buildDefaultSteps(moduleId: string): RepoUpgradeStep[] {
  return [
    {
      id: `${moduleId}-analyze`,
      intent: 'analyze',
      description: `Map the upgrade surface for ${moduleId}. Identify risky files and coupling.`,
      prompt: 'Inventory files, dependencies, and breaking-change areas before upgrading.',
    },
    {
      id: `${moduleId}-upgrade`,
      intent: 'upgrade',
      description: `Apply modular upgrades for ${moduleId} with minimal blast radius.`,
      prompt: 'Execute codemods or targeted edits. Keep edits small, atomic, and well scoped.',
    },
    {
      id: `${moduleId}-verify`,
      intent: 'verify',
      description: `Validate ${moduleId} after the upgrade.`,
      prompt: 'Run tests/lint/health checks relevant to this scope. Summarize residual risks.',
    },
  ];
}

function getModeDefinition(mode: RepoUpgradeMode): RepoUpgradeModeDefinition {
  return REPO_UPGRADE_MODE_DEFINITIONS[mode] ?? REPO_UPGRADE_MODE_DEFINITIONS['single-continuous'];
}
