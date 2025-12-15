#!/usr/bin/env node
/**
 * Shared full-flow runner for AGI CLI.
 *
 * - Enforces REAL mode (RUN_REAL_LLM_TESTS=1 + provider key)
 * - Spawns the built CLI in JSON/headless mode
 * - Streams events, capturing message completions and usage
 * - Provides a validator that rejects simulated/placeholder output
 */

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const distCliPath = join(projectRoot, 'dist', 'bin', 'agi.js');

export const DEFAULT_PROMPTS = [
  'You are the AGI CLI. Give a situational-awareness summary of this workspace, then list three concrete follow-up actions you would take to validate it end-to-end.',
  'Without running destructive commands, lay out the exact build/lint/test/type-check commands you would execute here and the success criteria for each.',
  'Propose a full, human-auditable AI work cycle inside this CLI: how you gather context, plan, run tools, and prove completion with evidence.',
  'Confirm there is no simulation or placeholder behavior: describe how you will verify real provider/tool execution is engaged for this session.',
];

const DEFAULT_TIMEOUT_MS = Number(process.env.FULL_FLOW_TIMEOUT_MS ?? '300000');
const DEFAULT_FORBIDDEN_PATTERNS = [
  /simulation/i,
  /placeholder/i,
  /\bas an ai\b/i,
  /\b(?:cannot|can't|unable to)\s+(?:run|execute|access)/i,
  /\bno (?:real|actual) (?:execution|actions)/i,
  /\bdo not have (?:access|ability)\b.*\b(run|execute)/i,
];

function hasProviderKey(env = process.env) {
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.GOOGLE_GENAI_API_KEY);
}

function requireRealMode(requireReal) {
  if (!requireReal) return;

  if (process.env.RUN_REAL_LLM_TESTS !== '1') {
    throw new Error('RUN_REAL_LLM_TESTS=1 is required for real full-flow runs (no simulation).');
  }
  if (!hasProviderKey()) {
    throw new Error('Missing provider key (ANTHROPIC_API_KEY | OPENAI_API_KEY | GOOGLE_GENAI_API_KEY).');
  }
}

function ensureBuiltCli() {
  if (!fs.existsSync(distCliPath)) {
    throw new Error('dist/bin/agi.js not found. Run `npm run build` before executing full-flow tests.');
  }
}

function safeKill(child) {
  if (!child.killed) {
    child.kill('SIGKILL');
  }
}

function initRunState() {
  return {
    completed: false,
    errors: [],
    messages: [],
    finalResponse: null,
    usageSeen: false,
    eventsSeen: 0,
  };
}

export async function runFullFlow(options = {}) {
  const {
    prompts = DEFAULT_PROMPTS,
    profile = 'agi-code',
    provider,
    model,
    sessionId = `full-flow-${Date.now()}`,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    requireReal = true,
  } = options;

  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error('Prompts must be a non-empty array of strings.');
  }

  ensureBuiltCli();
  requireRealMode(requireReal);

  const args = [
    'dist/bin/agi.js',
    '--json',
    '--profile',
    profile,
    '--session-id',
    sessionId,
  ];
  if (provider) args.push('--provider', provider);
  if (model) args.push('--model', model);

  const runs = new Map();
  const failures = [];
  const stderrLines = [];
  let sessionEvent = null;
  let timedOut = false;
  let exitCode = null;

  const child = spawn('node', args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      EROSOLAR_REAL_EXECUTION: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const rl = readline.createInterface({ input: child.stdout });

  const ensureRun = (runId) => {
    if (!runs.has(runId)) {
      runs.set(runId, initRunState());
    }
    return runs.get(runId);
  };

  const completion = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      timedOut = true;
      failures.push(`Timeout after ${timeoutMs}ms without completing all prompts`);
      safeKill(child);
      resolve();
    }, timeoutMs);

    rl.on('line', (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (!event || !event.type) return;

      if (event.type === 'session') {
        sessionEvent = event;
      }

      if (event.type === 'agent-event') {
        const { runId, event: inner } = event;
        if (!runId) return;
        const state = ensureRun(runId);
        state.eventsSeen += 1;

        if (inner?.type === 'error') {
          state.errors.push(inner.error ?? inner.message ?? 'unknown error');
        }
        if (inner?.type === 'usage') {
          state.usageSeen = true;
        }
        if (inner?.type === 'message.complete' && typeof inner.content === 'string') {
          state.messages.push(inner.content);
          state.finalResponse = inner.content;
        }
      }

      if (event.type === 'run-complete') {
        const state = ensureRun(event.runId);
        state.completed = true;
        const done = Array.from(runs.values()).filter((r) => r.completed).length;
        if (done === prompts.length) {
          clearTimeout(timeout);
          resolve();
        }
      }

      if (event.type === 'error') {
        failures.push(event.message ?? 'unknown error');
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        stderrLines.push(text);
        failures.push(`stderr: ${text}`);
      }
    });

    child.on('exit', (code) => {
      exitCode = code;
      if (!timedOut && code !== 0) {
        failures.push(`CLI exited with code ${code}`);
      }
      clearTimeout(timeout);
      resolve();
    });
  });

  // Feed prompts
  for (const prompt of prompts) {
    child.stdin.write(`${prompt}\n`);
  }
  child.stdin.end();

  await completion;
  rl.close();

  const runSummaries = Array.from(runs.entries()).map(([runId, state]) => ({
    runId,
    ...state,
  }));

  return {
    prompts,
    runs: runSummaries,
    failures,
    stderr: stderrLines,
    timedOut,
    exitCode,
    timeoutMs,
    session: sessionEvent,
  };
}

export function validateFullFlow(result, expectations = {}) {
  const {
    requireUsage = true,
    minMessageChars = 80,
    rejectSimulation = true,
    requireRunCount = true,
    minEvents = 2,
    requireSession = true,
    forbiddenPatterns = DEFAULT_FORBIDDEN_PATTERNS,
  } = expectations;

  const problems = [];
  const normalizedPatterns = normalizePatterns(forbiddenPatterns);
  const forbiddenHits = [];

  if (result.timedOut) {
    problems.push(`Timed out after ${result.timeoutMs}ms`);
  }
  if (result.failures.length) {
    problems.push(...result.failures);
  }
  if (result.exitCode !== null && result.exitCode !== 0) {
    problems.push(`CLI exited with code ${result.exitCode}`);
  }
  if (requireSession && !result.session) {
    problems.push('CLI did not emit session metadata (profile/manifest missing)');
  }
  if (requireRunCount && result.runs.length !== result.prompts.length) {
    problems.push(`Run count mismatch: expected ${result.prompts.length}, saw ${result.runs.length}`);
  }

  for (const run of result.runs) {
    if (!run.completed) {
      problems.push(`Run ${run.runId} did not complete`);
    }
    if (minEvents && run.eventsSeen < minEvents) {
      problems.push(`Run ${run.runId} emitted only ${run.eventsSeen} events (expected >= ${minEvents})`);
    }
    if (run.errors.length) {
      problems.push(`Run ${run.runId} agent errors: ${run.errors.join('; ')}`);
    }
    const final = typeof run.finalResponse === 'string' ? run.finalResponse.trim() : '';
    if (!final) {
      problems.push(`Run ${run.runId} produced no final response`);
    } else {
      if (final.length < minMessageChars) {
        problems.push(`Run ${run.runId} response too short (${final.length} chars)`);
      }
      if (rejectSimulation && /simulat/i.test(final)) {
        problems.push(`Run ${run.runId} response mentions simulation`);
      }
    }
    if (requireUsage && !run.usageSeen) {
      problems.push(`Run ${run.runId} reported no provider usage`);
    }
    if (rejectSimulation && normalizedPatterns.length) {
      const hit = normalizedPatterns.find((pattern) => pattern.test(final));
      if (hit) {
        const patternText = hit.toString();
        forbiddenHits.push({ runId: run.runId, pattern: patternText });
        problems.push(`Run ${run.runId} flagged non-real output (${patternText})`);
      }
    }
  }

  if (problems.length) {
    const error = new Error(`Full-flow validation failed:\n- ${problems.join('\n- ')}`);
    error.result = result;
    if (forbiddenHits.length) {
      error.forbiddenHits = forbiddenHits;
    }
    throw error;
  }

  return {
    completedRuns: result.runs.length,
    runsWithUsage: result.runs.filter((r) => r.usageSeen).length,
    messagesCollected: result.runs.map((r) => r.finalResponse ?? ''),
    session: result.session ?? null,
    forbiddenHits,
  };
}

export function hasLiveProvider() {
  return hasProviderKey();
}

function normalizePatterns(patterns) {
  if (!Array.isArray(patterns)) {
    return DEFAULT_FORBIDDEN_PATTERNS;
  }
  return patterns
    .map((pattern) => {
      if (pattern instanceof RegExp) {
        return pattern;
      }
      if (typeof pattern === 'string' && pattern.trim()) {
        return new RegExp(pattern, 'i');
      }
      return null;
    })
    .filter(Boolean);
}
