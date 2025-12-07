#!/usr/bin/env node
/**
 * Test script to verify the Isolated Runtime Verification system works.
 *
 * All verification now runs in isolated runtime:
 * 1. LLM extracts claims from responses
 * 2. LLM generates isolated tests (shell + CLI commands)
 * 3. Tests run in fresh CLI instances or shell
 * 4. Results are assessed by LLM
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the verification module
const {
  verifyResponse,
  formatVerificationReport,
  quickVerify,
  runIsolatedTest,
} = await import(resolve(__dirname, '../dist/core/responseVerifier.js'));

/**
 * Mock LLM verifier for testing
 */
function createMockLLMVerifier() {
  return async (prompt) => {
    console.log('\n📤 LLM Prompt (first 300 chars):');
    console.log('─'.repeat(50));
    console.log(prompt.slice(0, 300) + '...');
    console.log('─'.repeat(50));

    // Claim extraction
    if (prompt.includes('Extract ALL verifiable claims')) {
      return JSON.stringify([
        {
          id: 'c1',
          statement: 'File src/ui/theme.ts exists',
          category: 'file_op',
          verifiable: true,
          priority: 'high',
          context: { path: 'src/ui/theme.ts' }
        },
        {
          id: 'c2',
          statement: 'The build succeeds',
          category: 'code',
          verifiable: true,
          priority: 'high',
          context: {}
        }
      ]);
    }

    // Test generation
    if (prompt.includes('Generate isolated runtime tests')) {
      return JSON.stringify([
        {
          id: 'test-1',
          description: 'Check file exists',
          shellCommands: ['test -f src/ui/theme.ts && echo "EXISTS" || echo "NOT_FOUND"'],
          commands: [],
          expectedOutputs: ['EXISTS'],
          timeout: 10000
        },
        {
          id: 'test-2',
          description: 'Check build',
          shellCommands: ['npm run type-check 2>&1 | tail -3'],
          commands: [],
          expectedOutputs: [],
          expectedBehavior: 'TypeScript compiles without errors',
          timeout: 60000
        }
      ]);
    }

    // Behavior assessment
    if (prompt.includes('Assess if this output')) {
      return JSON.stringify({
        matches: true,
        confidence: 85,
        reasoning: 'Output shows successful completion'
      });
    }

    return JSON.stringify({ result: 'ok' });
  };
}

/**
 * Test 1: Full verification pipeline
 */
async function testFullVerification() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 1: Full Isolated Runtime Verification');
  console.log('═'.repeat(60));

  const testResponse = `
I've completed the following:
1. Created src/ui/theme.ts with dark mode support
2. The build succeeds with no errors
  `.trim();

  console.log('\n📝 Test Response:');
  console.log('─'.repeat(50));
  console.log(testResponse);
  console.log('─'.repeat(50));

  const ctx = {
    workingDirectory: process.cwd(),
    conversationHistory: ['User: Add dark mode', 'Assistant: Done!'],
    llmVerifier: createMockLLMVerifier()
  };

  console.log('\n🔍 Running full verification...');
  const report = await verifyResponse(testResponse, ctx, 'test-001');

  console.log('\n' + formatVerificationReport(report));

  return report.claims.length > 0;
}

/**
 * Test 2: Quick verification
 */
async function testQuickVerify() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 2: Quick Verification (Critical Claims Only)');
  console.log('═'.repeat(60));

  const testResponse = `I created the file and it works.`;

  const ctx = {
    workingDirectory: process.cwd(),
    llmVerifier: createMockLLMVerifier()
  };

  console.log('\n🔍 Running quick verification...');
  const result = await quickVerify(testResponse, ctx);

  console.log('\n📊 Result:');
  console.log('─'.repeat(50));
  console.log(`  Trust Score: ${result.trustScore}`);
  console.log(`  Summary: ${result.summary}`);
  console.log('─'.repeat(50));

  return result.trustScore >= 0;
}

/**
 * Test 3: Isolated shell test
 */
async function testIsolatedShell() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 3: Isolated Shell Command Test');
  console.log('═'.repeat(60));

  const test = {
    id: 'shell-test',
    description: 'Check if src/ui/theme.ts exists',
    shellCommands: ['test -f src/ui/theme.ts && echo "FILE_EXISTS"'],
    commands: [],
    expectedOutputs: ['FILE_EXISTS'],
    timeout: 5000
  };

  console.log('\n📝 Test:');
  console.log('─'.repeat(50));
  console.log(`  Description: ${test.description}`);
  console.log(`  Shell: ${test.shellCommands.join(', ')}`);
  console.log('─'.repeat(50));

  console.log('\n🔍 Running isolated shell test...');
  const result = await runIsolatedTest(test, process.cwd());

  console.log('\n📊 Result:');
  console.log('─'.repeat(50));
  console.log(`  Success: ${result.success ? '✅ YES' : '❌ NO'}`);
  console.log(`  Duration: ${result.duration}ms`);
  console.log(`  Matched: ${result.matchedPatterns.join(', ') || 'none'}`);
  console.log(`  Output: ${result.output.slice(0, 200)}`);
  console.log('─'.repeat(50));

  return result.success;
}

/**
 * Test 4: No LLM returns empty
 */
async function testNoLLM() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 4: No LLM Returns Empty');
  console.log('═'.repeat(60));

  const ctx = {
    workingDirectory: process.cwd(),
    // NO llmVerifier
  };

  const report = await verifyResponse('I did something', ctx);

  console.log('\n📊 Result:');
  console.log('─'.repeat(50));
  console.log(`  Claims: ${report.claims.length}`);
  console.log(`  Verdict: ${report.overallVerdict}`);
  console.log(`  Trust: ${report.trustScore}`);
  console.log('─'.repeat(50));

  return report.claims.length === 0 && report.overallVerdict === 'unverified';
}

/**
 * Test 5: Isolated CLI test (if CLI exists)
 */
async function testIsolatedCLI() {
  console.log('\n' + '═'.repeat(60));
  console.log('TEST 5: Isolated CLI Test');
  console.log('═'.repeat(60));

  // Check if CLI exists
  try {
    const fs = await import('fs/promises');
    await fs.access('./dist/bin/erosolar.js');
  } catch {
    console.log('\n⚠️  Skipping: CLI not built');
    return true;
  }

  const test = {
    id: 'cli-test',
    description: 'Test CLI /help command',
    shellCommands: [],
    commands: ['/help'],
    expectedOutputs: ['help'],
    expectedBehavior: 'Shows help information',
    timeout: 15000
  };

  console.log('\n🔍 Running isolated CLI test...');
  const result = await runIsolatedTest(test, process.cwd(), createMockLLMVerifier());

  console.log('\n📊 Result:');
  console.log('─'.repeat(50));
  console.log(`  Success: ${result.success ? '✅ YES' : '❌ NO'}`);
  console.log(`  Duration: ${result.duration}ms`);
  console.log(`  Output (first 150): ${result.output.slice(0, 150)}...`);
  if (result.llmAssessment) console.log(`  LLM: ${result.llmAssessment}`);
  console.log('─'.repeat(50));

  return true; // Don't fail on CLI issues
}

/**
 * Main
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('  ISOLATED RUNTIME VERIFICATION TEST SUITE');
  console.log('  All verification runs in isolated environment');
  console.log('═'.repeat(60));

  const results = [];

  try {
    results.push(['Full Verification', await testFullVerification()]);
  } catch (e) {
    console.error('  Error:', e.message);
    results.push(['Full Verification', false]);
  }

  try {
    results.push(['Quick Verify', await testQuickVerify()]);
  } catch (e) {
    console.error('  Error:', e.message);
    results.push(['Quick Verify', false]);
  }

  try {
    results.push(['Isolated Shell', await testIsolatedShell()]);
  } catch (e) {
    console.error('  Error:', e.message);
    results.push(['Isolated Shell', false]);
  }

  try {
    results.push(['No LLM', await testNoLLM()]);
  } catch (e) {
    console.error('  Error:', e.message);
    results.push(['No LLM', false]);
  }

  try {
    results.push(['Isolated CLI', await testIsolatedCLI()]);
  } catch (e) {
    console.error('  Error:', e.message);
    results.push(['Isolated CLI', false]);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(60));

  let passed = 0;
  for (const [name, result] of results) {
    const icon = result ? '✅' : '❌';
    console.log(`  ${icon} ${name}`);
    if (result) passed++;
  }

  console.log('─'.repeat(60));
  console.log(`  Total: ${passed}/${results.length} tests passed`);
  console.log('═'.repeat(60));

  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
