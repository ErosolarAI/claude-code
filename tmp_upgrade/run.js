#!/usr/bin/env node

import { runRepoUpgradeFlow } from '../dist/orchestration/repoUpgradeRunner.js';
import { createAgentController } from '../dist/runtime/agentController.js';
import { buildWorkspaceContext } from '../dist/workspace.js';
import { resolveProfileConfig } from '../dist/config.js';
import { join } from 'node:path';
import { cwd } from 'node:process';

async function main() {
  const workingDir = cwd();
  const profile = 'agi-code';
  const workspaceContext = buildWorkspaceContext(workingDir, {});
  
  console.log('Creating agent controller...');
  const controller = await createAgentController({
    profile,
    workingDir,
    workspaceContext,
    env: process.env,
  });
  
  const args = process.argv.slice(2);
  const mode = 'dual-rl-tournament';
  const objective = args.join(' ') || 'maximize software capabilities and full reliability and source code efficiency, and related tasks';
  
  console.log(`Starting repo upgrade with mode: ${mode}`);
  console.log(`Objective: ${objective}`);
  
  const report = await runRepoUpgradeFlow({
    controller,
    workingDir,
    mode,
    continueOnFailure: true,
    validationMode: 'auto',
    additionalScopes: [],
    objective,
    enableVariantWorktrees: true,
    parallelVariants: true,
    repoPolicy: undefined,
    onEvent: (event) => console.log('Event:', event.type, event.data),
    onAgentEvent: (event) => console.log('Agent event:', event.type),
  });
  
  console.log('Upgrade completed');
  console.log('Status:', report.status);
  console.log('Modules:', report.modules.length);
  if (report.variantStats) {
    console.log('Variant stats:', report.variantStats);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});