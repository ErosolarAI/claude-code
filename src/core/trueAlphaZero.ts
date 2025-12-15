/**
 * True AlphaZero Self-Play for Code
 *
 * Implements a genuine AlphaZero-style self-play system where two LLM agents
 * compete by proposing DIFFERENT solutions to the same problem. Each agent
 * works in an isolated git worktree, making real code changes that are then
 * evaluated by build/test/security scans. The winner's approach reinforces
 * the other agent, and iteration continues until neither agent can improve.
 *
 * Key differences from typical RL:
 * 1. Two SEPARATE agents with different strategies (not same agent twice)
 * 2. REAL code modifications in isolated git worktrees
 * 3. Objective evaluation through build/test/security pipelines
 * 4. Winner's code merged, loser's discarded
 * 5. Iterates until convergence (neither agent improves)
 */

import { spawn } from 'node:child_process';
import { exec as execCallback } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { GitWorktreeManager, type WorktreeInfo, type VariantDiff } from './gitWorktreeManager.js';
import { runDualTournament, type TournamentCandidate, type CandidateMetrics } from './dualTournament.js';
import type { LLMProvider, ToolCallRequest } from './types.js';

const exec = promisify(execCallback);

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export type AgentRole = 'alpha' | 'beta';

export interface AlphaZeroAgent {
  id: string;
  role: AgentRole;
  provider: LLMProvider;
  strategy: AgentStrategy;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface AgentStrategy {
  name: string;
  systemPrompt: string;
  temperature: number;
  solutionBias?: 'minimal' | 'comprehensive' | 'refactor' | 'balanced';
  diffPreference?: 'small' | 'large' | 'adaptive';
}

export interface SelfPlayTask {
  id: string;
  goal: string;
  codebaseRoot: string;
  buildCommand?: string;
  testCommand?: string;
  securityScanCommand?: string;
  lintCommand?: string;
  maxIterations: number;
  improvementThreshold: number;
  targetFiles?: string[];
  constraints?: string[];
}

export interface AgentProposal {
  agentId: string;
  role: AgentRole;
  worktreePath: string;
  branch?: string;
  explanation: string;
  filesChanged: string[];
  toolCalls: ToolCallRecord[];
  durationMs: number;
  diff: string;
  insertions: number;
  deletions: number;
}

export interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: string;
  success: boolean;
}

export interface EvaluationResult {
  agentId: string;
  buildSuccess: boolean;
  buildOutput: string;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  testOutput: string;
  securityIssues: number;
  securityOutput: string;
  lintErrors: number;
  lintWarnings: number;
  lintOutput: string;
  score: number;
  metrics: CandidateMetrics;
}

export interface SelfPlayRound {
  iteration: number;
  alpha: AgentProposal;
  beta: AgentProposal;
  alphaEval: EvaluationResult;
  betaEval: EvaluationResult;
  winner: AgentRole | 'draw';
  winnerScore: number;
  loserScore: number;
  improvement: number;
  converged: boolean;
}

export interface SelfPlayResult {
  task: SelfPlayTask;
  rounds: SelfPlayRound[];
  finalWinner: AgentRole | 'draw';
  totalIterations: number;
  converged: boolean;
  convergenceReason: string;
  finalScore: number;
  finalDiff: VariantDiff | null;
  eloChanges: { alpha: number; beta: number };
}

export interface AlphaZeroCallbacks {
  onRoundStart?(iteration: number, maxIterations: number): void;
  onAgentStart?(agent: AlphaZeroAgent, role: AgentRole): void;
  onAgentThinking?(agent: AlphaZeroAgent, content: string): void;
  onAgentToolCall?(agent: AlphaZeroAgent, toolName: string, args: Record<string, unknown>): void;
  onAgentComplete?(agent: AlphaZeroAgent, proposal: AgentProposal): void;
  onEvaluationStart?(role: AgentRole): void;
  onEvaluationComplete?(role: AgentRole, result: EvaluationResult): void;
  onRoundComplete?(round: SelfPlayRound): void;
  onWinnerMerge?(winner: AgentRole, diff: VariantDiff): void;
  onConvergence?(reason: string): void;
  onError?(error: Error, phase: string): void;
}

export interface AlphaZeroConfig {
  eloK: number;
  baseElo: number;
  agentTimeout: number;
  evalTimeout: number;
  saveIntermediateResults: boolean;
  resultsDir?: string;
}

const DEFAULT_CONFIG: AlphaZeroConfig = {
  eloK: 32,
  baseElo: 1200,
  agentTimeout: 300000,
  evalTimeout: 120000,
  saveIntermediateResults: true,
  resultsDir: '.agi/alphazero',
};

// ════════════════════════════════════════════════════════════════════════════
// Default Strategies
// ════════════════════════════════════════════════════════════════════════════

export const ALPHA_STRATEGY: AgentStrategy = {
  name: 'Alpha - Minimal & Precise',
  systemPrompt: `You are Alpha, a code modification agent focused on MINIMAL, PRECISE changes.

Your strategy:
1. Make the SMALLEST possible change that solves the problem
2. Prefer surgical edits over wholesale refactoring
3. Minimize blast radius - fewer files touched is better
4. Maintain existing code style and patterns
5. Add tests only if explicitly required
6. Avoid adding new dependencies

When proposing changes:
- Explain WHY your minimal approach is better
- Highlight risks of larger changes
- Focus on correctness first, optimization second

You are competing against Beta, who prefers comprehensive changes.
Prove that less is more.`,
  temperature: 0.3,
  solutionBias: 'minimal',
  diffPreference: 'small',
};

export const BETA_STRATEGY: AgentStrategy = {
  name: 'Beta - Comprehensive & Robust',
  systemPrompt: `You are Beta, a code modification agent focused on COMPREHENSIVE, ROBUST changes.

Your strategy:
1. Fix the root cause, not just symptoms
2. Add proper error handling and edge case coverage
3. Include tests to prevent regression
4. Refactor adjacent code if it improves maintainability
5. Add documentation where helpful
6. Consider future extensibility

When proposing changes:
- Explain WHY your comprehensive approach is better
- Highlight risks of minimal patches
- Focus on long-term code health

You are competing against Alpha, who prefers minimal changes.
Prove that thoroughness wins.`,
  temperature: 0.5,
  solutionBias: 'comprehensive',
  diffPreference: 'large',
};

// ════════════════════════════════════════════════════════════════════════════
// Main Engine
// ════════════════════════════════════════════════════════════════════════════

export class TrueAlphaZeroEngine {
  private readonly config: AlphaZeroConfig;
  private readonly callbacks: AlphaZeroCallbacks;
  private worktreeManager: GitWorktreeManager | null = null;
  private alphaAgent: AlphaZeroAgent | null = null;
  private betaAgent: AlphaZeroAgent | null = null;
  private aborted = false;

  constructor(
    config: Partial<AlphaZeroConfig> = {},
    callbacks: AlphaZeroCallbacks = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  initializeAgents(
    alphaProvider: LLMProvider,
    betaProvider: LLMProvider,
    alphaStrategy: AgentStrategy = ALPHA_STRATEGY,
    betaStrategy: AgentStrategy = BETA_STRATEGY
  ): void {
    this.alphaAgent = {
      id: `alpha-${Date.now()}`,
      role: 'alpha',
      provider: alphaProvider,
      strategy: alphaStrategy,
      elo: this.config.baseElo,
      wins: 0,
      losses: 0,
      draws: 0,
    };

    this.betaAgent = {
      id: `beta-${Date.now()}`,
      role: 'beta',
      provider: betaProvider,
      strategy: betaStrategy,
      elo: this.config.baseElo,
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }

  async runSelfPlay(task: SelfPlayTask): Promise<SelfPlayResult> {
    if (!this.alphaAgent || !this.betaAgent) {
      throw new Error('Agents not initialized. Call initializeAgents() first.');
    }

    this.worktreeManager = new GitWorktreeManager({
      baseDir: task.codebaseRoot,
      sessionId: `alphazero-${Date.now()}`,
      createBranches: true,
      branchPrefix: 'alphazero',
    });
    await this.worktreeManager.initialize();

    const rounds: SelfPlayRound[] = [];
    let lastBestScore = 0;
    let convergenceStreak = 0;
    const requiredConvergenceStreak = 2;

    try {
      for (let iteration = 1; iteration <= task.maxIterations; iteration++) {
        if (this.aborted) break;

        this.callbacks.onRoundStart?.(iteration, task.maxIterations);

        const alphaWorktree = await this.worktreeManager.createVariantWorkspace('primary');
        const betaWorktree = await this.worktreeManager.createVariantWorkspace('refiner');

        const [alphaProposal, betaProposal] = await Promise.all([
          this.runAgent(this.alphaAgent, task, alphaWorktree, 'alpha'),
          this.runAgent(this.betaAgent, task, betaWorktree, 'beta'),
        ]);

        const [alphaEval, betaEval] = await Promise.all([
          this.evaluateProposal(alphaProposal, task, alphaWorktree.path),
          this.evaluateProposal(betaProposal, task, betaWorktree.path),
        ]);

        const { winner, winnerScore, loserScore } = this.determineWinner(alphaEval, betaEval);
        const improvement = winnerScore - lastBestScore;

        let converged = false;
        if (improvement < task.improvementThreshold) {
          convergenceStreak++;
          if (convergenceStreak >= requiredConvergenceStreak) {
            converged = true;
          }
        } else {
          convergenceStreak = 0;
        }

        const round: SelfPlayRound = {
          iteration,
          alpha: alphaProposal,
          beta: betaProposal,
          alphaEval,
          betaEval,
          winner,
          winnerScore,
          loserScore,
          improvement,
          converged,
        };
        rounds.push(round);

        this.callbacks.onRoundComplete?.(round);
        this.updateElo(winner);

        if (winner !== 'draw') {
          const winnerDiff = await this.worktreeManager.getVariantDiff(
            winner === 'alpha' ? 'primary' : 'refiner'
          );

          if (winnerDiff) {
            this.callbacks.onWinnerMerge?.(winner, winnerDiff);
            await this.worktreeManager.applyWinnerChanges(
              winner === 'alpha' ? 'primary' : 'refiner'
            );
          }

          const loser = winner === 'alpha' ? this.betaAgent : this.alphaAgent;
          const winnerProposal = winner === 'alpha' ? alphaProposal : betaProposal;
          this.reinforceAgent(loser, winnerProposal);

          lastBestScore = winnerScore;
        }

        if (this.config.saveIntermediateResults) {
          this.saveRoundResult(task, round);
        }

        if (converged) {
          this.callbacks.onConvergence?.(`No improvement for ${requiredConvergenceStreak} rounds`);
          break;
        }
      }

      const finalWinner = this.computeFinalWinner(rounds);
      const finalDiff = await this.worktreeManager.getVariantDiff('primary');
      const eloChanges = {
        alpha: this.alphaAgent.elo - this.config.baseElo,
        beta: this.betaAgent.elo - this.config.baseElo,
      };

      const result: SelfPlayResult = {
        task,
        rounds,
        finalWinner,
        totalIterations: rounds.length,
        converged: rounds[rounds.length - 1]?.converged ?? false,
        convergenceReason: rounds[rounds.length - 1]?.converged
          ? `Converged after ${rounds.length} iterations`
          : `Reached maximum iterations (${task.maxIterations})`,
        finalScore: lastBestScore,
        finalDiff,
        eloChanges,
      };

      this.saveFinalResult(task, result);
      return result;
    } finally {
      await this.worktreeManager?.cleanup();
    }
  }

  abort(): void {
    this.aborted = true;
  }

  private async runAgent(
    agent: AlphaZeroAgent,
    task: SelfPlayTask,
    worktree: WorktreeInfo,
    role: AgentRole
  ): Promise<AgentProposal> {
    this.callbacks.onAgentStart?.(agent, role);
    const startTime = Date.now();
    const toolCalls: ToolCallRecord[] = [];

    const prompt = this.buildAgentPrompt(agent, task, worktree.path);
    const messages = [
      { role: 'system' as const, content: agent.strategy.systemPrompt },
      { role: 'user' as const, content: prompt },
    ];

    const tools = this.getCodeModificationTools();
    let explanation = '';
    const maxTurns = 20;

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        if (this.aborted) break;

        const response = await Promise.race([
          agent.provider.chat(messages, { tools, temperature: agent.strategy.temperature }),
          this.timeout(this.config.agentTimeout, 'Agent timeout'),
        ]);

        if ('message' in response && response.message) {
          explanation += response.message + '\n';
          this.callbacks.onAgentThinking?.(agent, response.message);
        }

        if (!response.tool_calls || response.tool_calls.length === 0) {
          break;
        }

        const toolResults: Array<{ id: string; result: string }> = [];
        for (const call of response.tool_calls) {
          this.callbacks.onAgentToolCall?.(agent, call.function.name, call.function.arguments as Record<string, unknown>);

          const result = await this.executeToolCall(call, worktree.path);
          toolCalls.push({
            name: call.function.name,
            arguments: call.function.arguments as Record<string, unknown>,
            result: result.output,
            success: result.success,
          });
          toolResults.push({ id: call.id, result: result.output });
        }

        messages.push({
          role: 'assistant' as const,
          content: response.message ?? '',
          tool_calls: response.tool_calls,
        });

        for (const tr of toolResults) {
          messages.push({
            role: 'tool' as const,
            tool_call_id: tr.id,
            content: tr.result,
          });
        }
      }

      const diff = await this.getWorktreeDiff(worktree.path);

      const proposal: AgentProposal = {
        agentId: agent.id,
        role,
        worktreePath: worktree.path,
        branch: worktree.branch,
        explanation: explanation.trim(),
        filesChanged: diff.filesChanged,
        toolCalls,
        durationMs: Date.now() - startTime,
        diff: diff.diff,
        insertions: diff.insertions,
        deletions: diff.deletions,
      };

      this.callbacks.onAgentComplete?.(agent, proposal);
      return proposal;
    } catch (error) {
      this.callbacks.onError?.(error as Error, `Agent ${role} execution`);
      throw error;
    }
  }

  private async evaluateProposal(
    proposal: AgentProposal,
    task: SelfPlayTask,
    workspacePath: string
  ): Promise<EvaluationResult> {
    this.callbacks.onEvaluationStart?.(proposal.role);

    const result: EvaluationResult = {
      agentId: proposal.agentId,
      buildSuccess: true,
      buildOutput: '',
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      testOutput: '',
      securityIssues: 0,
      securityOutput: '',
      lintErrors: 0,
      lintWarnings: 0,
      lintOutput: '',
      score: 0,
      metrics: {},
    };

    if (task.buildCommand) {
      const buildResult = await this.runCommand(task.buildCommand, workspacePath);
      result.buildSuccess = buildResult.exitCode === 0;
      result.buildOutput = buildResult.output;
    }

    if (task.testCommand && result.buildSuccess) {
      const testResult = await this.runCommand(task.testCommand, workspacePath);
      result.testOutput = testResult.output;
      const testParsed = this.parseTestOutput(testResult.output);
      result.testsRun = testParsed.total;
      result.testsPassed = testParsed.passed;
      result.testsFailed = testParsed.failed;
    }

    if (task.securityScanCommand) {
      const secResult = await this.runCommand(task.securityScanCommand, workspacePath);
      result.securityOutput = secResult.output;
      result.securityIssues = this.parseSecurityOutput(secResult.output);
    }

    if (task.lintCommand) {
      const lintResult = await this.runCommand(task.lintCommand, workspacePath);
      result.lintOutput = lintResult.output;
      const lintParsed = this.parseLintOutput(lintResult.output);
      result.lintErrors = lintParsed.errors;
      result.lintWarnings = lintParsed.warnings;
    }

    result.metrics = this.computeMetrics(proposal, result);
    result.score = this.computeScore(result);

    this.callbacks.onEvaluationComplete?.(proposal.role, result);
    return result;
  }

  private computeMetrics(proposal: AgentProposal, evalResult: EvaluationResult): CandidateMetrics {
    const toolSuccesses = proposal.toolCalls.filter(t => t.success).length;
    const toolFailures = proposal.toolCalls.filter(t => !t.success).length;
    const testsPassed = evalResult.testsRun > 0
      ? evalResult.testsPassed / evalResult.testsRun
      : 1;

    return {
      executionSuccess: evalResult.buildSuccess ? 1 : 0,
      testsPassed,
      testsFailed: evalResult.testsFailed,
      staticAnalysis: evalResult.lintErrors === 0 ? 1 : Math.max(0, 1 - evalResult.lintErrors * 0.1),
      codeQuality: 1 - Math.min(1, evalResult.lintWarnings * 0.02),
      blastRadius: 1 - Math.min(1, proposal.filesChanged.length * 0.05),
      diffSize: proposal.insertions + proposal.deletions,
      complexityDelta: proposal.insertions - proposal.deletions > 50 ? 1 : -1,
      dependenciesAdded: 0,
      toolSuccesses,
      toolFailures,
      warnings: evalResult.lintWarnings,
    };
  }

  private computeScore(result: EvaluationResult): number {
    const m = result.metrics;
    const weights = { build: 0.3, tests: 0.35, security: 0.15, quality: 0.1, blastRadius: 0.1 };
    let score = 0;

    if (result.buildSuccess) score += weights.build;
    score += weights.tests * (m.testsPassed ?? 1);
    score += weights.security * Math.max(0, 1 - result.securityIssues * 0.2);
    score += weights.quality * ((m.staticAnalysis ?? 0.5) * 0.5 + (m.codeQuality ?? 0.5) * 0.5);
    score += weights.blastRadius * (m.blastRadius ?? 0.5);

    return Math.min(1, Math.max(0, score));
  }

  private determineWinner(
    alphaEval: EvaluationResult,
    betaEval: EvaluationResult
  ): { winner: AgentRole | 'draw'; winnerScore: number; loserScore: number } {
    const alphaTournament: TournamentCandidate = { id: 'alpha', policyId: 'alpha', metrics: alphaEval.metrics };
    const betaTournament: TournamentCandidate = { id: 'beta', policyId: 'beta', metrics: betaEval.metrics };

    const tournamentResult = runDualTournament(
      { id: 'self-play', goal: 'Best code change' },
      [alphaTournament, betaTournament]
    );

    const alphaRank = tournamentResult.ranked.find(r => r.candidateId === 'alpha');
    const betaRank = tournamentResult.ranked.find(r => r.candidateId === 'beta');

    if (!alphaRank || !betaRank) {
      return { winner: 'draw', winnerScore: alphaEval.score, loserScore: betaEval.score };
    }

    const scoreDiff = Math.abs(alphaRank.aggregateScore - betaRank.aggregateScore);
    if (scoreDiff < 0.05) {
      return { winner: 'draw', winnerScore: alphaEval.score, loserScore: betaEval.score };
    }

    if (alphaRank.aggregateScore > betaRank.aggregateScore) {
      return { winner: 'alpha', winnerScore: alphaEval.score, loserScore: betaEval.score };
    } else {
      return { winner: 'beta', winnerScore: betaEval.score, loserScore: alphaEval.score };
    }
  }

  private updateElo(winner: AgentRole | 'draw'): void {
    if (!this.alphaAgent || !this.betaAgent) return;

    const K = this.config.eloK;
    const alphaElo = this.alphaAgent.elo;
    const betaElo = this.betaAgent.elo;

    const expectedAlpha = 1 / (1 + Math.pow(10, (betaElo - alphaElo) / 400));
    const expectedBeta = 1 - expectedAlpha;

    let actualAlpha: number, actualBeta: number;
    if (winner === 'alpha') {
      actualAlpha = 1; actualBeta = 0;
      this.alphaAgent.wins++; this.betaAgent.losses++;
    } else if (winner === 'beta') {
      actualAlpha = 0; actualBeta = 1;
      this.betaAgent.wins++; this.alphaAgent.losses++;
    } else {
      actualAlpha = 0.5; actualBeta = 0.5;
      this.alphaAgent.draws++; this.betaAgent.draws++;
    }

    this.alphaAgent.elo = Math.round(alphaElo + K * (actualAlpha - expectedAlpha));
    this.betaAgent.elo = Math.round(betaElo + K * (actualBeta - expectedBeta));
  }

  private reinforceAgent(loser: AlphaZeroAgent, winnerProposal: AgentProposal): void {
    const reinforcement = `
Previous round winner's approach:
${winnerProposal.explanation}

Files changed: ${winnerProposal.filesChanged.join(', ')}
Learn from this approach while maintaining your core strategy.`;

    loser.strategy.systemPrompt += '\n\n' + reinforcement;
  }

  private computeFinalWinner(rounds: SelfPlayRound[]): AgentRole | 'draw' {
    let alphaWins = 0, betaWins = 0;

    for (const round of rounds) {
      if (round.winner === 'alpha') alphaWins++;
      else if (round.winner === 'beta') betaWins++;
    }

    if (alphaWins > betaWins) return 'alpha';
    if (betaWins > alphaWins) return 'beta';
    return 'draw';
  }

  private getCodeModificationTools(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return [
      { name: 'read_file', description: 'Read the contents of a file', parameters: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace' } }, required: ['path'] } },
      { name: 'write_file', description: 'Write content to a file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
      { name: 'edit_file', description: 'Replace a specific string in a file', parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] } },
      { name: 'run_command', description: 'Run a shell command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
      { name: 'list_files', description: 'List files in a directory', parameters: { type: 'object', properties: { path: { type: 'string', default: '.' }, pattern: { type: 'string' } } } },
      { name: 'search_code', description: 'Search for a pattern in the codebase', parameters: { type: 'object', properties: { pattern: { type: 'string' }, file_pattern: { type: 'string' } }, required: ['pattern'] } },
      { name: 'done', description: 'Signal that you have finished', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } },
    ];
  }

  private async executeToolCall(call: ToolCallRequest, workspacePath: string): Promise<{ success: boolean; output: string }> {
    const args = call.function.arguments as Record<string, unknown>;
    const name = call.function.name;

    try {
      switch (name) {
        case 'read_file': {
          const filePath = join(workspacePath, args.path as string);
          if (!existsSync(filePath)) return { success: false, output: `File not found: ${args.path}` };
          return { success: true, output: readFileSync(filePath, 'utf-8') };
        }
        case 'write_file': {
          const filePath = join(workspacePath, args.path as string);
          const dir = join(filePath, '..');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(filePath, args.content as string, 'utf-8');
          return { success: true, output: `Written to ${args.path}` };
        }
        case 'edit_file': {
          const filePath = join(workspacePath, args.path as string);
          if (!existsSync(filePath)) return { success: false, output: `File not found: ${args.path}` };
          const content = readFileSync(filePath, 'utf-8');
          if (!content.includes(args.old_string as string)) return { success: false, output: `String not found` };
          writeFileSync(filePath, content.replace(args.old_string as string, args.new_string as string), 'utf-8');
          return { success: true, output: `Edited ${args.path}` };
        }
        case 'run_command': {
          const result = await this.runCommand(args.command as string, workspacePath);
          return { success: result.exitCode === 0, output: result.output };
        }
        case 'list_files': {
          const result = await this.runCommand(`find "${args.path || '.'}" -type f | head -100`, workspacePath);
          return { success: true, output: result.output };
        }
        case 'search_code': {
          const result = await this.runCommand(`grep -rn "${args.pattern}" . | head -50`, workspacePath);
          return { success: true, output: result.output || 'No matches found' };
        }
        case 'done':
          return { success: true, output: `Completed: ${args.summary}` };
        default:
          return { success: false, output: `Unknown tool: ${name}` };
      }
    } catch (error) {
      return { success: false, output: `Error: ${(error as Error).message}` };
    }
  }

  private buildAgentPrompt(agent: AlphaZeroAgent, task: SelfPlayTask, workspacePath: string): string {
    return `# Task
${task.goal}

# Workspace
You are working in: ${workspacePath}

# Constraints
${task.constraints?.map(c => `- ${c}`).join('\n') || 'None specified'}

# Target Files
${task.targetFiles?.join(', ') || 'Any files in the codebase'}

# Evaluation Criteria
Your changes will be evaluated by:
1. Build success (${task.buildCommand || 'No build command'})
2. Tests (${task.testCommand || 'No test command'})
3. Security scan (${task.securityScanCommand || 'No security scan'})
4. Lint (${task.lintCommand || 'No lint command'})

# Instructions
1. First, explore the codebase to understand the current state
2. Plan your approach based on your strategy (${agent.strategy.name})
3. Make the necessary code changes using the available tools
4. When finished, use the 'done' tool to summarize your changes

Remember: You are competing against another agent. Make your changes count!`;
  }

  private async runCommand(command: string, cwd: string): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: this.config.evalTimeout });
      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });
      child.on('close', (code) => { resolve({ exitCode: code ?? 1, output: output.trim() }); });
      child.on('error', (error) => { resolve({ exitCode: 1, output: error.message }); });
    });
  }

  private async getWorktreeDiff(workspacePath: string): Promise<{ filesChanged: string[]; diff: string; insertions: number; deletions: number }> {
    try {
      const { stdout: files } = await exec('git diff --name-only HEAD', { cwd: workspacePath });
      const { stdout: diff } = await exec('git diff HEAD', { cwd: workspacePath, maxBuffer: 8 * 1024 * 1024 });
      const { stdout: stat } = await exec('git diff --stat HEAD', { cwd: workspacePath });

      const filesChanged = files.trim().split('\n').filter(Boolean);
      const statMatch = stat.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
      return {
        filesChanged,
        diff,
        insertions: statMatch ? parseInt(statMatch[1] ?? '0', 10) : 0,
        deletions: statMatch ? parseInt(statMatch[2] ?? '0', 10) : 0,
      };
    } catch {
      return { filesChanged: [], diff: '', insertions: 0, deletions: 0 };
    }
  }

  private parseTestOutput(output: string): { total: number; passed: number; failed: number } {
    const jestMatch = output.match(/Tests:\s+(\d+)\s+passed.*?(\d+)\s+failed.*?(\d+)\s+total/i);
    if (jestMatch) return { total: parseInt(jestMatch[3], 10), passed: parseInt(jestMatch[1], 10), failed: parseInt(jestMatch[2], 10) };

    const mochaMatch = output.match(/(\d+)\s+passing.*?(\d+)\s+failing/i);
    if (mochaMatch) { const p = parseInt(mochaMatch[1], 10), f = parseInt(mochaMatch[2], 10); return { total: p + f, passed: p, failed: f }; }

    const pytestMatch = output.match(/(\d+)\s+passed.*?(\d+)\s+failed/i);
    if (pytestMatch) { const p = parseInt(pytestMatch[1], 10), f = parseInt(pytestMatch[2], 10); return { total: p + f, passed: p, failed: f }; }

    const hasError = output.toLowerCase().includes('failed') || output.toLowerCase().includes('error');
    return { total: 1, passed: hasError ? 0 : 1, failed: hasError ? 1 : 0 };
  }

  private parseSecurityOutput(output: string): number {
    const npmMatch = output.match(/found\s+(\d+)\s+vulnerabilit/i);
    if (npmMatch) return parseInt(npmMatch[1], 10);
    return 0;
  }

  private parseLintOutput(output: string): { errors: number; warnings: number } {
    const eslintMatch = output.match(/(\d+)\s+errors?.*?(\d+)\s+warnings?/i);
    if (eslintMatch) return { errors: parseInt(eslintMatch[1], 10), warnings: parseInt(eslintMatch[2], 10) };
    return { errors: (output.match(/\berror\b/gi) || []).length, warnings: (output.match(/\bwarning\b/gi) || []).length };
  }

  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => { setTimeout(() => reject(new Error(message)), ms); });
  }

  private saveRoundResult(task: SelfPlayTask, round: SelfPlayRound): void {
    const taskDir = join(this.config.resultsDir || '.agi/alphazero', task.id);
    if (!existsSync(taskDir)) mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, `round-${round.iteration}.json`), JSON.stringify(round, null, 2));
  }

  private saveFinalResult(task: SelfPlayTask, result: SelfPlayResult): void {
    const taskDir = join(this.config.resultsDir || '.agi/alphazero', task.id);
    if (!existsSync(taskDir)) mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, 'final-result.json'), JSON.stringify(result, null, 2));
  }
}

export function createSelfPlayTask(options: {
  goal: string;
  codebaseRoot: string;
  buildCommand?: string;
  testCommand?: string;
  securityScanCommand?: string;
  lintCommand?: string;
  maxIterations?: number;
  improvementThreshold?: number;
  targetFiles?: string[];
  constraints?: string[];
}): SelfPlayTask {
  return {
    id: `task-${Date.now()}`,
    goal: options.goal,
    codebaseRoot: options.codebaseRoot,
    buildCommand: options.buildCommand,
    testCommand: options.testCommand,
    securityScanCommand: options.securityScanCommand,
    lintCommand: options.lintCommand,
    maxIterations: options.maxIterations ?? 5,
    improvementThreshold: options.improvementThreshold ?? 0.02,
    targetFiles: options.targetFiles,
    constraints: options.constraints,
  };
}

export default TrueAlphaZeroEngine;
