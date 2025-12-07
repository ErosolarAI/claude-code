import type { AgentController } from '../runtime/agentController.js';
import {
  RepoUpgradeOrchestrator,
  buildRepoWidePlan,
  type RepoUpgradeMode,
  type RepoUpgradeReport,
  type RepoUpgradeStep,
  type UpgradeStepExecutionInput,
  type UpgradeStepResult,
  type ValidationRunResult,
  type UpgradeModuleReport,
} from '../core/repoUpgradeOrchestrator.js';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

export interface RepoUpgradeFlowOptions {
  controller: AgentController;
  workingDir: string;
  mode: RepoUpgradeMode;
  continueOnFailure?: boolean;
  additionalScopes?: string[];
  objective?: string;
  onEvent?: (event: { type: string; data?: Record<string, unknown> }) => void;
  validationMode?: 'auto' | 'ask' | 'skip';
  confirmValidation?: (moduleId: string, commands: string[]) => Promise<boolean>;
}

export async function runRepoUpgradeFlow(options: RepoUpgradeFlowOptions): Promise<RepoUpgradeReport> {
  const plan = buildRepoWidePlan(options.workingDir, options.additionalScopes);
  const orchestrator = new RepoUpgradeOrchestrator((input) => executeUpgradeStep(options.controller, input));

  if (options.onEvent) {
    orchestrator.onEvent((event) => options.onEvent?.(event));
  }

  const report = await orchestrator.run(plan, {
    mode: options.mode,
    continueOnFailure: options.continueOnFailure,
    objective: options.objective,
  });

  const validationMode = options.validationMode ?? 'ask';
  if (validationMode === 'skip') {
    return { ...report, validationsExecuted: false };
  }

  const enrichedModules: typeof report.modules = [];
  const validationArtifacts: ValidationRunResult[] = [];

  for (const module of report.modules) {
    const validations = await runValidationsForModule(
      module,
      options.workingDir,
      validationMode,
      options.confirmValidation
    );
    validationArtifacts.push(...validations);
    enrichedModules.push({ ...module, validations });
  }

  return {
    ...report,
    modules: enrichedModules,
    validationArtifacts,
    validationsExecuted: validationMode === 'auto',
  };
}

/**
 * Build the prompt for a repo upgrade step. Tailored to primary vs refiner variants.
 */
function buildStepPrompt(input: UpgradeStepExecutionInput): string {
  const lines: string[] = [];
  const header = input.variant === 'refiner'
    ? 'Refiner pass: improve or fix the previous result with higher quality and safety.'
    : 'Primary pass: produce the best upgrade steps with minimal blast radius.';

  lines.push(`Repository upgrade (${input.mode}). ${header}`);
  lines.push(`Module: ${input.module.label} (${input.module.scope.join(', ')})`);
  lines.push(`Step: [${input.step.intent}] ${input.step.description}`);

  if (input.step.prompt) {
    lines.push(`Guidance: ${input.step.prompt}`);
  }

  if (input.module.codemodCommands?.length) {
    lines.push(`Suggested codemods: ${input.module.codemodCommands.join(' | ')}`);
  }

  if (input.module.validationCommands?.length) {
    lines.push(`Suggested checks: ${input.module.validationCommands.join(' | ')}`);
  }

  if (input.previousResult?.summary) {
    lines.push(`Previous summary: ${truncate(input.previousResult.summary, 240)}`);
  }

  lines.push('Deliver a concise summary of actions taken and highlight remaining risks. Prefer commands/tests that keep scope local.');
  return lines.join('\n');
}

async function executeUpgradeStep(
  controller: AgentController,
  input: UpgradeStepExecutionInput
): Promise<UpgradeStepResult> {
  const prompt = buildStepPrompt(input);
  const start = Date.now();

  let content = '';
  let success = true;
  let errorText: string | undefined;

  try {
    for await (const event of controller.send(prompt)) {
      if (event.type === 'message.delta') {
        content += event.content;
      } else if (event.type === 'message.complete') {
        content += event.content;
      } else if (event.type === 'error') {
        success = false;
        errorText = typeof event.error === 'string' ? event.error : 'unknown error';
      }
    }
  } catch (error) {
    success = false;
    errorText = error instanceof Error ? error.message : String(error);
  }

  const summary = summarizeResult(content || errorText || '');
  const durationMs = Date.now() - start;
  const detail = content?.trim() || errorText || summary;

  return {
    success,
    summary,
    detail,
    score: success ? scoreOutput(content) : 0,
    durationMs,
    execution: {
      success,
      output: summary,
      duration: durationMs,
      command: `upgrade:${input.module.id}:${input.step.id}:${input.variant}`,
      error: success ? undefined : (errorText || summary),
    },
    notes: buildNotes(input.step, success, summary),
  };
}

function summarizeResult(text: string): string {
  if (!text.trim()) return 'No output';
  const sanitized = text.replace(/\s+/g, ' ').trim();
  return truncate(sanitized, 320);
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
}

function scoreOutput(output: string): number {
  if (!output.trim()) return 0;
  const lower = output.toLowerCase();
  let score = 0.6;
  if (/\bpass(ed)?\b/.test(lower) || /\bverified?\b/.test(lower)) score += 0.2;
  if (/\btest\b/.test(lower) || /\blint\b/.test(lower)) score += 0.1;
  return Math.min(1, score);
}

function buildNotes(step: RepoUpgradeStep, success: boolean, summary: string): string[] {
  const notes: string[] = [];
  if (!success) {
    notes.push('Step failed');
  }
  if (step.intent === 'verify' && !/test|verify|lint/i.test(summary)) {
    notes.push('Verification step did not mention tests/lint');
  }
  return notes;
}

async function runValidationsForModule(
  module: UpgradeModuleReport,
  workingDir: string,
  mode: 'auto' | 'ask',
  confirm?: (moduleId: string, commands: string[]) => Promise<boolean>
): Promise<ValidationRunResult[]> {
  const commands = module.validationCommands || [];
  if (commands.length === 0) {
    return [];
  }

  if (module.status === 'skipped') {
    return commands.map((command) => ({
      command,
      success: false,
      output: '',
      error: 'Skipped (module skipped)',
      durationMs: 0,
      skipped: true,
      reason: 'module-skipped',
    }));
  }

  if (mode === 'ask') {
    const approved = confirm ? await confirm(module.id, commands) : false;
    if (!approved) {
      return commands.map((command) => ({
        command,
        success: false,
        output: '',
        error: 'Skipped (confirmation required)',
        durationMs: 0,
        skipped: true,
        reason: 'confirmation-required',
      }));
    }
  }

  const results: ValidationRunResult[] = [];
  for (const command of commands) {
    const start = Date.now();
    try {
      const { stdout, stderr } = await exec(command, { cwd: workingDir, maxBuffer: 2 * 1024 * 1024 });
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      results.push({
        command,
        success: true,
        output,
        durationMs: Date.now() - start,
      });
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      const output = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
      results.push({
        command,
        success: false,
        output,
        error: err.message ?? 'Validation failed',
        durationMs: Date.now() - start,
      });
    }
  }

  return results;
}
