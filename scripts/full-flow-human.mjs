#!/usr/bin/env node
/**
 * Full-flow CLI harness for real prompts.
 *
 * Spawns the built erosolar CLI in JSON/headless mode, feeds multiple
 * human-style prompts, and verifies that each run completes without
 * simulation or placeholder behavior. Designed to be run with real
 * provider API keys (Anthropic/OpenAI/Gemini) to exercise the full
 * pipeline end-to-end.
 *
 * Usage:
 *   node scripts/full-flow-human.mjs
 *   PROMPTS='["build a quick summary","write a short test"]' node scripts/full-flow-human.mjs
 *   PROFILE=agi-code MODEL=claude-3-5-sonnet-20240620 node scripts/full-flow-human.mjs
 *
 * Notes:
 * - Requires `npm run build` so dist/bin/erosolar.js exists.
 * - Exits non-zero if any run errors or never reaches run-complete.
 * - RUN_REAL_LLM_TESTS=1 is required; this harness is for real providers only.
 */

import { DEFAULT_PROMPTS, runFullFlow, validateFullFlow } from './full-flow-runner.js';

const profile = process.env.PROFILE?.trim() || 'agi-code';
const provider = process.env.PROVIDER?.trim();
const model = process.env.MODEL?.trim();
const sessionId = `real-flow-${Date.now()}`;

const prompts = (() => {
  if (process.env.PROMPTS) {
    try {
      const parsed = JSON.parse(process.env.PROMPTS);
      if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) {
        return parsed.map((p) => p.trim()).filter(Boolean);
      }
    } catch (error) {
      console.warn(`Failed to parse PROMPTS env var: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return DEFAULT_PROMPTS;
})();

if (!prompts.length) {
  console.error('No prompts found. Provide PROMPTS env var with a JSON array of prompts.');
  process.exit(1);
}

async function main() {
  console.log(
    `▶️  Starting full-flow harness (profile=${profile}${provider ? `, provider=${provider}` : ''}${model ? `, model=${model}` : ''})`
  );

  try {
    const result = await runFullFlow({
      prompts,
      profile,
      provider,
      model,
      sessionId,
      requireReal: true,
    });

    const summary = validateFullFlow(result, {
      minMessageChars: 120,
      requireUsage: true,
      rejectSimulation: true,
      minEvents: 2,
      requireRunCount: true,
    });

    console.log('\n=== Full Flow Summary ===');
    console.log(`Prompts sent:     ${prompts.length}`);
    console.log(`Runs completed:   ${summary.completedRuns}`);
    console.log(`Runs with usage:  ${summary.runsWithUsage}`);
    if (summary.session) {
      console.log(`Session profile:  ${summary.session.profile} (v${summary.session.version})`);
      console.log(`Working dir:      ${summary.session.workingDir}`);
    }
    for (const run of result.runs) {
      console.log(
        `- ${run.runId}: events=${run.eventsSeen}, completed=${run.completed}, usage=${run.usageSeen}, finalChars=${(run.finalResponse ?? '').length}`
      );
    }

    console.log('✅ All prompts completed with real pipeline events and validated output.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Full-flow validation failed.');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
