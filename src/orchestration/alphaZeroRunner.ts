import { exec as execCallback } from 'node:child_process';
import { mkdir, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import type { ProfileName } from '../config.js';
import { buildWorkspaceContext, resolveWorkspaceCaptureOptions } from '../workspace.js';
import type { AgentEventUnion } from '../contracts/v1/agent.js';
import { GitWorktreeManager } from '../core/gitWorktreeManager.js';
import { runDualTournament, DEFAULT_HUMAN_REWARD_WEIGHTS, type TournamentOutcome } from '../core/dualTournament.js';
import { createAgentController, type AgentController } from '../runtime/agentController.js';
import { logDebug } from '../utils/debugLogger.js';
import { getSelfUpgrade, type RLUpgradeContext, type UpgradeResult } from '../core/selfUpgrade.js';

const exec = promisify(execCallback);

const ALLOWED_SYNC_PATHS = [
  'src/',
  'test/',
  'agents/',
  'skills/',
  'config/',
  'docs/',
  'examples/',
  'scripts/',
  'dist/',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.dev.json',
  'tsconfig.jest.json',
  'README.md',
  'LICENSE',
  'jest.config.cjs',
  'babel.config.cjs',
];

const COPY_EXCLUDE = ['node_modules', '.git', '.agi', 'coverage', 'dist', '.turbo', '.next'];

export type AlphaZeroEvent =
  | { type: 'iteration.start'; iteration: number }
  | { type: 'agent.start'; iteration: number; variant: 'primary' | 'refiner'; workspace: string }
  | {
      type: 'agent.complete';
      iteration: number;
      variant: 'primary' | 'refiner';
      durationMs: number;
      filesChanged: string[];
    }
  | {
      type: 'evaluation.complete';
      iteration: number;
      variant: 'primary' | 'refiner';
      buildSuccess: boolean;
      testsPassed: number;
      testsFailed: number;
    }
  | {
      type: 'security.complete';
      iteration: number;
      variant: 'primary' | 'refiner';
      securitySuccess: boolean;
      findings: number;
    }
  | { type: 'winner.applied'; iteration: number; winner: 'primary' | 'refiner'; filesApplied: string[] }
  | { type: 'iteration.complete'; iteration: number; winner: 'primary' | 'refiner' | 'tie'; score: number }
  | { type: 'selfUpgrade.start'; iteration: number; fromVersion: string; toVersion?: string }
  | { type: 'selfUpgrade.complete'; iteration: number; success: boolean; toVersion?: string; scoreImpact: number }
  | { type: 'selfUpgrade.checkpoint'; iteration: number; context: RLUpgradeContext };

export interface AlphaZeroIterationResult {
  iteration: number;
  primary: AgentRunResult;
  refiner: AgentRunResult;
  tournament: TournamentOutcome;
  winner: 'primary' | 'refiner' | 'tie';
  appliedFiles: string[];
  improvement: number;
}

export interface AgentRunResult {
  variant: 'primary' | 'refiner';
  workspace: string;
  output: string;
  filesChanged: string[];
  buildSuccess: boolean;
  testsPassed: number;
  testsFailed: number;
  /** Result of the security scan command for this workspace */
  securitySuccess: boolean;
  securityFindings: number;
  durationMs: number;
}

export interface AlphaZeroFlowResult {
  objective: string;
  iterations: AlphaZeroIterationResult[];
  bestScore: number;
  convergenceReached: boolean;
  filesModified: string[];
}

export interface TrueAlphaZeroFlowOptions {
  profile: ProfileName;
  workingDir: string;
  objective: string;
  maxIterations?: number;
  buildCommand?: string;
  testCommand?: string;
  securityCommand?: string;
  enableVariantWorktrees?: boolean;
  onEvent?: (event: AlphaZeroEvent) => void;
  onAgentEvent?: (variant: 'primary' | 'refiner', event: AgentEventUnion) => void;
  /** Enable self-upgrade during RL iterations */
  enableSelfUpgrade?: boolean;
  /** Check for updates every N iterations (default: 1 = every iteration) */
  upgradeCheckInterval?: number;
  /** Auto-apply upgrades when available */
  autoApplyUpgrades?: boolean;
  /** Logger for upgrade events */
  upgradeLogger?: (message: string) => void;
}

interface WinnerReinforcementContext {
  winner: 'primary' | 'refiner';
  appliedFiles: string[];
  aggregateScore: number;
  buildSuccess: boolean;
  testsFailed: number;
  securityFindings: number;
}

const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_BUILD_COMMAND = 'npm run build --if-present';
const DEFAULT_TEST_COMMAND = 'npm test -- --runInBand --passWithNoTests';
const DEFAULT_SECURITY_COMMAND = 'npm run --if-present lint -- --max-warnings=0';
const CONVERGENCE_PATIENCE = 2;

export async function runTrueAlphaZeroFlow(options: TrueAlphaZeroFlowOptions): Promise<AlphaZeroFlowResult> {
  const iterations: AlphaZeroIterationResult[] = [];
  let bestScore = 0;
  let noImprovementCount = 0;
  const filesModified = new Set<string>();
  let lastWinningContext: WinnerReinforcementContext | null = null;
  let upgradeScoreBonus = 0;

  // Initialize self-upgrade if enabled
  const selfUpgrade = options.enableSelfUpgrade ? getSelfUpgrade({
    workingDir: options.workingDir,
    logger: options.upgradeLogger,
    autoRestart: false, // We handle restart ourselves for RL continuity
  }) : null;

  // Check for and resume from any previous RL checkpoint
  if (selfUpgrade) {
    const checkpoint = selfUpgrade.loadRLCheckpoint();
    if (checkpoint) {
      logDebug(`Resuming from RL checkpoint: iteration ${checkpoint.iteration}, score ${checkpoint.currentScore}`);
      bestScore = checkpoint.currentScore;
      selfUpgrade.clearRLCheckpoint();
    }
  }

  for (let iteration = 1; iteration <= (options.maxIterations ?? DEFAULT_MAX_ITERATIONS); iteration++) {
    options.onEvent?.({ type: 'iteration.start', iteration });

    // Check for self-upgrade opportunity
    if (selfUpgrade && options.enableSelfUpgrade) {
      const checkInterval = options.upgradeCheckInterval ?? 1;
      if (iteration % checkInterval === 0) {
        const upgradeResult = await checkAndApplySelfUpgrade({
          selfUpgrade,
          iteration,
          bestScore,
          filesModified: Array.from(filesModified),
          objective: options.objective,
          autoApply: options.autoApplyUpgrades ?? false,
          onEvent: options.onEvent,
        });
        if (upgradeResult) {
          upgradeScoreBonus += upgradeResult.scoreImpact;
        }
      }
    }

    const { primaryWorkspace, refinerWorkspace, worktreeManager } = await prepareWorkspaces(
      options.workingDir,
      options.enableVariantWorktrees !== false
    );

    try {
      const primaryController = await createControllerForWorkspace(options.profile, primaryWorkspace);
      const refinerController = await createControllerForWorkspace(options.profile, refinerWorkspace);

      const reinforcement = buildWinnerReinforcement(lastWinningContext);

      const primaryResult = await runAgentOnce(
        primaryController,
        buildPrimaryPrompt(options.objective, iteration, reinforcement),
        iteration,
        'primary',
        options.onAgentEvent,
        options.onEvent
      );
      const refinerResult = await runAgentOnce(
        refinerController,
        buildRefinerPrompt(options.objective, iteration, primaryResult.filesChanged, reinforcement),
        iteration,
        'refiner',
        options.onAgentEvent,
        options.onEvent
      );

      // Evaluate both variants (build + tests)
      const primaryEval = await evaluateWorkspace(
        primaryWorkspace,
        options.buildCommand ?? DEFAULT_BUILD_COMMAND,
        options.testCommand ?? DEFAULT_TEST_COMMAND,
        options.securityCommand ?? DEFAULT_SECURITY_COMMAND
      );
      const refinerEval = await evaluateWorkspace(
        refinerWorkspace,
        options.buildCommand ?? DEFAULT_BUILD_COMMAND,
        options.testCommand ?? DEFAULT_TEST_COMMAND,
        options.securityCommand ?? DEFAULT_SECURITY_COMMAND
      );

      options.onEvent?.({
        type: 'evaluation.complete',
        iteration,
        variant: 'primary',
        buildSuccess: primaryEval.buildSuccess,
        testsPassed: primaryEval.testsPassed,
        testsFailed: primaryEval.testsFailed,
      });
      options.onEvent?.({
        type: 'evaluation.complete',
        iteration,
        variant: 'refiner',
        buildSuccess: refinerEval.buildSuccess,
        testsPassed: refinerEval.testsPassed,
        testsFailed: refinerEval.testsFailed,
      });
      options.onEvent?.({
        type: 'security.complete',
        iteration,
        variant: 'primary',
        securitySuccess: primaryEval.securitySuccess,
        findings: primaryEval.securityFindings,
      });
      options.onEvent?.({
        type: 'security.complete',
        iteration,
        variant: 'refiner',
        securitySuccess: refinerEval.securitySuccess,
        findings: refinerEval.securityFindings,
      });

      const primaryFiles = await collectChangedFiles(options.workingDir, primaryWorkspace);
      const refinerFiles = await collectChangedFiles(options.workingDir, refinerWorkspace);

      const tournament = runDualTournament(
        { id: `iteration-${iteration}`, goal: options.objective, constraints: ['build-must-pass'] },
        [
          buildCandidate('primary', primaryEval, primaryFiles),
          buildCandidate('refiner', refinerEval, refinerFiles),
        ],
        { rewardWeights: DEFAULT_HUMAN_REWARD_WEIGHTS }
      );

      const { winner, improvement, appliedFiles } = await applyWinner({
        winnerId: pickWinner(tournament),
        primaryWorkspace,
        refinerWorkspace,
        worktreeManager,
        workingDir: options.workingDir,
        primaryFiles,
        refinerFiles,
      });

      if (winner !== 'tie') {
        options.onEvent?.({ type: 'winner.applied', iteration, winner, filesApplied: appliedFiles });
      }
      appliedFiles.forEach((file) => filesModified.add(file));

      const iterationResult: AlphaZeroIterationResult = {
        iteration,
        primary: {
          ...primaryResult,
          buildSuccess: primaryEval.buildSuccess,
          testsPassed: primaryEval.testsPassed,
          testsFailed: primaryEval.testsFailed,
          securitySuccess: primaryEval.securitySuccess,
          securityFindings: primaryEval.securityFindings,
        },
        refiner: {
          ...refinerResult,
          buildSuccess: refinerEval.buildSuccess,
          testsPassed: refinerEval.testsPassed,
          testsFailed: refinerEval.testsFailed,
          securitySuccess: refinerEval.securitySuccess,
          securityFindings: refinerEval.securityFindings,
        },
        tournament,
        winner,
        appliedFiles,
        improvement,
      };

      iterations.push(iterationResult);
      options.onEvent?.({ type: 'iteration.complete', iteration, winner, score: tournament.ranked[0]?.aggregateScore ?? 0 });

      lastWinningContext = deriveWinnerReinforcementContext({
        winner,
        tournament,
        appliedFiles,
        primaryEval,
        refinerEval,
      });

      if (tournament.ranked[0]) {
        const winnerScore = tournament.ranked[0].aggregateScore;
        if (winnerScore > bestScore) {
          bestScore = winnerScore;
          noImprovementCount = 0;
        } else {
          noImprovementCount++;
        }
      } else {
        noImprovementCount++;
      }

      if (noImprovementCount >= CONVERGENCE_PATIENCE) {
        break;
      }
    } finally {
      await cleanupWorkspace(primaryWorkspace);
      await worktreeManager.cleanup().catch(() => undefined);
    }
  }

  return {
    objective: options.objective,
    iterations,
    bestScore: bestScore + upgradeScoreBonus,
    convergenceReached: noImprovementCount >= CONVERGENCE_PATIENCE,
    filesModified: Array.from(filesModified),
  };
}

/**
 * Check for and apply self-upgrade during RL iteration
 */
async function checkAndApplySelfUpgrade(params: {
  selfUpgrade: ReturnType<typeof getSelfUpgrade>;
  iteration: number;
  bestScore: number;
  filesModified: string[];
  objective: string;
  autoApply: boolean;
  onEvent?: (event: AlphaZeroEvent) => void;
}): Promise<{ scoreImpact: number } | null> {
  const { selfUpgrade, iteration, bestScore, filesModified, objective, autoApply, onEvent } = params;

  try {
    const versionInfo = await selfUpgrade.checkForUpdates();

    if (!versionInfo.updateAvailable) {
      return null;
    }

    // Create RL context for checkpoint
    const rlContext: RLUpgradeContext = {
      iteration,
      variant: 'primary', // Default, actual variant tracked separately
      objective,
      currentScore: bestScore,
      filesModified,
    };

    onEvent?.({
      type: 'selfUpgrade.start',
      iteration,
      fromVersion: versionInfo.current,
      toVersion: versionInfo.latest,
    });

    // Save checkpoint before upgrade
    selfUpgrade.saveRLCheckpoint(rlContext);
    onEvent?.({ type: 'selfUpgrade.checkpoint', iteration, context: rlContext });

    if (!autoApply) {
      // Just report availability, don't apply
      return null;
    }

    // Perform upgrade with build verification
    const result = await selfUpgrade.upgradeWithBuildCheck(versionInfo.latest);

    if (result.success && result.buildSuccess) {
      const scoreImpact = selfUpgrade.calculateRLScoreImpact(rlContext, true);

      onEvent?.({
        type: 'selfUpgrade.complete',
        iteration,
        success: true,
        toVersion: result.toVersion,
        scoreImpact,
      });

      // Clear checkpoint on success
      selfUpgrade.clearRLCheckpoint();

      return { scoreImpact };
    } else {
      const scoreImpact = selfUpgrade.calculateRLScoreImpact(rlContext, false);

      onEvent?.({
        type: 'selfUpgrade.complete',
        iteration,
        success: false,
        scoreImpact,
      });

      return { scoreImpact };
    }
  } catch (error) {
    logDebug(`Self-upgrade check failed: ${error}`);
    return null;
  }
}

async function prepareWorkspaces(workingDir: string, enableWorktrees: boolean) {
  const worktreeManager = new GitWorktreeManager({
    baseDir: workingDir,
    sessionId: `az-${Date.now()}`,
    createBranches: true,
    branchPrefix: 'agi-az',
  });
  await worktreeManager.initialize();

  const refinerInfo = enableWorktrees ? await worktreeManager.createVariantWorkspace('refiner') : null;
  const refinerWorkspace = refinerInfo?.path ?? workingDir;
  const primaryWorkspace = await createWorkspaceCopy(workingDir, 'primary');

  return { worktreeManager, primaryWorkspace, refinerWorkspace };
}

async function createControllerForWorkspace(profile: ProfileName, workspace: string): Promise<AgentController> {
  const workspaceContext = buildWorkspaceContext(workspace, resolveWorkspaceCaptureOptions(process.env));
  return createAgentController({
    profile,
    workingDir: workspace,
    workspaceContext,
    env: process.env,
    skipProviderDiscovery: true,
  });
}

async function runAgentOnce(
  controller: AgentController,
  prompt: string,
  iteration: number,
  variant: 'primary' | 'refiner',
  onAgentEvent?: (variant: 'primary' | 'refiner', event: AgentEventUnion) => void,
  onEvent?: (event: AlphaZeroEvent) => void
): Promise<
  Omit<AgentRunResult, 'buildSuccess' | 'testsPassed' | 'testsFailed' | 'securitySuccess' | 'securityFindings'>
> {
  onEvent?.({ type: 'agent.start', iteration, variant, workspace: (controller as any).session?.workspace?.cwd ?? '' });
  const start = Date.now();
  let output = '';

  for await (const event of controller.send(prompt)) {
    onAgentEvent?.(variant, event);
    if (event.type === 'message.delta' || event.type === 'message.complete') {
      output += event.content ?? '';
    }
  }

  return {
    variant,
    workspace: (controller as any).session?.workspace?.cwd ?? '',
    output: output.trim(),
    filesChanged: await collectChangedFilesFromSession(controller),
    durationMs: Date.now() - start,
  };
}

async function collectChangedFilesFromSession(controller: AgentController): Promise<string[]> {
  // Best-effort: rely on git status inside the controller workspace
  const cwd = (controller as any).session?.workspace?.cwd;
  if (!cwd) return [];
  try {
    const { stdout } = await exec('git status --porcelain', { cwd });
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[A-Z?]{2}\s+/, ''));
  } catch {
    return [];
  }
}

async function evaluateWorkspace(workspace: string, buildCommand: string, testCommand: string, securityCommand: string) {
  const runCommand = async (command: string) => {
    if (!command.trim()) {
      return { success: true, output: '' };
    }
    try {
      const { stdout, stderr } = await exec(command, { cwd: workspace, maxBuffer: 10 * 1024 * 1024 });
      return { success: true, output: stdout + stderr };
    } catch (error: any) {
      const output = (error?.stdout || '') + (error?.stderr || '');
      return { success: false, output };
    }
  };

  const buildResult = await runCommand(buildCommand);
  const testResult = await runCommand(testCommand);
  const securityResult = await runCommand(securityCommand);

  const parseCount = (text: string, key: 'pass' | 'fail') => {
    const match = text.match(new RegExp(`(\\d+)\\s*${key}`, 'i'));
    return match ? Number.parseInt(match[1], 10) : 0;
  };

  return {
    buildSuccess: buildResult.success,
    buildOutput: buildResult.output,
    testsPassed: parseCount(testResult.output, 'pass'),
    testsFailed: parseCount(testResult.output, 'fail'),
    rawTestOutput: testResult.output,
    securitySuccess: securityResult.success,
    securityOutput: securityResult.output,
    securityFindings: extractSecurityFindings(securityResult.output),
  };
}

function buildCandidate(
  variant: 'primary' | 'refiner',
  evaluation: Awaited<ReturnType<typeof evaluateWorkspace>>,
  files: string[]
) {
  const totalTests = evaluation.testsPassed + evaluation.testsFailed;
  const securityScore = evaluation.securitySuccess
    ? 1
    : Math.max(0.25, 1 - Math.min(5, evaluation.securityFindings) * 0.12);
  return {
    id: variant,
    policyId: variant,
    patchSummary: `${files.length} files changed`,
    metrics: {
      executionSuccess: evaluation.buildSuccess ? 1 : 0,
      testsPassed: totalTests > 0 ? evaluation.testsPassed / totalTests : 0,
      testsFailed: evaluation.testsFailed,
      staticAnalysis: Math.min(1, securityScore * 0.85 + (evaluation.buildSuccess ? 0.15 : 0)),
      codeQuality: evaluation.buildSuccess ? 0.8 : 0.5,
      blastRadius: Math.max(0, 1 - files.length / 50),
      diffSize: files.length,
      warnings: evaluation.securityFindings,
    },
    signals: {
      rewardModelScore: evaluation.buildSuccess ? 0.8 : 0.3,
      selfAssessment: files.length > 0 ? 0.7 : 0.4,
    },
    evaluatorScores: [
      { evaluatorId: 'build', score: evaluation.buildSuccess ? 1 : 0, weight: 1.5 },
      { evaluatorId: 'tests', score: totalTests > 0 ? evaluation.testsPassed / totalTests : 0.5, weight: 1.2 },
      { evaluatorId: 'security', score: securityScore, weight: 1.3 },
    ],
  };
}

function extractSecurityFindings(output: string): number {
  if (!output) return 0;

  const explicitMatch = output.match(/(\d+)\s+(critical|high|medium|low)\b/i);
  if (explicitMatch) {
    const parsed = Number.parseInt(explicitMatch[1], 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  const vulnMatches = output.match(/vuln(erability|erabilities)/gi);
  return vulnMatches ? vulnMatches.length : 0;
}

function pickWinner(outcome: TournamentOutcome): 'primary' | 'refiner' | 'tie' {
  if (!outcome.ranked.length || outcome.ranked.length < 2) {
    return 'tie';
  }
  const [first, second] = outcome.ranked;
  if (!first || !second) return 'tie';
  if (first.aggregateScore - second.aggregateScore < 0.01) return 'tie';
  return first.candidateId as 'primary' | 'refiner';
}

async function applyWinner(params: {
  winnerId: 'primary' | 'refiner' | 'tie';
  primaryWorkspace: string;
  refinerWorkspace: string;
  worktreeManager: GitWorktreeManager;
  workingDir: string;
  primaryFiles: string[];
  refinerFiles: string[];
}) {
  let appliedFiles: string[] = [];
  let improvement = 0;
  let winner: 'primary' | 'refiner' | 'tie' = params.winnerId;

  if (winner === 'primary') {
    appliedFiles = await syncWorkspaceToBase(params.primaryWorkspace, params.workingDir, params.primaryFiles);
    improvement = appliedFiles.length;
  } else if (winner === 'refiner') {
    try {
      const applied = await params.worktreeManager.applyWinnerChanges('refiner');
      if (applied) {
        appliedFiles = params.refinerFiles;
        improvement = appliedFiles.length;
      }
    } catch (error) {
      logDebug(`Failed to apply refiner changes: ${error}`);
      winner = 'tie';
    }
  }

  return { winner, improvement, appliedFiles };
}

function deriveWinnerReinforcementContext(params: {
  winner: 'primary' | 'refiner' | 'tie';
  tournament: TournamentOutcome;
  appliedFiles: string[];
  primaryEval: Awaited<ReturnType<typeof evaluateWorkspace>>;
  refinerEval: Awaited<ReturnType<typeof evaluateWorkspace>>;
}): WinnerReinforcementContext | null {
  if (params.winner === 'tie') return null;

  const winnerEval = params.winner === 'primary' ? params.primaryEval : params.refinerEval;
  const aggregateScore =
    params.tournament.ranked.find((entry) => entry.candidateId === params.winner)?.aggregateScore ?? 0;

  return {
    winner: params.winner,
    appliedFiles: params.appliedFiles,
    aggregateScore,
    buildSuccess: winnerEval.buildSuccess,
    testsFailed: winnerEval.testsFailed,
    securityFindings: winnerEval.securityFindings,
  };
}

async function createWorkspaceCopy(baseDir: string, label: string): Promise<string> {
  const target = join(tmpdir(), `agi-az-${label}-${Date.now()}`);
  await cp(baseDir, target, {
    recursive: true,
    filter: (src) => {
      const rel = relative(baseDir, src);
      if (!rel) return true;
      if (COPY_EXCLUDE.some((skip) => rel === skip || rel.startsWith(`${skip}/`))) {
        return false;
      }
      return true;
    },
  });
  return target;
}

async function collectChangedFiles(baseDir: string, workspace: string): Promise<string[]> {
  try {
    const { stdout } = await exec(`git diff --no-index --name-only "${baseDir}" "${workspace}"`);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^a\//, '').replace(/^b\//, ''))
      .filter((file) => isAllowedPath(file));
  } catch (error: any) {
    const output = (error?.stdout || '') as string;
    if (output) {
      return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^a\//, '').replace(/^b\//, ''))
        .filter((file) => isAllowedPath(file));
    }
    return [];
  }
}

async function syncWorkspaceToBase(workspace: string, baseDir: string, changedFiles: string[]): Promise<string[]> {
  const files = changedFiles.length ? changedFiles.filter((file) => isAllowedPath(file)) : await collectChangedFiles(baseDir, workspace);
  for (const file of files) {
    const src = join(workspace, file);
    const dest = join(baseDir, file);
    if (existsSync(src)) {
      await mkdir(dirname(dest), { recursive: true });
      const content = await readFile(src);
      await writeFile(dest, content);
    } else {
      await rm(dest, { force: true });
    }
  }
  return files;
}

function isAllowedPath(file: string): boolean {
  return ALLOWED_SYNC_PATHS.some((allowed) => file === allowed || file.startsWith(allowed));
}

async function cleanupWorkspace(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

function buildPrimaryPrompt(objective: string, iteration: number, reinforcement?: string | null): string {
  const reinforcementBlock = reinforcement ? [`Last winner notes: ${reinforcement}`, ''] : [];
  return [
    `You are the PRIMARY agent (iteration ${iteration}).`,
    `Objective: ${objective}`,
    '',
    ...reinforcementBlock,
    'Deliberately take a distinct approach from the refiner. Use the tools to ship real code:',
    '- Inspect the codebase (read files, list directories).',
    '- Apply concrete edits using the edit tools (no pseudo code).',
    '- Run quick checks: npm run build (if present), npm test, and the security/lint command.',
    '- Keep blast radius small and changes coherent.',
    '',
    'Focus on correctness, security, and maintainability while making measurable progress.',
  ].join('\n');
}

function buildRefinerPrompt(
  objective: string,
  iteration: number,
  primaryFiles: string[],
  reinforcement?: string | null
): string {
  const reinforcementBlock = reinforcement ? [`Last winner notes: ${reinforcement}`, ''] : [];
  const primaryTouched = primaryFiles.length
    ? `Primary touched: ${primaryFiles.slice(0, 8).join(', ')}`
    : 'Primary made no visible changes.';

  return [
    `You are the REFINER agent (iteration ${iteration}).`,
    `Objective: ${objective}`,
    '',
    primaryTouched,
    ...reinforcementBlock,
    'Your job:',
    '- Deliver a different, higher-quality approach than the primary.',
    '- Prefer correctness, maintainability, security, and tests.',
    '- Run npm run build (if present), npm test, and the security/lint command.',
    '- Apply concrete edits with tools; do not describe changes without making them.',
  ].join('\n');
}

function buildWinnerReinforcement(context: WinnerReinforcementContext | null): string | null {
  if (!context) return null;
  const files = context.appliedFiles.length ? context.appliedFiles.slice(0, 6).join(', ') : 'no visible files';
  const testsNote = context.testsFailed > 0 ? `${context.testsFailed} tests failed` : 'tests passed/none';
  const securityNote = context.securityFindings > 0
    ? `${context.securityFindings} security findings`
    : 'security clean';
  const buildNote = context.buildSuccess ? 'build succeeded' : 'build failed';

  return `${context.winner} won last iteration (score ${context.aggregateScore.toFixed(3)}), applied ${files}; ${buildNote}, ${testsNote}, ${securityNote}. Reinforce or beat this.`;
}
