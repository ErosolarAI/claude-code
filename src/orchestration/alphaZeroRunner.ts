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
  | { type: 'winner.applied'; iteration: number; winner: 'primary' | 'refiner'; filesApplied: string[] }
  | { type: 'iteration.complete'; iteration: number; winner: 'primary' | 'refiner' | 'tie'; score: number };

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
  enableVariantWorktrees?: boolean;
  onEvent?: (event: AlphaZeroEvent) => void;
  onAgentEvent?: (variant: 'primary' | 'refiner', event: AgentEventUnion) => void;
}

const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_BUILD_COMMAND = 'npm run build --if-present';
const DEFAULT_TEST_COMMAND = 'npm test -- --runInBand --passWithNoTests';
const CONVERGENCE_PATIENCE = 2;

export async function runTrueAlphaZeroFlow(options: TrueAlphaZeroFlowOptions): Promise<AlphaZeroFlowResult> {
  const iterations: AlphaZeroIterationResult[] = [];
  let bestScore = 0;
  let noImprovementCount = 0;
  const filesModified = new Set<string>();

  for (let iteration = 1; iteration <= (options.maxIterations ?? DEFAULT_MAX_ITERATIONS); iteration++) {
    options.onEvent?.({ type: 'iteration.start', iteration });

    const { primaryWorkspace, refinerWorkspace, worktreeManager } = await prepareWorkspaces(
      options.workingDir,
      options.enableVariantWorktrees !== false
    );

    try {
      const primaryController = await createControllerForWorkspace(options.profile, primaryWorkspace);
      const refinerController = await createControllerForWorkspace(options.profile, refinerWorkspace);

      const primaryResult = await runAgentOnce(
        primaryController,
        buildPrimaryPrompt(options.objective, iteration),
        iteration,
        'primary',
        options.onAgentEvent,
        options.onEvent
      );
      const refinerResult = await runAgentOnce(
        refinerController,
        buildRefinerPrompt(options.objective, iteration, primaryResult.filesChanged),
        iteration,
        'refiner',
        options.onAgentEvent,
        options.onEvent
      );

      // Evaluate both variants (build + tests)
      const primaryEval = await evaluateWorkspace(
        primaryWorkspace,
        options.buildCommand ?? DEFAULT_BUILD_COMMAND,
        options.testCommand ?? DEFAULT_TEST_COMMAND
      );
      const refinerEval = await evaluateWorkspace(
        refinerWorkspace,
        options.buildCommand ?? DEFAULT_BUILD_COMMAND,
        options.testCommand ?? DEFAULT_TEST_COMMAND
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
        },
        refiner: {
          ...refinerResult,
          buildSuccess: refinerEval.buildSuccess,
          testsPassed: refinerEval.testsPassed,
          testsFailed: refinerEval.testsFailed,
        },
        tournament,
        winner,
        appliedFiles,
        improvement,
      };

      iterations.push(iterationResult);
      options.onEvent?.({ type: 'iteration.complete', iteration, winner, score: tournament.ranked[0]?.aggregateScore ?? 0 });

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
    bestScore,
    convergenceReached: noImprovementCount >= CONVERGENCE_PATIENCE,
    filesModified: Array.from(filesModified),
  };
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
): Promise<Omit<AgentRunResult, 'buildSuccess' | 'testsPassed' | 'testsFailed'>> {
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

async function evaluateWorkspace(workspace: string, buildCommand: string, testCommand: string) {
  const runCommand = async (command: string) => {
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
  };
}

function buildCandidate(
  variant: 'primary' | 'refiner',
  evaluation: Awaited<ReturnType<typeof evaluateWorkspace>>,
  files: string[]
) {
  const totalTests = evaluation.testsPassed + evaluation.testsFailed;
  return {
    id: variant,
    policyId: variant,
    patchSummary: `${files.length} files changed`,
    metrics: {
      executionSuccess: evaluation.buildSuccess ? 1 : 0,
      testsPassed: totalTests > 0 ? evaluation.testsPassed / totalTests : 0,
      testsFailed: evaluation.testsFailed,
      staticAnalysis: evaluation.buildSuccess ? 0.8 : 0.4,
      codeQuality: evaluation.buildSuccess ? 0.8 : 0.5,
      blastRadius: Math.max(0, 1 - files.length / 50),
      diffSize: files.length,
    },
    signals: {
      rewardModelScore: evaluation.buildSuccess ? 0.8 : 0.3,
      selfAssessment: files.length > 0 ? 0.7 : 0.4,
    },
    evaluatorScores: [
      { evaluatorId: 'build', score: evaluation.buildSuccess ? 1 : 0, weight: 1.5 },
      { evaluatorId: 'tests', score: totalTests > 0 ? evaluation.testsPassed / totalTests : 0.5, weight: 1.2 },
    ],
  };
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

function buildPrimaryPrompt(objective: string, iteration: number): string {
  return [
    `You are the PRIMARY agent (iteration ${iteration}).`,
    `Objective: ${objective}`,
    '',
    'Operate in the provided workspace. Use the available tools to:',
    '- Inspect the codebase (read files, list directories).',
    '- Apply concrete edits using the edit tools (no pseudo code).',
    '- Run quick checks: npm run build (if present) and npm test.',
    '- Keep blast radius small and changes coherent.',
    '',
    'Focus on clarity and safety while still making meaningful progress.',
  ].join('\n');
}

function buildRefinerPrompt(objective: string, iteration: number, primaryFiles: string[]): string {
  return [
    `You are the REFINER agent (iteration ${iteration}).`,
    `Objective: ${objective}`,
    '',
    primaryFiles.length ? `Primary touched: ${primaryFiles.slice(0, 8).join(', ')}` : 'Primary made no visible changes.',
    '',
    'Your job:',
    '- Improve on the primary agent with higher quality and tighter scope.',
    '- Prefer correctness, maintainability, and tests.',
    '- Run npm run build (if present) and npm test to validate.',
    '- Apply concrete edits with tools; do not describe changes without making them.',
  ].join('\n');
}
