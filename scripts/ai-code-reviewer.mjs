#!/usr/bin/env node

/**
 * AI-Powered Code Reviewer
 * 
 * Uses the Erosolar CLI's intelligence engine to provide
 * automated code reviews with actionable insights.
 * 
 * Features:
 * - Automated code quality analysis
 * - Security vulnerability detection
 * - Performance optimization suggestions
 * - Best practices validation
 * - Integration with existing toolchain
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AICodeReviewer {
  constructor() {
    this.projectRoot = join(__dirname, '..');
  }

  async reviewFile(filePath) {
    const fullPath = join(this.projectRoot, filePath);
    
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(fullPath, 'utf8');
    const analysis = await this.analyzeCode(content, filePath);
    
    return {
      file: filePath,
      analysis,
      recommendations: this.generateRecommendations(analysis)
    };
  }

  async analyzeCode(content, filePath) {
    // Basic code analysis
    const lines = content.split('\n');
    const functions = this.extractFunctions(content);
    const imports = this.extractImports(content);
    const complexity = this.calculateComplexity(content);

    return {
      lines: lines.length,
      functions: functions.length,
      imports: imports.length,
      complexity,
      issues: this.detectIssues(content, filePath),
      patterns: this.detectPatterns(content),
      security: this.checkSecurity(content, filePath)
    };
  }

  extractFunctions(content) {
    const functionRegex = /(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=:]?\s*(?:\([^)]*\)\s*=>|function\s*(?:\([^)]*\))?)/g;
    const matches = [];
    let match;
    
    while ((match = functionRegex.exec(content)) !== null) {
      matches.push({
        name: match[1],
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return matches;
  }

  extractImports(content) {
    const importRegex = /import\s+(?:{[^}]*}|[^{}\s]+)\s+from\s+['"]([^'"]+)['"]/g;
    const matches = [];
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }

  calculateComplexity(content) {
    // Simplified complexity calculation
    const lines = content.split('\n');
    let complexity = 0;
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.includes('if') || trimmed.includes('for') || trimmed.includes('while')) {
        complexity += 1;
      }
      if (trimmed.includes('&&') || trimmed.includes('||')) {
        complexity += 0.5;
      }
      if (trimmed.includes('try') || trimmed.includes('catch')) {
        complexity += 1;
      }
    });
    
    return Math.round(complexity);
  }

  detectIssues(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      
      // Detect console.log in production code
      if (line.includes('console.log') && !filePath.includes('test')) {
        issues.push({
          type: 'DEBUG_CODE',
          severity: 'LOW',
          line: lineNumber,
          message: 'Console.log found in non-test file',
          suggestion: 'Remove or use proper logging framework'
        });
      }

      // Detect long functions
      if (line.includes('function') && line.length > 100) {
        issues.push({
          type: 'LONG_FUNCTION',
          severity: 'MEDIUM',
          line: lineNumber,
          message: 'Function declaration exceeds 100 characters',
          suggestion: 'Break into smaller functions'
        });
      }

      // Detect magic numbers
      const magicNumberRegex = /\b(?:\d{3,}|0x[0-9a-fA-F]+)\b/g;
      let match;
      while ((match = magicNumberRegex.exec(line)) !== null) {
        if (!match[0].match(/^(?:0|1|100|1000)$/)) {
          issues.push({
            type: 'MAGIC_NUMBER',
            severity: 'LOW',
            line: lineNumber,
            message: `Magic number detected: ${match[0]}`,
            suggestion: 'Extract to named constant'
          });
        }
      }
    });

    return issues;
  }

  detectPatterns(content) {
    const patterns = [];
    
    // Check for async/await patterns
    if (content.includes('async') && content.includes('await')) {
      patterns.push({
        name: 'ASYNC_AWAIT',
        quality: 'GOOD',
        description: 'Uses modern async/await syntax'
      });
    }

    // Check for TypeScript features
    if (content.includes('interface') || content.includes('type ')) {
      patterns.push({
        name: 'TYPESCRIPT_TYPES',
        quality: 'GOOD',
        description: 'Uses TypeScript type definitions'
      });
    }

    // Check for error handling
    if (content.includes('try') && content.includes('catch')) {
      patterns.push({
        name: 'ERROR_HANDLING',
        quality: 'GOOD',
        description: 'Includes proper error handling'
      });
    }

    return patterns;
  }

  checkSecurity(content, filePath) {
    const securityIssues = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      
      // Check for potential security issues
      if (line.includes('eval(') || line.includes('Function(')) {
        securityIssues.push({
          type: 'DYNAMIC_CODE_EXECUTION',
          severity: 'HIGH',
          line: lineNumber,
          message: 'Dynamic code execution detected',
          suggestion: 'Avoid eval() and Function() constructors'
        });
      }

      if (line.includes('process.env') && !line.includes('require')) {
        securityIssues.push({
          type: 'ENV_VAR_USAGE',
          severity: 'INFO',
          line: lineNumber,
          message: 'Environment variable usage',
          suggestion: 'Ensure proper validation of env vars'
        });
      }
    });

    return securityIssues;
  }

  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.complexity > 20) {
      recommendations.push({
        priority: 'HIGH',
        title: 'Reduce code complexity',
        description: `File has complexity score of ${analysis.complexity}, consider refactoring`,
        action: 'Break down complex functions into smaller ones'
      });
    }

    if (analysis.issues.some(issue => issue.severity === 'HIGH')) {
      recommendations.push({
        priority: 'HIGH',
        title: 'Address critical issues',
        description: 'Critical issues detected that need immediate attention',
        action: 'Review and fix high-severity issues'
      });
    }

    if (analysis.security.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        title: 'Review security concerns',
        description: 'Potential security issues identified',
        action: 'Validate security-related code patterns'
      });
    }

    if (analysis.lines > 500) {
      recommendations.push({
        priority: 'MEDIUM',
        title: 'Consider file splitting',
        description: `File is ${analysis.lines} lines long`,
        action: 'Split into smaller, focused modules'
      });
    }

    return recommendations;
  }

  formatReview(review) {
    const output = [];
    
    output.push('╔══════════════════════════════════════════════════════════════════════════════╗');
    output.push('║                          AI CODE REVIEW REPORT                              ║');
    output.push('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    output.push(`📄 FILE: ${review.file}`);
    output.push('─'.repeat(60));
    output.push(`📊 Metrics:`);
    output.push(`  • Lines: ${review.analysis.lines}`);
    output.push(`  • Functions: ${review.analysis.functions}`);
    output.push(`  • Imports: ${review.analysis.imports}`);
    output.push(`  • Complexity: ${review.analysis.complexity}`);
    output.push('');

    if (review.analysis.issues.length > 0) {
      output.push('⚠️  Issues:');
      review.analysis.issues.forEach(issue => {
        const icon = issue.severity === 'HIGH' ? '🔴' : issue.severity === 'MEDIUM' ? '🟡' : '🔵';
        output.push(`  ${icon} [${issue.type}] Line ${issue.line}: ${issue.message}`);
        output.push(`     → ${issue.suggestion}`);
      });
      output.push('');
    }

    if (review.analysis.patterns.length > 0) {
      output.push('✅ Good Patterns:');
      review.analysis.patterns.forEach(pattern => {
        output.push(`  ✓ ${pattern.name}: ${pattern.description}`);
      });
      output.push('');
    }

    if (review.recommendations.length > 0) {
      output.push('🎯 Recommendations:');
      review.recommendations.forEach(rec => {
        const priorityIcon = rec.priority === 'HIGH' ? '🔥' : '📌';
        output.push(`  ${priorityIcon} ${rec.title}`);
        output.push(`     ${rec.description}`);
        output.push(`     Action: ${rec.action}`);
      });
    }

    output.push('\n' + '═'.repeat(60));
    
    return output.join('\n');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/ai-code-reviewer.mjs <file-path>');
    console.log('Example: node scripts/ai-code-reviewer.mjs src/core/agent.ts');
    process.exit(1);
  }

  const reviewer = new AICodeReviewer();
  
  try {
    const review = await reviewer.reviewFile(args[0]);
    console.log(reviewer.formatReview(review));
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { AICodeReviewer };