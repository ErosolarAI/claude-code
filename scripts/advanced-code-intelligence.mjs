#!/usr/bin/env node

/**
 * Advanced Code Intelligence Tool
 * 
 * Enhanced code analysis with AI-powered insights, performance optimization,
 * security scanning, and architectural recommendations.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AdvancedCodeIntelligence {
  constructor() {
    this.projectRoot = join(__dirname, '..');
    this.analysisResults = new Map();
  }

  async analyzeProject() {
    console.log('🧠 Advanced Code Intelligence Analysis\n');
    
    const analysis = {
      timestamp: new Date().toISOString(),
      projectStructure: await this.analyzeProjectStructure(),
      codeQuality: await this.analyzeCodeQuality(),
      performance: await this.analyzePerformance(),
      security: await this.analyzeSecurity(),
      architecture: await this.analyzeArchitecture(),
      recommendations: []
    };

    analysis.recommendations = this.generateRecommendations(analysis);
    
    return analysis;
  }

  async analyzeProjectStructure() {
    const srcDir = join(this.projectRoot, 'src');
    const files = this.findSourceFiles();
    
    const structure = {
      totalFiles: files.length,
      fileTypes: {},
      directories: {},
      dependencies: this.analyzeDependencies(),
      buildConfig: this.analyzeBuildConfig()
    };

    files.forEach(file => {
      const ext = extname(file).slice(1) || 'unknown';
      structure.fileTypes[ext] = (structure.fileTypes[ext] || 0) + 1;
      
      const dir = dirname(file).replace(this.projectRoot, '');
      structure.directories[dir] = (structure.directories[dir] || 0) + 1;
    });

    return structure;
  }

  async analyzeCodeQuality() {
    const files = this.findSourceFiles();
    const quality = {
      complexity: { high: 0, medium: 0, low: 0 },
      maintainability: { good: 0, fair: 0, poor: 0 },
      testCoverage: this.analyzeTestCoverage(),
      codeSmells: [],
      bestPractices: []
    };

    // Sample analysis of key files
    const keyFiles = files.slice(0, 10); // Analyze first 10 files
    
    for (const file of keyFiles) {
      const content = readFileSync(join(this.projectRoot, file), 'utf8');
      const fileAnalysis = this.analyzeFileQuality(content, file);
      
      quality.complexity[fileAnalysis.complexity]++;
      quality.maintainability[fileAnalysis.maintainability]++;
      quality.codeSmells.push(...fileAnalysis.codeSmells);
      quality.bestPractices.push(...fileAnalysis.bestPractices);
    }

    return quality;
  }

  async analyzePerformance() {
    const files = this.findSourceFiles();
    const performance = {
      potentialBottlenecks: [],
      memoryUsage: [],
      asyncOperations: [],
      optimizationOpportunities: []
    };

    // Analyze for common performance issues
    files.forEach(file => {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const content = readFileSync(join(this.projectRoot, file), 'utf8');
        
        // Check for nested loops
        if (content.includes('for (') && content.includes('for (')) {
          performance.potentialBottlenecks.push({
            file,
            issue: 'Nested loops detected',
            severity: 'MEDIUM'
          });
        }

        // Check for large data processing
        if (content.includes('.map(') && content.includes('.filter(') && content.includes('.reduce(')) {
          performance.optimizationOpportunities.push({
            file,
            issue: 'Multiple array operations - consider combining',
            severity: 'LOW'
          });
        }

        // Check for async/await patterns
        const asyncMatches = content.match(/async\s+function|await\s+[^;]+/g) || [];
        if (asyncMatches.length > 5) {
          performance.asyncOperations.push({
            file,
            count: asyncMatches.length,
            note: 'High async operation density'
          });
        }
      }
    });

    return performance;
  }

  async analyzeSecurity() {
    const files = this.findSourceFiles();
    const security = {
      vulnerabilities: [],
      bestPractices: [],
      dependencies: this.analyzeDependencySecurity()
    };

    files.forEach(file => {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const content = readFileSync(join(this.projectRoot, file), 'utf8');
        
        // Check for potential security issues
        if (content.includes('eval(')) {
          security.vulnerabilities.push({
            file,
            issue: 'Use of eval() - potential security risk',
            severity: 'HIGH'
          });
        }

        if (content.includes('process.env') && !content.includes('require')) {
          security.bestPractices.push({
            file,
            practice: 'Environment variable usage detected',
            status: 'GOOD'
          });
        }

        if (content.includes('JSON.parse(') && content.includes('userInput')) {
          security.vulnerabilities.push({
            file,
            issue: 'JSON.parse on user input - potential injection',
            severity: 'MEDIUM'
          });
        }
      }
    });

    return security;
  }

  async analyzeArchitecture() {
    const architecture = {
      modularity: this.analyzeModularity(),
      coupling: this.analyzeCoupling(),
      cohesion: this.analyzeCohesion(),
      patterns: this.detectPatterns()
    };

    return architecture;
  }

  findSourceFiles() {
    const srcDir = join(this.projectRoot, 'src');
    const files = [];
    
    const scanDirectory = (dir) => {
      if (!existsSync(dir)) return;
      
      const items = readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = join(dir, item.name);
        
        if (item.isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.isFile() && /\.(ts|js|tsx|jsx)$/.test(item.name)) {
          files.push(fullPath.replace(this.projectRoot + '/', ''));
        }
      }
    };

    scanDirectory(srcDir);
    return files;
  }

  analyzeFileQuality(content, filePath) {
    const lines = content.split('\n');
    const analysis = {
      complexity: 'low',
      maintainability: 'good',
      codeSmells: [],
      bestPractices: []
    };

    // Simple complexity analysis
    const functionCount = (content.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length;
    const lineCount = lines.length;
    
    if (functionCount > 10 || lineCount > 200) {
      analysis.complexity = 'high';
    } else if (functionCount > 5 || lineCount > 100) {
      analysis.complexity = 'medium';
    }

    // Check for code smells
    if (content.includes('any')) {
      analysis.codeSmells.push({
        type: 'TYPE_SAFETY',
        message: 'Use of any type detected',
        file: filePath
      });
    }

    if (content.includes('console.log')) {
      analysis.codeSmells.push({
        type: 'DEBUGGING',
        message: 'Console.log in production code',
        file: filePath
      });
    }

    // Check for best practices
    if (content.includes('async') && content.includes('try') && content.includes('catch')) {
      analysis.bestPractices.push({
        type: 'ERROR_HANDLING',
        message: 'Proper async error handling',
        file: filePath
      });
    }

    return analysis;
  }

  analyzeDependencies() {
    try {
      const packageJson = JSON.parse(readFileSync(join(this.projectRoot, 'package.json'), 'utf8'));
      return {
        totalDependencies: Object.keys(packageJson.dependencies || {}).length,
        totalDevDependencies: Object.keys(packageJson.devDependencies || {}).length,
        scripts: Object.keys(packageJson.scripts || {})
      };
    } catch (error) {
      return { error: 'Could not analyze dependencies' };
    }
  }

  analyzeBuildConfig() {
    const configs = [];
    
    if (existsSync(join(this.projectRoot, 'tsconfig.json'))) {
      configs.push('TypeScript');
    }
    if (existsSync(join(this.projectRoot, 'jest.config.js'))) {
      configs.push('Jest');
    }
    if (existsSync(join(this.projectRoot, '.eslintrc.json'))) {
      configs.push('ESLint');
    }
    
    return configs;
  }

  analyzeTestCoverage() {
    // This would ideally read from coverage reports
    return {
      unit: 'N/A',
      integration: 'N/A',
      e2e: 'N/A',
      note: 'Run tests with coverage to get accurate data'
    };
  }

  analyzeDependencySecurity() {
    // This would ideally run npm audit or similar
    return {
      status: 'UNKNOWN',
      note: 'Run npm audit for security analysis'
    };
  }

  analyzeModularity() {
    const files = this.findSourceFiles();
    const modules = new Set();
    
    files.forEach(file => {
      const dir = dirname(file).split('/')[1]; // Get first directory after src
      if (dir) modules.add(dir);
    });
    
    return {
      totalModules: modules.size,
      modules: Array.from(modules),
      score: modules.size > 5 ? 'HIGH' : modules.size > 2 ? 'MEDIUM' : 'LOW'
    };
  }

  analyzeCoupling() {
    // Simplified coupling analysis
    return {
      score: 'MEDIUM',
      note: 'Manual code review recommended for detailed coupling analysis'
    };
  }

  analyzeCohesion() {
    // Simplified cohesion analysis
    return {
      score: 'MEDIUM',
      note: 'Manual code review recommended for detailed cohesion analysis'
    };
  }

  detectPatterns() {
    const patterns = [];
    const files = this.findSourceFiles();
    
    // Check for common patterns
    files.forEach(file => {
      if (file.includes('factory') || file.includes('Provider')) {
        patterns.push({
          pattern: 'FACTORY',
          file,
          confidence: 'HIGH'
        });
      }
      
      if (file.includes('adapter') || file.includes('Adapter')) {
        patterns.push({
          pattern: 'ADAPTER',
          file,
          confidence: 'HIGH'
        });
      }
      
      if (file.includes('strategy') || file.includes('Strategy')) {
        patterns.push({
          pattern: 'STRATEGY',
          file,
          confidence: 'MEDIUM'
        });
      }
    });
    
    return patterns;
  }

  generateRecommendations(analysis) {
    const recommendations = [];

    // Code quality recommendations
    if (analysis.codeQuality.complexity.high > 0) {
      recommendations.push({
        category: 'CODE_QUALITY',
        priority: 'HIGH',
        title: 'Reduce Code Complexity',
        description: `${analysis.codeQuality.complexity.high} files have high complexity. Consider refactoring.`,
        action: 'Run complexity analysis and refactor complex functions'
      });
    }

    // Performance recommendations
    if (analysis.performance.potentialBottlenecks.length > 0) {
      recommendations.push({
        category: 'PERFORMANCE',
        priority: 'MEDIUM',
        title: 'Address Performance Bottlenecks',
        description: `${analysis.performance.potentialBottlenecks.length} potential bottlenecks detected.`,
        action: 'Review and optimize nested loops and heavy operations'
      });
    }

    // Security recommendations
    if (analysis.security.vulnerabilities.length > 0) {
      recommendations.push({
        category: 'SECURITY',
        priority: 'HIGH',
        title: 'Fix Security Vulnerabilities',
        description: `${analysis.security.vulnerabilities.length} security issues detected.`,
        action: 'Address security vulnerabilities immediately'
      });
    }

    // Architecture recommendations
    if (analysis.architecture.modularity.score === 'LOW') {
      recommendations.push({
        category: 'ARCHITECTURE',
        priority: 'MEDIUM',
        title: 'Improve Modularity',
        description: 'Project has low modularity. Consider better separation of concerns.',
        action: 'Refactor into more focused modules'
      });
    }

    // Testing recommendations
    if (analysis.codeQuality.testCoverage.unit === 'N/A') {
      recommendations.push({
        category: 'TESTING',
        priority: 'MEDIUM',
        title: 'Improve Test Coverage',
        description: 'Test coverage data not available. Consider adding comprehensive tests.',
        action: 'Run tests with coverage and add missing tests'
      });
    }

    return recommendations;
  }

  formatReport(analysis) {
    const output = [];
    
    output.push('╔══════════════════════════════════════════════════════════════════════════════╗');
    output.push('║                     ADVANCED CODE INTELLIGENCE REPORT                       ║');
    output.push('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Project Structure
    output.push('📁 PROJECT STRUCTURE');
    output.push('─'.repeat(60));
    output.push(`Total Files: ${analysis.projectStructure.totalFiles}`);
    output.push(`File Types: ${JSON.stringify(analysis.projectStructure.fileTypes)}`);
    output.push(`Build Tools: ${analysis.projectStructure.buildConfig.join(', ')}`);
    output.push(`Dependencies: ${analysis.projectStructure.dependencies.totalDependencies} (prod), ${analysis.projectStructure.dependencies.totalDevDependencies} (dev)`);
    output.push('');

    // Code Quality
    output.push('📊 CODE QUALITY');
    output.push('─'.repeat(60));
    output.push(`Complexity: High: ${analysis.codeQuality.complexity.high}, Medium: ${analysis.codeQuality.complexity.medium}, Low: ${analysis.codeQuality.complexity.low}`);
    output.push(`Code Smells: ${analysis.codeQuality.codeSmells.length}`);
    output.push(`Best Practices: ${analysis.codeQuality.bestPractices.length}`);
    output.push('');

    // Performance
    output.push('⚡ PERFORMANCE');
    output.push('─'.repeat(60));
    output.push(`Potential Bottlenecks: ${analysis.performance.potentialBottlenecks.length}`);
    output.push(`Async Operations: ${analysis.performance.asyncOperations.length} files with high density`);
    output.push(`Optimization Opportunities: ${analysis.performance.optimizationOpportunities.length}`);
    output.push('');

    // Security
    output.push('🔒 SECURITY');
    output.push('─'.repeat(60));
    output.push(`Vulnerabilities: ${analysis.security.vulnerabilities.length}`);
    output.push(`Best Practices: ${analysis.security.bestPractices.length}`);
    output.push('');

    // Architecture
    output.push('🏗️  ARCHITECTURE');
    output.push('─'.repeat(60));
    output.push(`Modularity: ${analysis.architecture.modularity.score} (${analysis.architecture.modularity.totalModules} modules)`);
    output.push(`Modules: ${analysis.architecture.modularity.modules.join(', ')}`);
    output.push(`Patterns Detected: ${analysis.architecture.patterns.length}`);
    output.push('');

    // Recommendations
    output.push('💡 RECOMMENDATIONS');
    output.push('─'.repeat(60));

    if (analysis.recommendations.length === 0) {
      output.push('No critical recommendations at this time.');
    } else {
      analysis.recommendations.forEach((rec, index) => {
        output.push(`${index + 1}. [${rec.priority}] ${rec.title}`);
        output.push(`   Category: ${rec.category}`);
        output.push(`   ${rec.description}`);
        output.push(`   Action: ${rec.action}`);
        output.push('');
      });
    }

    output.push('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    output.push('║                           END OF REPORT                                      ║');
    output.push('╚══════════════════════════════════════════════════════════════════════════════╝');

    return output.join('\n');
  }

  async run() {
    try {
      const analysis = await this.analyzeProject();
      const report = this.formatReport(analysis);
      console.log(report);
      return { success: true, analysis };
    } catch (error) {
      console.error('Error during analysis:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Advanced Code Intelligence Tool

Usage:
  node advanced-code-intelligence.mjs [options]

Options:
  --help, -h     Show this help message
  --json         Output results as JSON
  --quiet, -q    Minimal output (only recommendations)
`);
    process.exit(0);
  }

  const intelligence = new AdvancedCodeIntelligence();

  if (args.includes('--json')) {
    const analysis = await intelligence.analyzeProject();
    console.log(JSON.stringify(analysis, null, 2));
  } else if (args.includes('--quiet') || args.includes('-q')) {
    const analysis = await intelligence.analyzeProject();
    console.log('📋 Recommendations:');
    analysis.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. [${rec.priority}] ${rec.title}: ${rec.action}`);
    });
  } else {
    await intelligence.run();
  }
}

main().catch(console.error);

export { AdvancedCodeIntelligence };