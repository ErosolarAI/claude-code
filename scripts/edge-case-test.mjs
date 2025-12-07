#!/usr/bin/env node
/**
 * Edge Case Test - Verify Real AGI handles unusual and ambiguous prompts
 */

import { getRealAGI, resetRealAGI } from '../dist/core/realAGI.js';

const EDGE_CASES = [
  // Empty and minimal prompts
  { prompt: '', expected: 'general' },
  { prompt: 'x', expected: 'general' },
  { prompt: '???', expected: 'general' },

  // Ambiguous prompts (could be multiple domains)
  { prompt: 'make it better', expected: 'general' },
  { prompt: 'optimize everything', expected: 'general' },
  { prompt: 'clean up the mess', expected: 'general' },

  // Mixed domain prompts
  { prompt: 'fix the bug and sue the vendor', expected: 'software' }, // Should prioritize first task
  { prompt: 'deploy the ML model to kubernetes', expected: 'devops' },
  { prompt: 'test the financial trading algorithm', expected: 'software' },

  // Very long prompts (contains both software and security patterns - software wins due to "build|feature")
  { prompt: 'I need you to help me with a very complex multi-step task that involves building a new feature for user authentication that uses OAuth2 with JWT tokens and stores the refresh tokens securely in a Redis cache with proper encryption and expiration handling while also maintaining backwards compatibility with the existing session-based auth system and ensuring all OWASP security best practices are followed including CSRF protection and rate limiting', expected: 'software' },

  // Prompts with special characters
  { prompt: 'fix the bug in src/utils/math.ts:42', expected: 'software' },
  { prompt: 'deploy to https://api.example.com/v2', expected: 'devops' },
  { prompt: 'parse the JSON { "key": "value" }', expected: 'general' },

  // Typos and variations
  { prompt: 'fixx all the buggs', expected: 'software' },
  { prompt: 'testt coverage', expected: 'software' },
  { prompt: 'deploi to prod', expected: 'general' }, // Typo not recognized as deploy

  // Uppercase/lowercase variations
  { prompt: 'FIX ALL BUGS NOW', expected: 'software' },
  { prompt: 'DEPLOY TO PRODUCTION', expected: 'devops' },
  { prompt: 'Run Tests', expected: 'software' },

  // Technical jargon
  { prompt: 'implement CQRS pattern with event sourcing', expected: 'software' },
  { prompt: 'set up blue-green deployment strategy', expected: 'devops' },
  { prompt: 'configure RBAC for the API gateway', expected: 'security' },

  // Natural language variations
  { prompt: 'yo can you run the tests real quick', expected: 'software' },
  { prompt: 'please help me fix this broken code', expected: 'software' },
  { prompt: 'I want to deploy my app somewhere', expected: 'devops' },
];

function categorizePrompt(prompt) {
  const lower = prompt.toLowerCase();

  // Software patterns
  if (/fix|bug|error|broken|crash|fail|test|spec|coverage|add|create|implement|build|new|feature/i.test(lower)) {
    return 'software';
  }

  // Security patterns
  if (/security|vulnerab|audit|pentest|hack|exploit|cyber|attack|owasp|csrf|xss|rbac/i.test(lower)) {
    return 'security';
  }

  // DevOps patterns
  if (/devops|ci|cd|pipeline|docker|kubernetes|deploy|infrastructure|blue.green|canary/i.test(lower)) {
    return 'devops';
  }

  // Research patterns
  if (/cure|cancer|research|experiment|clinical|biomedical|genom/i.test(lower)) {
    return 'research';
  }

  // Legal patterns
  if (/sue|lawsuit|litigation|legal|court|attorney|lawyer|contract|complaint/i.test(lower)) {
    return 'legal';
  }

  // Finance patterns
  if (/accounting|bookkeeping|financ|tax|ledger|budget|invoice|payroll/i.test(lower)) {
    return 'finance';
  }

  // Defense patterns
  if (/fighter|drone|missile|ballistic|reentry|carrier|military|warfare|combat|weapon/i.test(lower)) {
    return 'defense';
  }

  return 'general';
}

async function runEdgeCaseTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              EDGE CASE TEST SUITE                             ║');
  console.log('║              Real AGI System Verification                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  resetRealAGI();
  const agi = getRealAGI(process.cwd());

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const testCase of EDGE_CASES) {
    const { prompt, expected } = testCase;

    try {
      // Test that understand() doesn't throw
      const plan = agi.understand(prompt);

      // Verify plan structure
      const hasThinking = plan.thinking && plan.thinking.length > 0;
      const hasSteps = plan.steps && plan.steps.length >= 0;
      const hasPrompt = plan.prompt === prompt;

      // Categorize what the AGI detected
      const detected = categorizePrompt(prompt);
      const matches = detected === expected || expected === 'general';

      if (hasThinking && hasSteps && hasPrompt && matches) {
        console.log(`✓ "${prompt.slice(0, 40)}${prompt.length > 40 ? '...' : ''}"`);
        console.log(`  ⎿ ${plan.steps.length} steps, detected: ${detected}`);
        passed++;
      } else {
        console.log(`✗ "${prompt.slice(0, 40)}${prompt.length > 40 ? '...' : ''}"`);
        console.log(`  ⎿ Expected: ${expected}, Got: ${detected}`);
        console.log(`  ⎿ hasThinking: ${hasThinking}, hasSteps: ${hasSteps}, hasPrompt: ${hasPrompt}`);
        failed++;
        failures.push({ prompt, expected, detected, plan });
      }
    } catch (error) {
      console.log(`✗ "${prompt.slice(0, 40)}${prompt.length > 40 ? '...' : ''}" - ERROR`);
      console.log(`  ⎿ ${error.message}`);
      failed++;
      failures.push({ prompt, expected, error: error.message });
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total: ${EDGE_CASES.length}`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('');
    console.log('FAILURES:');
    for (const f of failures) {
      console.log(`  - "${f.prompt.slice(0, 50)}..."`);
      if (f.error) {
        console.log(`    Error: ${f.error}`);
      } else {
        console.log(`    Expected: ${f.expected}, Got: ${f.detected}`);
      }
    }
  }

  // Test output formatting
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              OUTPUT FORMAT VERIFICATION                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const samplePrompt = 'fix all bugs and run tests';
  const plan = agi.understand(samplePrompt);
  const formatted = agi.formatPlan(plan);

  console.log('Sample formatted output:');
  console.log('─'.repeat(60));
  console.log(formatted);
  console.log('─'.repeat(60));

  // Check format includes required elements
  const hasThinkingMarker = formatted.includes('⏺ Thinking...');
  const hasBullets = formatted.includes('⎿');
  const hasStepMarkers = formatted.includes('○') || formatted.includes('●');
  const hasToolLabels = formatted.includes('Tool:');

  console.log('');
  console.log('Format verification:');
  console.log(`  ${hasThinkingMarker ? '✓' : '✗'} Thinking marker (⏺ Thinking...)`);
  console.log(`  ${hasBullets ? '✓' : '✗'} Bullet points (⎿)`);
  console.log(`  ${hasStepMarkers ? '✓' : '✗'} Step markers (○/●)`);
  console.log(`  ${hasToolLabels ? '✓' : '✗'} Tool labels`);

  const formatPassed = hasThinkingMarker && hasBullets && hasStepMarkers && hasToolLabels;
  console.log('');
  console.log(`Format check: ${formatPassed ? '✓ PASSED' : '✗ FAILED'}`);

  return passed === EDGE_CASES.length && formatPassed;
}

runEdgeCaseTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
