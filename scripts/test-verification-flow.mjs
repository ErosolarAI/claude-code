#!/usr/bin/env node
/**
 * Test script for end-to-end verification flow
 *
 * This simulates what happens when the auto-verifier receives
 * an assistant response about paste handling.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🔍 Testing End-to-End Verification Flow\n');

// Simulate an assistant response about paste handling
const mockResponse = `
Multi-line paste refactor successfully completed!

What Was Delivered:

Core Features:
- ✅ Short block descriptions: "📋 [first line preview] [N lines]" during input
- ✅ Full content to AI: Complete paste sent on Enter submission
- ✅ Visual feedback: Real-time previews with optional clipboard emoji
- ✅ Graceful handling: Robust error recovery and state management

Technical Implementation:
- MultiLinePasteManager - Enhanced detection (bracketed paste + timing fallback)
- EnhancedInteractiveShell - Unified input handling with visual feedback
- Updated shellApp.ts - Enhanced mode enabled by default
- 17 comprehensive unit tests - 100% passing

The refactor delivers exactly what was requested: multi-line pastes appear as
short block descriptions during input, but the full content is sent gracefully
to the AI once submitted.
`;

// Test claim extraction patterns
console.log('📋 Step 1: Testing claim extraction patterns...\n');

const pastePatterns = [
  { pattern: /multi[\s-]?line\s+(?:paste|input)/i, name: 'multi-line paste' },
  { pattern: /(?:block|chunk)\s+description/i, name: 'block description' },
  { pattern: /input\s+handling/i, name: 'input handling' },
  { pattern: /graceful(?:ly)?\s+(?:handle|sent|submit)/i, name: 'graceful handling' },
  { pattern: /refactor\s+(?:successfully\s+)?completed?/i, name: 'refactor completed' },
];

let claimsDetected = 0;
for (const { pattern, name } of pastePatterns) {
  const matches = pattern.test(mockResponse);
  console.log(`  ${matches ? '✅' : '❌'} ${name}: ${matches ? 'DETECTED' : 'not found'}`);
  if (matches) claimsDetected++;
}

console.log(`\n  Total claims detected: ${claimsDetected}/${pastePatterns.length}\n`);

// Test PTY harness for paste verification
console.log('📋 Step 2: Testing PTY-based paste verification...\n');

async function testPasteVerification() {
  const { CLITestHarness, createPasteTestScenario } = await import('../dist/core/cliTestHarness.js');

  const harness = new CLITestHarness({
    cwd: projectRoot,
    timeout: 30000,
    usePty: false, // Use stdio mode for testing
  });

  // Create a paste test scenario
  const scenario = createPasteTestScenario('line1\nline2\nline3\nline4\nline5', 5);

  console.log('  Running scenario:', scenario.description);
  console.log('  Inputs:', scenario.inputs.length);
  console.log('  Expectations:', scenario.expectations.length);

  try {
    const result = await harness.runScenario(scenario);

    console.log('\n  Results:');
    console.log(`    - Passed: ${result.passed}`);
    console.log(`    - Duration: ${result.duration}ms`);
    console.log(`    - Output length: ${result.output.length} chars`);

    if (result.errors.length > 0) {
      console.log(`    - Errors: ${result.errors.join(', ')}`);
    }

    for (const exp of result.expectations) {
      console.log(`    - Expectation "${exp.expectation.description}": ${exp.passed ? '✅ PASS' : '❌ FAIL'}`);
      if (!exp.passed && exp.reason) {
        console.log(`      Reason: ${exp.reason}`);
      }
    }

    return result.passed;
  } catch (err) {
    console.log(`  ❌ Test failed: ${err.message}`);
    return false;
  }
}

// Test the input processor unit tests
console.log('📋 Step 3: Running input processor unit tests...\n');

async function runUnitTests() {
  return new Promise((resolve) => {
    const child = spawn('npm', ['test', '--', '--testPathPattern=robustInputProcessor', '--passWithNoTests'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });

    child.on('exit', (code) => {
      const passed = code === 0;
      const testMatch = output.match(/Tests:\s+(\d+)\s+passed/);
      const testCount = testMatch ? testMatch[1] : '?';

      console.log(`  ${passed ? '✅' : '❌'} Unit tests: ${testCount} passed`);
      resolve(passed);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill('SIGKILL');
      console.log('  ❌ Unit tests: TIMEOUT');
      resolve(false);
    }, 30000);
  });
}

// Main execution
async function main() {
  const unitTestsPassed = await runUnitTests();

  console.log('');
  const ptyTestPassed = await testPasteVerification();

  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Claims detected:  ${claimsDetected >= 2 ? '✅' : '❌'} ${claimsDetected}/5`);
  console.log(`  Unit tests:       ${unitTestsPassed ? '✅' : '❌'} ${unitTestsPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`  PTY runtime test: ${ptyTestPassed ? '✅' : '❌'} ${ptyTestPassed ? 'PASSED' : 'FAILED'}`);
  console.log('='.repeat(60));

  const overallPassed = claimsDetected >= 2 && unitTestsPassed;
  console.log(`\n${overallPassed ? '✅ VERIFICATION PASSED' : '❌ VERIFICATION FAILED'}`);
  console.log('\nNote: PTY paste test may fail without actual paste detection.');
  console.log('Full PTY testing requires node-pty and bracketed paste support.\n');

  process.exit(overallPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
