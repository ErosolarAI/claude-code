#!/usr/bin/env node

/**
 * Test Conversion Script
 * 
 * Converts Node.js test runner tests to Jest format
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const testDir = './test';

function convertTestFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  
  // Replace Node.js test imports with Jest format
  let converted = content
    .replace(/import \{ test \} from 'node:test';?/g, '')
    .replace(/import assert from 'node:assert';?/g, '')
    .replace(/test\(/g, 'it(')
    .replace(/assert\.strictEqual\(/g, 'expect(')
    .replace(/assert\.ok\(/g, 'expect(')
    .replace(/assert\.deepStrictEqual\(/g, 'expect(')
    .replace(/\).toStrictEqual\(/g, ').toEqual(')
    .replace(/, '([^']+)'\)/g, ').toBe($1)')
    .replace(/, true\)/g, ').toBe(true)')
    .replace(/, false\)/g, ').toBe(false)')
    .replace(/\).toBeDefined\(\)/g, ').toBeDefined()')
    .replace(/\).toBeTruthy\(\)/g, ').toBeTruthy()')
    .replace(/\).toBeFalsy\(\)/g, ').toBeFalsy()');

  // Add Jest imports if needed
  if (!converted.includes('describe(') && converted.includes('it(')) {
    converted = `describe('${filePath}', () => {\n${converted}\n});`;
  }

  return converted;
}

function convertTests() {
  console.log('🔧 Converting tests from Node.js test runner to Jest...\n');
  
  const files = readdirSync(testDir);
  const testFiles = files.filter(file => 
    file.endsWith('.test.ts') && !file.includes('jest-setup') && !file.includes('simple-jest')
  );

  let convertedCount = 0;
  let skippedCount = 0;

  for (const file of testFiles) {
    const filePath = join(testDir, file);
    const originalContent = readFileSync(filePath, 'utf8');
    
    // Check if already using Jest
    if (originalContent.includes('describe(') || originalContent.includes('it(')) {
      console.log(`⏭️  Skipping ${file} (already Jest format)`);
      skippedCount++;
      continue;
    }

    console.log(`🔄 Converting ${file}...`);
    
    try {
      const converted = convertTestFile(filePath);
      
      // Backup original file
      const backupPath = filePath + '.backup';
      writeFileSync(backupPath, originalContent, 'utf8');
      
      // Write converted file
      writeFileSync(filePath, converted, 'utf8');
      
      console.log(`✅ Converted ${file}`);
      convertedCount++;
    } catch (error) {
      console.log(`❌ Failed to convert ${file}:`, error.message);
    }
  }

  console.log(`\n📊 Conversion Summary:`);
  console.log(`✅ Converted: ${convertedCount} files`);
  console.log(`⏭️  Skipped: ${skippedCount} files`);
  console.log(`📁 Total: ${testFiles.length} test files`);
}

// Run conversion
convertTests();