#!/usr/bin/env node
/**
 * CLAUDE CODE STYLE FULL DEMONSTRATION
 *
 * Shows the complete AI flow for each major prompt type exactly as Claude Code works:
 * - Thinking with ⏺
 * - Bullet points with ⎿
 * - Tool calls with results
 * - Success/failure markers ✓/✗
 *
 * NO SIMULATIONS - Real execution only
 */

import { getRealAGI, resetRealAGI } from '../dist/core/realAGI.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Representative prompts for full demo
const DEMO_PROMPTS = [
  'fix all bugs',
  'cure cancer',
  'sue google in fed court',
  'do accounting',
  'kill apple',
  'launch offensive cyber symmetric response attacks',
  '6th generation fighter drone coordination',
  'ballistic maneuverable reentry vehicle informational network for hitting mobile carriers reliably',
  'do devops for me',
  'do some other engineering or science shit',
];

async function runDemo() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    CLAUDE CODE STYLE FULL DEMONSTRATION                       ║');
  console.log('║                    Real AGI • No Simulations • Full Flow                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  resetRealAGI();
  const agi = getRealAGI(process.cwd());

  for (const prompt of DEMO_PROMPTS) {
    console.log('═'.repeat(80));
    console.log(`USER: ${prompt}`);
    console.log('═'.repeat(80));
    console.log('');

    // Get the full output
    const output = await agi.process(prompt, false);
    console.log(output);
    console.log('');
  }

  // Show generated artifacts
  console.log('═'.repeat(80));
  console.log('GENERATED ARTIFACTS');
  console.log('═'.repeat(80));
  console.log('');

  const dirs = ['defense', 'legal', 'finance', 'strategy', 'infrastructure', 'science', 'automation'];
  for (const dir of dirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter(f => !f.startsWith('.') && !f.includes('__pycache__'));
      if (files.length > 0) {
        console.log(`⏺ ${dir}/`);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);
          console.log(`  ⎿ ${file} (${stats.size} bytes)`);
        }
        console.log('');
      }
    }
  }

  // Final summary
  console.log('═'.repeat(80));
  console.log('✓ DEMONSTRATION COMPLETE');
  console.log('═'.repeat(80));
}

runDemo().catch(console.error);
