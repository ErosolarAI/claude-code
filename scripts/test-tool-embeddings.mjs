#!/usr/bin/env node
/**
 * Test Tool Embeddings
 *
 * Tests OpenAI embeddings for tool search using dot product similarity.
 */

import { getToolEmbeddings, resetToolEmbeddings } from '../dist/core/toolEmbeddings.js';
import { getRealAGI, resetRealAGI } from '../dist/core/realAGI.js';

const TEST_PROMPTS = [
  'fix all bugs',
  'cure cancer',
  'sue google in fed court',
  'do accounting',
  '6th generation fighter drone coordination',
  'ballistic maneuverable reentry vehicle targeting',
  'build machine learning model',
  'security audit',
  'deploy to kubernetes',
  'automate workflow',
];

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              TOOL EMBEDDINGS SEARCH TEST                      ║');
  console.log('║              OpenAI text-embedding-3-large                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  resetToolEmbeddings();
  const embeddings = getToolEmbeddings(process.cwd());

  console.log('⏺ Building tool embeddings index...');
  await embeddings.buildIndex();
  console.log(`  ⎿ Indexed ${embeddings.getAllTools().length} tools`);
  console.log('');

  for (const prompt of TEST_PROMPTS) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`PROMPT: "${prompt}"`);
    console.log('═══════════════════════════════════════════════════════════════');

    const matches = await embeddings.search(prompt, 5);
    console.log(embeddings.formatSearchResults(matches));
    console.log('');
  }

  // Test with Real AGI integration
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              REAL AGI + EMBEDDINGS INTEGRATION                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  resetRealAGI();
  const agi = getRealAGI(process.cwd());

  for (const prompt of TEST_PROMPTS.slice(0, 3)) {
    console.log(`⏺ Prompt: "${prompt}"`);
    const recommended = await agi.getRecommendedTools(prompt);
    console.log(`  ⎿ Recommended tools: ${recommended.join(', ')}`);
    console.log('');
  }

  console.log('✓ Tool embeddings test complete');
}

main().catch(console.error);
