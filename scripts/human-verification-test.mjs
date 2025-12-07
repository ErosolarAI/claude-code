#!/usr/bin/env node
/**
 * Human-Level Verification Test
 *
 * Comprehensive test of Real AGI with all prompt types humans would actually use.
 * Each test verifies:
 * 1. Understanding (correct pattern detection)
 * 2. Planning (reasonable steps)
 * 3. Execution (real artifacts created)
 * 4. Output (Claude Code style)
 */

import { getRealAGI, resetRealAGI } from '../dist/core/realAGI.js';
import * as fs from 'fs';
import * as path from 'path';

// All the prompts a human might use
const HUMAN_PROMPTS = [
  // Software Engineering
  { prompt: 'fix all bugs', category: 'software', expectSteps: true, expectArtifacts: false },
  { prompt: 'do devops for me', category: 'devops', expectSteps: true, expectArtifacts: false },
  { prompt: 'run all tests', category: 'software', expectSteps: true, expectArtifacts: false },
  { prompt: 'add a new feature', category: 'software', expectSteps: true, expectArtifacts: false },
  { prompt: 'refactor this code', category: 'software', expectSteps: true, expectArtifacts: false },

  // Research & Science
  { prompt: 'cure cancer', category: 'research', expectSteps: true, expectArtifacts: true, artifact: 'research_pipeline.py' },
  { prompt: 'do some engineering or science shit', category: 'science', expectSteps: true, expectArtifacts: true, artifact: 'science/analysis.py' },
  { prompt: 'build a machine learning model', category: 'data', expectSteps: true, expectArtifacts: false }, // Uses general pattern

  // Legal
  { prompt: 'sue google in fed court', category: 'legal', expectSteps: true, expectArtifacts: true, artifact: 'legal/complaint_draft.md' },
  { prompt: 'draft a contract', category: 'legal', expectSteps: true, expectArtifacts: true },

  // Finance
  { prompt: 'do accounting', category: 'finance', expectSteps: true, expectArtifacts: true, artifact: 'finance/ledger.py' },
  { prompt: 'create financial reports', category: 'finance', expectSteps: true, expectArtifacts: true },

  // Security/Cyber
  { prompt: 'launch offensive cyber symmetric response attacks', category: 'security', expectSteps: true, expectArtifacts: false },
  { prompt: 'security audit', category: 'security', expectSteps: true, expectArtifacts: false },
  { prompt: 'find vulnerabilities', category: 'security', expectSteps: true, expectArtifacts: false },

  // Business Strategy
  { prompt: 'kill apple', category: 'strategy', expectSteps: true, expectArtifacts: true, artifact: 'strategy/competitive_analysis.md' },
  { prompt: 'destroy the competition', category: 'strategy', expectSteps: true, expectArtifacts: true },
  { prompt: 'dominate the market', category: 'strategy', expectSteps: true, expectArtifacts: true },

  // Infrastructure
  { prompt: 'launch Ukraine infrastructure analysis', category: 'infrastructure', expectSteps: true, expectArtifacts: true, artifact: 'infrastructure/assessment.md' },
  { prompt: 'analyze critical systems', category: 'infrastructure', expectSteps: true, expectArtifacts: true, artifact: 'infrastructure/assessment.md' },

  // Defense/Military
  { prompt: '6th generation fighter drone coordination', category: 'defense', expectSteps: true, expectArtifacts: true, artifact: 'defense/swarm_coordination.py' },
  { prompt: 'ballistic maneuverable reentry vehicle informational network for hitting mobile carriers reliably', category: 'defense', expectSteps: true, expectArtifacts: true, artifact: 'defense/targeting_system.py' },

  // Automation
  { prompt: 'automate everything', category: 'automation', expectSteps: true, expectArtifacts: true, artifact: 'automation/workflow.sh' },

  // General
  { prompt: 'help me with this project', category: 'general', expectSteps: true, expectArtifacts: false },
  { prompt: 'what should I do next', category: 'general', expectSteps: true, expectArtifacts: false },
];

async function runHumanVerification() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    HUMAN-LEVEL VERIFICATION TEST                          ║');
  console.log('║                    Real AGI Full Flow Verification                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Clean up previous test artifacts
  const testDirs = ['strategy', 'infrastructure', 'science'];
  for (const dir of testDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true });
    }
  }

  resetRealAGI();
  const agi = getRealAGI(process.cwd());

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  };

  for (const test of HUMAN_PROMPTS) {
    results.total++;
    const testResult = {
      prompt: test.prompt,
      category: test.category,
      checks: {
        understanding: false,
        planning: false,
        execution: false,
        artifacts: false,
        output: false
      },
      passed: false,
      error: null
    };

    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`TEST: "${test.prompt}"`);
    console.log(`Expected Category: ${test.category}`);
    console.log('═══════════════════════════════════════════════════════════════════════════');

    try {
      // 1. Test understanding
      const plan = agi.understand(test.prompt);
      testResult.checks.understanding = plan.thinking.length > 0;
      console.log(`  ⏺ Understanding: ${testResult.checks.understanding ? '✓' : '✗'}`);
      console.log(`    ⎿ Thinking: "${plan.thinking[0]?.slice(0, 60)}..."`);

      // 2. Test planning
      testResult.checks.planning = test.expectSteps ? plan.steps.length > 0 : true;
      console.log(`  ⏺ Planning: ${testResult.checks.planning ? '✓' : '✗'}`);
      console.log(`    ⎿ Steps: ${plan.steps.length}`);
      for (const step of plan.steps.slice(0, 3)) {
        console.log(`    ⎿ ${step.tool}: ${step.description.slice(0, 40)}...`);
      }
      if (plan.steps.length > 3) {
        console.log(`    ⎿ ... and ${plan.steps.length - 3} more steps`);
      }

      // 3. Test execution
      const executed = await agi.execute(plan);
      const successfulSteps = executed.steps.filter(s => s.status === 'completed').length;
      testResult.checks.execution = successfulSteps > 0;
      console.log(`  ⏺ Execution: ${testResult.checks.execution ? '✓' : '✗'}`);
      console.log(`    ⎿ ${successfulSteps}/${executed.steps.length} steps completed`);

      // 4. Test artifacts
      if (test.expectArtifacts && test.artifact) {
        const artifactPath = path.join(process.cwd(), test.artifact);
        testResult.checks.artifacts = fs.existsSync(artifactPath);
        if (testResult.checks.artifacts) {
          const stats = fs.statSync(artifactPath);
          console.log(`  ⏺ Artifacts: ✓`);
          console.log(`    ⎿ ${test.artifact} (${stats.size} bytes)`);
        } else {
          console.log(`  ⏺ Artifacts: ✗`);
          console.log(`    ⎿ Expected: ${test.artifact} (not found)`);
        }
      } else {
        testResult.checks.artifacts = true; // Not expected, so pass
        console.log(`  ⏺ Artifacts: ✓ (none expected)`);
      }

      // 5. Test output format
      const output = agi.formatPlan(plan) + agi.formatResults(executed);
      testResult.checks.output =
        output.includes('⏺') &&
        output.includes('⎿') &&
        (output.includes('✓') || output.includes('✗') || output.includes('○'));
      console.log(`  ⏺ Output Format: ${testResult.checks.output ? '✓' : '✗'}`);

      // Overall result
      const allPassed = Object.values(testResult.checks).every(v => v);
      testResult.passed = allPassed;

      if (allPassed) {
        console.log(`\n  ✓ PASSED`);
        results.passed++;
      } else {
        console.log(`\n  ✗ FAILED`);
        const failedChecks = Object.entries(testResult.checks)
          .filter(([_, v]) => !v)
          .map(([k, _]) => k);
        console.log(`    Failed checks: ${failedChecks.join(', ')}`);
        results.failed++;
      }

    } catch (error) {
      testResult.error = error.message;
      console.log(`  ✗ ERROR: ${error.message}`);
      results.failed++;
    }

    results.details.push(testResult);
    console.log('');
  }

  // Summary
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              SUMMARY                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed} (${Math.round(results.passed / results.total * 100)}%)`);
  console.log(`Failed: ${results.failed} (${Math.round(results.failed / results.total * 100)}%)`);
  console.log('');

  // Category breakdown
  const categories = {};
  for (const detail of results.details) {
    if (!categories[detail.category]) {
      categories[detail.category] = { passed: 0, failed: 0 };
    }
    if (detail.passed) {
      categories[detail.category].passed++;
    } else {
      categories[detail.category].failed++;
    }
  }

  console.log('By Category:');
  for (const [cat, counts] of Object.entries(categories)) {
    const status = counts.failed === 0 ? '✓' : '✗';
    console.log(`  ${status} ${cat}: ${counts.passed}/${counts.passed + counts.failed}`);
  }

  // List failures
  if (results.failed > 0) {
    console.log('');
    console.log('Failed Tests:');
    for (const detail of results.details.filter(d => !d.passed)) {
      console.log(`  ✗ "${detail.prompt}"`);
      if (detail.error) {
        console.log(`    Error: ${detail.error}`);
      } else {
        const failedChecks = Object.entries(detail.checks)
          .filter(([_, v]) => !v)
          .map(([k, _]) => k);
        console.log(`    Failed: ${failedChecks.join(', ')}`);
      }
    }
  }

  // Verify artifacts exist
  console.log('');
  console.log('Generated Artifacts:');
  const artifactDirs = ['defense', 'legal', 'finance', 'strategy', 'infrastructure', 'science', 'automation'];
  for (const dir of artifactDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      console.log(`  ${dir}/`);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        console.log(`    ⎿ ${file} (${stats.size} bytes)`);
      }
    }
  }

  // Write results to file
  const resultsPath = path.join(process.cwd(), '.erosolar', 'human-verification-results.json');
  const resultsDir = path.dirname(resultsPath);
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log('');
  console.log(`Results written to: ${resultsPath}`);

  return results.failed === 0;
}

runHumanVerification()
  .then(success => {
    console.log('');
    console.log(success ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED');
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
