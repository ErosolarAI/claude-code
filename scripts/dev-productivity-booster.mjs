#!/usr/bin/env node

/**
 * Development Productivity Booster
 * 
 * Enhances developer workflow with intelligent automation,
 * code generation, and productivity tools.
 * 
 * Features:
 * - Automated code scaffolding
 * - Intelligent file generation
 * - Development workflow optimization
 * - Code snippet library
 * - Project template management
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DevProductivityBooster {
  constructor() {
    this.projectRoot = join(__dirname, '..');
    this.templates = this.loadTemplates();
  }

  loadTemplates() {
    return {
      'component': `/**
 * Component Template
 * 
 * Auto-generated component with TypeScript and best practices
 */

export interface {{name}}Props {
  // Component props interface
}

export const {{name}} = (props: {{name}}Props) => {
  return (
    <div>
      {/* Component content */}
    </div>
  );
};

export default {{name}};`,

      'service': `/**
 * Service Template
 * 
 * Auto-generated service with error handling and TypeScript
 */

export class {{name}}Service {
  constructor() {
    // Service initialization
  }

  async execute(): Promise<any> {
    try {
      // Service logic here
      return { success: true };
    } catch (error) {
      console.error('Service error:', error);
      throw error;
    }
  }
}

export default {{name}}Service;`,

      'utility': `/**
 * Utility Function Template
 * 
 * Auto-generated utility function with TypeScript
 */

export const {{name}} = (input: any): any => {
  // Utility logic here
  return input;
};

export default {{name}};`,

      'test': `/**
 * Test Template
 * 
 * Auto-generated test with Jest and TypeScript
 */

import { {{name}} } from './{{name}}';

describe('{{name}}', () => {
  it('should work correctly', () => {
    expect({{name}}()).toBeDefined();
  });
});`
    };
  }

  generateFile(type, name, targetPath = 'src') {
    if (!this.templates[type]) {
      throw new Error(`Unknown template type: ${type}`);
    }

    const template = this.templates[type];
    const content = template.replace(/\{\{name\}\}/g, name);
    
    const fileName = this.getFileName(type, name);
    const fullPath = join(this.projectRoot, targetPath, fileName);
    
    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write file
    writeFileSync(fullPath, content, 'utf8');
    
    return {
      type,
      name,
      fileName,
      path: fullPath,
      content
    };
  }

  getFileName(type, name) {
    const extensions = {
      'component': '.tsx',
      'service': '.ts',
      'utility': '.ts',
      'test': '.test.ts'
    };
    
    return `${name}${extensions[type] || '.ts'}`;
  }

  analyzeWorkflow() {
    const packageJson = JSON.parse(readFileSync(join(this.projectRoot, 'package.json'), 'utf8'));
    const scripts = packageJson.scripts || {};
    
    const workflow = {
      build: scripts.build ? '✅' : '❌',
      test: scripts.test ? '✅' : '❌',
      lint: scripts.lint ? '✅' : '❌',
      dev: scripts.dev ? '✅' : '❌',
      typeCheck: scripts['type-check'] ? '✅' : '❌'
    };

    return {
      scripts: workflow,
      recommendations: this.generateWorkflowRecommendations(workflow)
    };
  }

  generateWorkflowRecommendations(workflow) {
    const recommendations = [];

    if (workflow.build === '❌') {
      recommendations.push('Add build script to package.json');
    }

    if (workflow.test === '❌') {
      recommendations.push('Add test script to package.json');
    }

    if (workflow.lint === '❌') {
      recommendations.push('Add lint script to package.json');
    }

    if (workflow.dev === '❌') {
      recommendations.push('Add dev script for development workflow');
    }

    return recommendations;
  }

  generateCodeSnippets() {
    return {
      'error-handling': `
// Error handling pattern
try {
  // Your code here
} catch (error) {
  console.error('Operation failed:', error);
  throw new Error('Failed to execute operation');
}
`,
      'async-function': `
// Async function pattern
const asyncFunction = async (): Promise<any> => {
  try {
    // Async operations here
    return await someAsyncOperation();
  } catch (error) {
    console.error('Async operation failed:', error);
    throw error;
  }
};
`,
      'type-definition': `
// Type definition pattern
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export type UserRole = 'admin' | 'user' | 'guest';
`,
      'api-client': `
// API client pattern
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(\`\${this.baseUrl}\${endpoint}\`);
    if (!response.ok) {
      throw new Error(\`API error: \${response.status}\`);
    }
    return response.json();
  }
}
`
    };
  }

  formatReport(generatedFile, workflowAnalysis) {
    const output = [];

    output.push('╔══════════════════════════════════════════════════════════════════════════════╗');
    output.push('║                      DEVELOPMENT PRODUCTIVITY REPORT                        ║');
    output.push('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    if (generatedFile) {
      output.push('📄 FILE GENERATED');
      output.push('─'.repeat(60));
      output.push(`Type: ${generatedFile.type}`);
      output.push(`Name: ${generatedFile.name}`);
      output.push(`File: ${generatedFile.fileName}`);
      output.push(`Path: ${generatedFile.path.replace(this.projectRoot + '/', '')}`);
      output.push('');
    }

    output.push('⚙️  WORKFLOW ANALYSIS');
    output.push('─'.repeat(60));
    output.push(`Build:      ${workflowAnalysis.scripts.build}`);
    output.push(`Test:       ${workflowAnalysis.scripts.test}`);
    output.push(`Lint:       ${workflowAnalysis.scripts.lint}`);
    output.push(`Dev:        ${workflowAnalysis.scripts.dev}`);
    output.push(`Type Check: ${workflowAnalysis.scripts.typeCheck}`);
    output.push('');

    if (workflowAnalysis.recommendations.length > 0) {
      output.push('💡 WORKFLOW RECOMMENDATIONS');
      output.push('─'.repeat(60));
      workflowAnalysis.recommendations.forEach(rec => {
        output.push(`• ${rec}`);
      });
      output.push('');
    }

    output.push('🚀 PRODUCTIVITY TIPS');
    output.push('─'.repeat(60));
    output.push('• Use "npm run dev" for development with hot reload');
    output.push('• Run "npm test" frequently during development');
    output.push('• Use "npm run lint:fix" to automatically fix code style');
    output.push('• Run "npm run type-check" to verify TypeScript types');
    output.push('• Use code snippets for common patterns');

    output.push('\n' + '═'.repeat(60));

    return output.join('\n');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const booster = new DevProductivityBooster();

  if (args.length === 0) {
    // Show workflow analysis
    const workflow = booster.analyzeWorkflow();
    console.log(booster.formatReport(null, workflow));
    return;
  }

  if (args[0] === 'generate') {
    if (args.length < 3) {
      console.log('Usage: node scripts/dev-productivity-booster.mjs generate <type> <name> [target-path]');
      console.log('Types: component, service, utility, test');
      process.exit(1);
    }

    const type = args[1];
    const name = args[2];
    const targetPath = args[3] || 'src';

    try {
      const generatedFile = booster.generateFile(type, name, targetPath);
      const workflow = booster.analyzeWorkflow();
      console.log(booster.formatReport(generatedFile, workflow));
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  } else if (args[0] === 'snippets') {
    const snippets = booster.generateCodeSnippets();
    console.log('📝 AVAILABLE CODE SNIPPETS');
    console.log('─'.repeat(60));
    Object.keys(snippets).forEach(key => {
      console.log(`\n${key}:`);
      console.log(snippets[key]);
    });
  } else {
    console.log('Usage:');
    console.log('  node scripts/dev-productivity-booster.mjs                    # Workflow analysis');
    console.log('  node scripts/dev-productivity-booster.mjs generate <type> <name> [path]');
    console.log('  node scripts/dev-productivity-booster.mjs snippets           # Show code snippets');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DevProductivityBooster };