#!/usr/bin/env node
/**
 * Streaming Status Line Verification
 *
 * Tests specifically that the streaming status line feature works correctly:
 * 1. Status line appears during tool execution
 * 2. Status line updates in-place (no duplicates)
 * 3. Status line clears when processing ends
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(str) {
  return str.replace(ANSI_ESCAPE, '');
}

function countOccurrences(str, substring) {
  return (str.match(new RegExp(substring, 'g')) || []).length;
}

async function verifyStreamingStatus() {
  console.log('🔬 Verifying Streaming Status Line Feature\n');
  console.log('=' .repeat(60) + '\n');

  const verification = {
    checks: [],
    passed: 0,
    failed: 0
  };

  function check(name, condition, evidence) {
    const passed = condition;
    verification.checks.push({ name, passed, evidence });
    if (passed) {
      verification.passed++;
      console.log(`✅ ${name}`);
    } else {
      verification.failed++;
      console.log(`❌ ${name}`);
    }
    if (evidence) {
      console.log(`   Evidence: ${evidence.slice(0, 100)}${evidence.length > 100 ? '...' : ''}`);
    }
    return passed;
  }

  let output = '';
  let rawOutput = ''; // With ANSI codes

  const child = spawn('node', ['dist/bin/agi.js', '--plain'], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => {
    rawOutput += data.toString();
    output += stripAnsi(data.toString());
  });

  child.stderr.on('data', (data) => {
    // Ignore stderr for this test
  });

  // Wait for startup
  await delay(2000);

  // Send a command that will trigger multiple tool calls
  console.log('📝 Sending: "list files in src/ui directory"\n');
  child.stdin.write('list files in src/ui directory\n');

  // Wait for response
  await delay(8000);

  // Capture the output for analysis
  const capturedOutput = output;
  const capturedRaw = rawOutput;

  // Now verify the output
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION CHECKS\n');

  // Check 1: Separator line appears
  const hasSeparator = capturedOutput.includes('───');
  check('Separator line appears', hasSeparator,
    hasSeparator ? 'Found ─── separator' : 'No separator found');

  // Check 2: Status messages appear (Reading, Searching, Executing, etc.)
  const statusPatterns = ['Reading', 'Searching', 'Executing', 'Finding', 'Running'];
  const foundStatuses = statusPatterns.filter(p => capturedOutput.includes(p));
  check('Status messages appear during execution',
    foundStatuses.length > 0,
    `Found: ${foundStatuses.join(', ') || 'none'}`);

  // Check 3: ANSI cursor control codes present (for in-place updates)
  const hasCursorUp = capturedRaw.includes('\x1b[2A') || capturedRaw.includes('\x1b[1A');
  const hasClearLine = capturedRaw.includes('\x1b[2K') || capturedRaw.includes('\x1b[0K');
  check('Uses ANSI codes for in-place updates',
    hasCursorUp || hasClearLine,
    `Cursor up: ${hasCursorUp}, Clear line: ${hasClearLine}`);

  // Check 4: No excessive duplicate status lines
  const separatorCount = countOccurrences(capturedOutput, '────────────────────');
  // Should have welcome separator + maybe a few status separators, but not dozens
  check('No excessive duplicate separators',
    separatorCount < 20,
    `Found ${separatorCount} separator lines`);

  // Check 5: Response content appears
  const hasResponse = capturedOutput.includes('src/ui') ||
                     capturedOutput.includes('display') ||
                     capturedOutput.includes('.ts');
  check('Response content appears',
    hasResponse,
    hasResponse ? 'Found expected file references' : 'No file references found');

  // Check 6: Status clears (no dangling status at end)
  const lines = capturedOutput.split('\n').filter(l => l.trim());
  const lastFewLines = lines.slice(-5).join(' ');
  const endsCleanly = !lastFewLines.includes('Executing...') &&
                      !lastFewLines.includes('Searching...');
  check('Status line clears at end',
    endsCleanly,
    `Last lines: ${lastFewLines.slice(0, 80)}`);

  // Exit
  child.stdin.write('/quit\n');
  await delay(500);
  child.kill('SIGTERM');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📈 RESULT: ${verification.passed}/${verification.checks.length} checks passed\n`);

  if (verification.failed > 0) {
    console.log('❌ Some checks failed. Sample output for debugging:');
    console.log('-'.repeat(40));
    console.log(capturedOutput.slice(0, 2000));
    console.log('-'.repeat(40));
  } else {
    console.log('✅ All verification checks passed!\n');
  }

  return verification.failed === 0;
}

verifyStreamingStatus()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
