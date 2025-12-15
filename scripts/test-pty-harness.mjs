#!/usr/bin/env node
/**
 * Test script for PTY-based CLI test harness
 */

import { CLITestHarness, createPasteTestScenario, createMultiLineInputScenario } from '../dist/core/cliTestHarness.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🧪 Testing PTY-based CLI Test Harness\n');
console.log('Project root:', projectRoot);

async function main() {
  // Test 1: Basic harness creation
  console.log('\n📋 Test 1: Creating harness...');
  const harness = new CLITestHarness({
    cwd: projectRoot,
    timeout: 30000,
    usePty: false, // Start with stdio mode (no node-pty required)
  });
  console.log('✅ Harness created successfully');

  // Test 2: Test scenario creation
  console.log('\n📋 Test 2: Creating test scenarios...');
  const pasteScenario = createPasteTestScenario('line1\nline2\nline3', 3);
  console.log('Paste scenario:', pasteScenario.id, '-', pasteScenario.description);

  const multiLineScenario = createMultiLineInputScenario();
  console.log('Multi-line scenario:', multiLineScenario.id, '-', multiLineScenario.description);
  console.log('✅ Scenarios created successfully');

  // Test 3: Start/stop CLI (quick test without interaction)
  console.log('\n📋 Test 3: Testing CLI start/stop...');
  try {
    await harness.start();
    console.log('CLI started, waiting 2 seconds...');
    await harness.wait(2000);

    const output = harness.getOutput();
    console.log('Output length:', output.length, 'chars');
    console.log('Output preview:', output.slice(0, 200).replace(/\n/g, '\\n'));

    const exitCode = await harness.stop();
    console.log('Exit code:', exitCode);
    console.log('✅ Start/stop test passed');
  } catch (err) {
    console.log('❌ Start/stop test failed:', err.message);
  }

  // Test 4: Run a simple scenario (startup check)
  console.log('\n📋 Test 4: Running startup check scenario...');
  const startupScenario = {
    id: 'startup-check',
    description: 'Verify CLI starts without critical errors',
    category: 'behavior',
    inputs: [
      { type: 'wait', delay: 2000 },
      { type: 'key', key: 'ctrl-c' },
    ],
    expectations: [
      {
        type: 'output_not_contains',
        value: 'FATAL',
        description: 'Should not show fatal errors',
      },
    ],
  };

  const harness2 = new CLITestHarness({
    cwd: projectRoot,
    timeout: 15000,
    usePty: false,
  });

  try {
    const result = await harness2.runScenario(startupScenario);
    console.log('Scenario result:');
    console.log('  - Passed:', result.passed);
    console.log('  - Duration:', result.duration, 'ms');
    console.log('  - Errors:', result.errors.length > 0 ? result.errors : 'none');
    console.log('  - Output length:', result.output.length);

    if (result.passed) {
      console.log('✅ Startup scenario passed');
    } else {
      console.log('❌ Startup scenario failed');
    }
  } catch (err) {
    console.log('❌ Scenario execution failed:', err.message);
  }

  console.log('\n🏁 PTY Harness tests complete');
}

main().catch(console.error);
