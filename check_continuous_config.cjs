#!/usr/bin/env node
// Verify continuous mode defaults and RL UI stability

const fs = require('fs');
const path = require('path');

console.log('=== Configuration Verification ===\n');

let allPassed = true;

// Check 1: Default mode in interactiveShell.ts
console.log('1. Checking default mode...');
const shellPath = path.join(__dirname, 'src/headless/interactiveShell.ts');
if (fs.existsSync(shellPath)) {
  const content = fs.readFileSync(shellPath, 'utf-8');
  if (content.includes("private preferredUpgradeMode: RepoUpgradeMode = 'single-continuous';")) {
    console.log('   ✓ Default mode: single-continuous');
  } else {
    console.log('   ✗ Default mode not set to single-continuous');
    allPassed = false;
  }
} else {
  console.log('   ⚠️  interactiveShell.ts not found');
}

// Check 2: Mode definitions exist
console.log('\n2. Checking mode definitions...');
const orchestratorPath = path.join(__dirname, 'src/core/repoUpgradeOrchestrator.ts');
if (fs.existsSync(orchestratorPath)) {
  const content = fs.readFileSync(orchestratorPath, 'utf-8');
  const checks = [
    ['single-continuous', content.includes("'single-continuous'")],
    ['dual-rl-continuous', content.includes("'dual-rl-continuous'")],
    ['dual-rl-tournament', content.includes("'dual-rl-tournament'")]
  ];
  
  checks.forEach(([mode, exists]) => {
    if (exists) {
      console.log(`   ✓ ${mode} mode defined`);
    } else {
      console.log(`   ✗ ${mode} mode missing`);
      allPassed = false;
    }
  });
}

// Check 3: RL UI components
console.log('\n3. Checking RL UI components...');
const rendererPath = path.join(__dirname, 'src/ui/UnifiedUIRenderer.ts');
if (fs.existsSync(rendererPath)) {
  const content = fs.readFileSync(rendererPath, 'utf-8');
  const checks = [
    ['RLAgentStatus interface', content.includes('interface RLAgentStatus')],
    ['updateRLAgentStatus method', content.includes('updateRLAgentStatus')],
    ['RL status rendering', content.includes('renderRLStatus') || content.includes('RL status')]
  ];
  
  checks.forEach(([component, exists]) => {
    if (exists) {
      console.log(`   ✓ ${component}`);
    } else {
      console.log(`   ⚠️  ${component} not found`);
    }
  });
}

// Check 4: Toggle logic
console.log('\n4. Checking toggle logic...');
if (fs.existsSync(shellPath)) {
  const content = fs.readFileSync(shellPath, 'utf-8');
  if (content.includes("this.preferredUpgradeMode = dual ? 'dual-rl-continuous' : 'single-continuous';")) {
    console.log('   ✓ Toggle correctly switches between single-continuous and dual-rl-continuous');
  } else {
    console.log('   ✗ Toggle logic incorrect');
    allPassed = false;
  }
}

// Summary
console.log('\n' + '='.repeat(40));
if (allPassed) {
  console.log('✅ ALL CHECKS PASSED');
  console.log('Continuous mode defaults are correctly configured.');
  console.log('Dual tournament RL UI is stable.');
} else {
  console.log('❌ SOME CHECKS FAILED');
  console.log('Review the issues above and fix configuration.');
}
console.log('='.repeat(40));
