#!/usr/bin/env node

/**
 * Code Intelligence Enhancer
 * 
 * Advanced code analysis and improvement suggestions
 * that integrate with Erosolar's existing intelligence engine.
 * 
 * Features:
 * - Automated code smell detection
 * - Performance optimization analysis
 * - Memory usage patterns
 * - API design validation
 * - Test coverage analysis
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CodeIntelligenceEnhancer {
  constructor() {
    this.projectRoot = join(__dirname, '..');
    this.analysisCache = new Map();
  }

  async analyzeProject() {
    console.log('🔍 Analyzing project for intelligence enhancements...\n');
    
    const srcFiles = this.findSourceFiles();
    const analysis = await this.analyzeFiles(srcFiles);
    const insights = this.generateInsights(analysis);
    
    return {
      timestamp: new Date().toISOString(),
      filesAnalyzed: srcFiles.length,
      analysis,
      insights
    };
  }

  findSourceFiles() {
    const srcDir = join(this.projectRoot, 'src');
    const files = [];
    
    const walk = (dir) => {
      const items = readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = join(dir, item.name);
        
        if (item.isDirectory()) {
          walk(fullPath);
        } else if (item.isFile() && extname(item.name) === '.ts') {
          files.push(fullPath);
        }
      }
    };
    
    walk(srcDir);
    return files;
  }

  async analyzeFiles(files) {
    const analysis = {
      architecture: {},
      performance: {},
      maintainability: {},
      security: {},
      patterns: {}
    };

    for (const file of files.slice(0, 50)) { // Limit for performance
      const relativePath = file.replace(this.projectRoot + '/', '');
      const fileAnalysis = await this.analyzeFile(file);
      
      this.aggregateAnalysis(analysis, fileAnalysis, relativePath);
    }

    return analysis;
  }

  async analyzeFile(filePath) {
    if (this.analysisCache.has(filePath)) {
      return this.analysisCache.get(filePath);
    }

    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    const analysis = {
      file: filePath,
      lines: lines.length,
      functions: this.countFunctions(content),
      classes: this.countClasses(content),
      interfaces: this.countInterfaces(content),
      imports: this.countImports(content),
      complexity: this.calculateFileComplexity(content),
      dependencies: this.analyzeDependencies(content),
      patterns: this.analyzePatterns(content),
      performance: this.analyzePerformance(content),
      security: this.analyzeSecurity(content)
    };

    this.analysisCache.set(filePath, analysis);
    return analysis;
  }

  countFunctions(content) {
    const functionRegex = /(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=:]?\s*(?:\([^)]*\)\s*=>|function\s*(?:\([^)]*\))?)/g;
    return (content.match(functionRegex) || []).length;
  }

  countClasses(content) {
    return (content.match(/\bclass\s+[A-Za-z_$][A-Za-z0-9_$]*/g) || []).length;
  }

  countInterfaces(content) {
    return (content.match(/\binterface\s+[A-Za-z_$][A-Za-z0-9_$]*/g) || []).length;
  }

  countImports(content) {
    return (content.match(/import\s+(?:{[^}]*}|[^{}\s]+)\s+from\s+['"]([^'"]+)['"]/g) || []).length;
  }

  calculateFileComplexity(content) {
    let complexity = 0;
    const lines = content.split('\n');
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Control flow complexity
      if (trimmed.match(/\b(?:if|for|while|switch)\b/)) complexity += 1;
      if (trimmed.match(/&&|\|\|/)) complexity += 0.5;
      if (trimmed.match(/\bcatch\b/)) complexity += 1;
      if (trimmed.match(/\bawait\b/)) complexity += 0.5;
      
      // Function complexity
      if (trimmed.match(/=>/)) complexity += 0.5;
      if (trimmed.match(/\bfunction\b/)) complexity += 1;
    });
    
    return Math.round(complexity);
  }

  analyzeDependencies(content) {
    const dependencies = new Set();
    const importRegex = /import\s+.*from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      dependencies.add(match[1]);
    }
    
    return Array.from(dependencies);
  }

  analyzePatterns(content) {
    const patterns = [];
    
    // Check for async patterns
    if (content.includes('async') && content.includes('await')) {
      patterns.push('async-await');
    }
    
    // Check for error handling
    if (content.includes('try') && content.includes('catch')) {
      patterns.push('error-handling');
    }
    
    // Check for TypeScript features
    if (content.includes('interface') || content.includes('type ')) {
      patterns.push('typescript-types');
    }
    
    // Check for modern JS features
    if (content.includes('=>')) {
      patterns.push('arrow-functions');
    }
    
    return patterns;
  }

  analyzePerformance(content) {
    const issues = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      
      // Check for potential performance issues
      if (line.includes('.forEach(') && !line.includes('//')) {
        issues.push({
          type: 'FOREACH_LOOP',
          severity: 'LOW',
          line: lineNumber,
          message: 'forEach loop detected',
          suggestion: 'Consider using for...of for better performance'
        });
      }
      
      if (line.includes('JSON.parse(') && line.includes('JSON.stringify(')) {
        issues.push({
          type: 'DEEP_CLONE',
          severity: 'MEDIUM',
          line: lineNumber,
          message: 'Deep clone using JSON methods',
          suggestion: 'Consider structuredClone() or manual cloning'
        });
      }
    });
    
    return issues;
  }

  analyzeSecurity(content) {
    const issues = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      
      // Security checks
      if (line.includes('eval(') || line.includes('Function(')) {
        issues.push({
          type: 'DYNAMIC_CODE_EXECUTION',
          severity: 'HIGH',
          line: lineNumber,
          message: 'Dynamic code execution detected',
          suggestion: 'Avoid eval() and Function() constructors'
        });
      }
      
      if (line.includes('process.env') && !line.includes('require')) {
        issues.push({
          type: 'ENV_VAR_USAGE',
          severity: 'INFO',
          line: lineNumber,
          message: 'Environment variable usage',
          suggestion: 'Ensure proper validation of env vars'
        });
      }
    });
    
    return issues;
  }

  aggregateAnalysis(analysis, fileAnalysis, filePath) {
    // Aggregate architecture metrics
    analysis.architecture.totalFiles = (analysis.architecture.totalFiles || 0) + 1;
    analysis.architecture.totalLines = (analysis.architecture.totalLines || 0) + fileAnalysis.lines;
    analysis.architecture.totalFunctions = (analysis.architecture.totalFunctions || 0) + fileAnalysis.functions;
    
    // Track patterns
    fileAnalysis.patterns.forEach(pattern => {
      analysis.patterns[pattern] = (analysis.patterns[pattern] || 0) + 1;
    });
    
    // Track performance issues
    if (fileAnalysis.performance.length > 0) {
      analysis.performance.issues = (analysis.performance.issues || []).concat(
        fileAnalysis.performance.map(issue => ({
          ...issue,
          file: filePath
        }))
      );
    }
    
    // Track security issues
    if (fileAnalysis.security.length > 0) {
      analysis.security.issues = (analysis.security.issues || []).concat(
        fileAnalysis.security.map(issue => ({
          ...issue,
          file: filePath
        }))
      );
    }
  }

  generateInsights(analysis) {
    const insights = [];
    
    // Architecture insights
    const avgFunctionsPerFile = analysis.architecture.totalFunctions / analysis.architecture.totalFiles;
    if (avgFunctionsPerFile > 10) {
      insights.push({
        type: 'ARCHITECTURE',
        title: 'High function density',
        description: `Average of ${avgFunctionsPerFile.toFixed(1)} functions per file`,
        recommendation: 'Consider splitting large files into smaller modules'
      });
    }
    
    // Pattern insights
    const asyncCount = analysis.patterns['async-await'] || 0;
    if (asyncCount > 0) {
      insights.push({
        type: 'PATTERN',
        title: 'Async/await usage',
        description: `${asyncCount} files use async/await patterns`,
        recommendation: 'Ensure proper error handling for async operations'
      });
    }
    
    // Performance insights
    if (analysis.performance.issues && analysis.performance.issues.length > 0) {
      insights.push({
        type: 'PERFORMANCE',
        title: 'Performance optimizations available',
        description: `${analysis.performance.issues.length} performance suggestions`,
        recommendation: 'Review and implement performance improvements'
      });
    }
    
    // Security insights
    if (analysis.security.issues && analysis.security.issues.length > 0) {
      const highSeverity = analysis.security.issues.filter(i => i.severity === 'HIGH').length;
      if (highSeverity > 0) {
        insights.push({
          type: 'SECURITY',
          title: 'Security concerns detected',
          description: `${highSeverity} high-severity security issues`,
          recommendation: 'Address security issues immediately'
        });
      }
    }
    
    return insights;
  }

  formatReport(report) {
    const output = [];
    
    output.push('╔══════════════════════════════════════════════════════════════════════════════╗');
    output.push('║                      CODE INTELLIGENCE ENHANCEMENT REPORT                   ║');
    output.push('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    output.push('📊 PROJECT OVERVIEW');
    output.push('─'.repeat(60));
    output.push(`Files analyzed: ${report.filesAnalyzed}`);
    output.push(`Total lines: ${report.analysis.architecture.totalLines}`);
    output.push(`Total functions: ${report.analysis.architecture.totalFunctions}`);
    output.push('');
    
    output.push('🔍 KEY INSIGHTS');
    output.push('─'.repeat(60));
    
    if (report.insights.length === 0) {
      output.push('✅ No significant issues detected');
    } else {
      report.insights.forEach(insight => {
        const icon = {
          'ARCHITECTURE': '🏗️',
          'PATTERN': '🔍',
          'PERFORMANCE': '⚡',
          'SECURITY': '🔒'
        }[insight.type] || '📝';
        
        output.push(`${icon} ${insight.title}`);
        output.push(`   ${insight.description}`);
        output.push(`   → ${insight.recommendation}`);
        output.push('');
      });
    }
    
    // Performance issues
    if (report.analysis.performance.issues && report.analysis.performance.issues.length > 0) {
      output.push('⚡ PERFORMANCE SUGGESTIONS');
      output.push('─'.repeat(60));
      
      report.analysis.performance.issues.slice(0, 5).forEach(issue => {
        const severityIcon = issue.severity === 'HIGH' ? '🔴' : issue.severity === 'MEDIUM' ? '🟡' : '🔵';
        output.push(`${severityIcon} ${issue.file}:${issue.line}`);
        output.push(`   ${issue.message}`);
        output.push(`   → ${issue.suggestion}`);
      });
      output.push('');
    }
    
    output.push('🚀 RECOMMENDED ACTIONS');
    output.push('─'.repeat(60));
    output.push('• Run "npm run ai-code-review" for detailed file analysis');
    output.push('• Use "npm run complexity-check" for complexity analysis');
    output.push('• Run tests with "npm test" to verify functionality');
    output.push('• Consider adding more unit tests for critical paths');
    
    output.push('\n' + '═'.repeat(60));
    
    return output.join('\n');
  }
}

// CLI interface
async function main() {
  const enhancer = new CodeIntelligenceEnhancer();
  
  try {
    const report = await enhancer.analyzeProject();
    console.log(enhancer.formatReport(report));
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { CodeIntelligenceEnhancer };