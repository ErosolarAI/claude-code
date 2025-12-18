# 🚀 UNIVERSAL CAPABILITY FRAMEWORK - DEVELOPER QUICK REFERENCE

## 📋 **QUICK START - 5 MINUTES**

### **1. Installation**
```bash
npm install
npm run build
```

### **2. Verify Installation**
```bash
# Test CLI integration
agi --unified --list-capabilities

# Check framework status
agi --unified --framework-status

# Run comprehensive tests
npm test -- test/finalIntegration.test.ts
```

### **3. Code Integration (One Line)**
```typescript
import { SimplifiedUnifiedCapability } from './dist/capabilities/integratedUnifiedCapability.js';

// Get ALL capabilities with one line
const unified = SimplifiedUnifiedCapability.quickStart();

// Use immediately
const capabilities = unified.listCapabilities(true);
const status = unified.getStatus();
console.log('🎉 Framework ready with', JSON.parse(capabilities).capabilities_integrated, 'capabilities');
```

## 🏗️ **ARCHITECTURE QUICK REFERENCE**

### **Core Components**
```typescript
// 1. Main framework class
import { UniversalCapabilityFramework } from './dist/capabilities/universalCapabilityFramework.js';

// 2. Base capability module (extend this)
import { UniversalCapabilityModule } from './dist/capabilities/universalCapabilityFramework.js';

// 3. Factory for capability creation
import { UniversalCapabilityFactory } from './dist/capabilities/universalCapabilityFramework.js';

// 4. Shared utilities (20+ functions)
import { SharedUniversalUtilities } from './dist/capabilities/universalCapabilityFramework.js';
```

### **Dependency Graph**
```
📦 UniversalCapabilityFramework (Main orchestrator)
├── 🏭 UniversalCapabilityFactory (Create capabilities)
├── 🛠️  SharedUniversalUtilities (20+ shared functions)
├── 📡 EventEmitter (Cross-module communication)
├── 🔗 DependencyResolver (Auto-resolve dependencies)
├── 📝 ContextManager (Shared execution context)
└── 🔧 ToolRegistry (Manage capability tools)
```

## 🔧 **API REFERENCE - MOST COMMON METHODS**

### **SimplifiedUnifiedCapability Class**
```typescript
class SimplifiedUnifiedCapability {
  // One-line instantiation
  static quickStart(workingDir?: string): SimplifiedUnifiedCapability;
  
  // List all capabilities
  listCapabilities(detailed?: boolean): string;
  
  // Get framework status
  getStatus(): any;
  
  // Run operation on any capability
  runOperation(operation: string, parameters: Record<string, any>): Promise<any>;
}
```

### **UniversalCapabilityFramework Class**
```typescript
class UniversalCapabilityFramework {
  // Constructor
  constructor(config: UniversalCapabilityConfig);
  
  // Core methods
  getConfig(): UniversalCapabilityConfig;
  getSharedUtilities(): SharedUniversalUtilities;
  getDependencyGraph(): DependencyGraph;
  listCapabilities(): CapabilityRegistration[];
  registerCapability(capability: UniversalCapabilityModule, metadata: CapabilityMetadata): Promise<void>;
  activateCapability(capabilityId: string): Promise<void>;
  executeOperation(operation: string, parameters: any, capabilityIds?: string[]): Promise<any>;
  
  // Event system
  on(event: string, listener: Function): this;
  emit(event: string, data: any): boolean;
}
```

### **UniversalCapabilityModule (Base Class to Extend)**
```typescript
abstract class UniversalCapabilityModule {
  // Required properties
  abstract readonly id: string;
  abstract readonly metadata: CapabilityMetadata;
  
  // Required method
  abstract create(context: CapabilityContext): Promise<CapabilityContribution | CapabilityContribution[]>;
  
  // Optional method (common interface)
  async execute(params: { operation: string; parameters: Record<string, any> }): Promise<any>;
  
  // Protected helpers
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: any): void;
  protected emitEvent(type: string, data: any): void;
  protected validateConfig(schema: Record<string, any>): { valid: boolean; errors: string[] };
}
```

## 🚀 **COMMON USE CASES**

### **Use Case 1: Create New Capability**
```typescript
import { UniversalCapabilityModule } from './dist/capabilities/universalCapabilityFramework.js';

export class MyCustomCapability extends UniversalCapabilityModule {
  readonly id = 'capability.my-custom';
  readonly metadata = {
    id: 'capability.my-custom',
    version: '1.0.0',
    description: 'My custom capability',
    author: 'Your Name',
    dependencies: [],
    provides: ['my.feature', 'my.tools'],
    requires: [],
    category: 'custom',
    tags: ['custom', 'example']
  };
  
  async create(context: CapabilityContext): Promise<CapabilityContribution> {
    return {
      id: this.id,
      description: this.metadata.description,
      toolSuite: {
        id: `${this.id}-tools`,
        description: 'My custom tools',
        tools: [
          {
            name: 'my_tool',
            description: 'My custom tool',
            parameters: {
              type: 'object',
              properties: {
                input: { type: 'string', description: 'Input data' }
              },
              required: ['input']
            },
            execute: async (args) => {
              return { result: `Processed: ${args.input}` };
            }
          }
        ]
      }
    };
  }
  
  async execute(params) {
    switch (params.operation) {
      case 'process':
        return { processed: params.parameters.data };
      default:
        throw new Error(`Unknown operation: ${params.operation}`);
    }
  }
}
```

### **Use Case 2: Register and Use Capability**
```typescript
import { UniversalCapabilityFramework } from './dist/capabilities/universalCapabilityFramework.js';
import { UniversalCapabilityFactory } from './dist/capabilities/universalCapabilityFramework.js';
import { MyCustomCapability } from './myCustomCapability.js';

// Initialize framework
const framework = new UniversalCapabilityFramework({
  rootDir: process.cwd(),
  debug: true
});

// Register capability type
UniversalCapabilityFactory.registerCapability('my-custom', MyCustomCapability);

// Create instance
const capability = UniversalCapabilityFactory.createCapability('my-custom', framework);

// Register with framework
await framework.registerCapability(capability, capability.metadata);

// Activate capability
await framework.activateCapability('capability.my-custom');

// Execute operation
const result = await framework.executeOperation('process', { data: 'test' }, ['capability.my-custom']);
console.log('Result:', result);
```

### **Use Case 3: Cross-Capability Operations**
```typescript
// Execute operation across multiple capabilities
const result = await framework.executeOperation(
  'security_audit',
  { target: 'my-application' },
  ['capability.tao-suite', 'capability.universal-security', 'capability.multi-provider-ai']
);

// Framework handles:
// 1. Dependency resolution
// 2. Event coordination
// 3. Result aggregation
// 4. Error handling
```

## 🔄 **MIGRATION QUICK GUIDE**

### **Migrate Legacy Capability (Automated)**
```typescript
import { quickMigrate } from './dist/capabilities/migrationUtilities.js';

const legacyCapability = {
  id: 'capability.legacy-example',
  name: 'Legacy Example',
  description: 'Legacy capability',
  tools: [{ name: 'legacy_tool', description: 'Legacy tool' }]
};

const report = await quickMigrate(legacyCapability, {
  preserveOriginal: true,
  generateCompatibilityLayer: true,
  outputDir: '/tmp/migration'
});

if (report.success) {
  console.log(`✅ Migrated to: ${report.migratedCapability.id}`);
}
```

### **Manual Migration Pattern**
```typescript
// BEFORE: Legacy capability
class LegacyCapability {
  async create(context) { /* ... */ }
  async execute(params) { /* ... */ }
}

// AFTER: Extend UniversalCapabilityModule
import { UniversalCapabilityModule } from './universalCapabilityFramework.js';

class MigratedCapability extends UniversalCapabilityModule {
  readonly id = 'capability.migrated-example';
  readonly metadata = { /* ... */ };
  
  async create(context) {
    // Reuse or transform legacy logic
    const legacyContribution = await this.legacyCapability.create(context);
    return this.transformLegacyContribution(legacyContribution);
  }
  
  async execute(params) {
    // Route to legacy execute or implement new
    return await this.legacyCapability.execute(params);
  }
}
```

## 🛠️ **SHARED UTILITIES QUICK REFERENCE**

### **Most Used Utilities**
```typescript
const utilities = framework.getSharedUtilities();

// 1. Operation ID generation
const opId = utilities.generateOperationId('my-operation');
// Example: "op_my-operation_1702760400123_abc123"

// 2. Deep merge objects
const merged = utilities.deepMerge(
  { a: 1, b: { c: 2 } },
  { b: { d: 3 }, e: 4 }
);
// Result: { a: 1, b: { c: 2, d: 3 }, e: 4 }

// 3. Validate configuration
const validation = utilities.validateConfig(config, schema);
// Returns: { valid: boolean, errors: string[] }

// 4. Create tool definition
const tool = utilities.createToolDefinition(
  'my_tool',
  'Tool description',
  parametersSchema,
  executeFunction
);

// 5. Sanitize input
const sanitized = utilities.sanitizeInput(userInput, { maxLength: 1000 });

// 6. Format output
const formatted = utilities.formatOutput(data, { pretty: true });

// 7. Generate checksum
const checksum = utilities.generateChecksum(data, 'sha256');

// 8. Create backup
const backupPath = await utilities.createBackup(sourcePath, backupDir);

// 9. Validate schema
const schemaResult = utilities.validateSchema(data, jsonSchema);

// 10. Normalize path
const normalized = utilities.normalizePath('/some/../path');
```

## 🔒 **SECURITY QUICK GUIDE**

### **Authorization Levels**
```typescript
// Configure based on environment
const authorization = process.env.NODE_ENV === 'production' 
  ? 'elevated' 
  : 'full';

const unified = SimplifiedUnifiedCapability.quickStart();
```

### **Evidence Collection**
```typescript
// All operations automatically generate evidence
// Location: /tmp/agi-framework/evidence/
// Format: JSON with timestamps, checksums, operation IDs
```

### **Security Configuration**
```typescript
const framework = new UniversalCapabilityFramework({
  // Security features
  enableEvidenceCollection: true,
  evidenceRetentionDays: 7,
  enableAuthorizationChecks: true,
  defaultAuthorizationLevel: 'elevated',
  
  // Input validation
  enableInputSanitization: true,
  maxInputLength: 10000,
  
  // Output filtering
  enableOutputFiltering: true,
  sensitivePatterns: ['password', 'secret', 'token']
});
```

## 📊 **DEBUGGING & TROUBLESHOOTING**

### **Common Issues & Solutions**

#### **Issue: Capability not loading**
```typescript
// 1. Check dependencies
console.log(capability.metadata.dependencies);

// 2. Check framework registration
const registered = framework.listCapabilities();
console.log(registered.map(c => c.id));

// 3. Enable debug logging
const framework = new UniversalCapabilityFramework({
  debug: true,
  logLevel: 'debug'
});
```

#### **Issue: Operation failing**
```typescript
// 1. Check operation parameters
console.log('Parameters:', parameters);

// 2. Check capability status
const status = await capability.execute({ 
  operation: 'get_status', 
  parameters: {} 
});

// 3. Check event system
framework.on('log', (event) => {
  if (event.level === 'error') {
    console.error('Framework error:', event);
  }
});
```

#### **Issue: Performance problems**
```typescript
// 1. Check dependency graph
const graph = framework.getDependencyGraph();
console.log('Cycles:', graph.hasCycles);

// 2. Enable performance monitoring
const framework = new UniversalCapabilityFramework({
  enablePerformanceMonitoring: true,
  profileOperations: true
});

// 3. Check memory usage
console.log(process.memoryUsage());
```

### **Debug Commands**
```bash
# Enable debug mode
agi --unified --debug

# Check specific capability
agi --security --audit  # Tests security capability

# Run self-update check
node -e "
  const { quickSelfUpdate } = require('./dist/capabilities/selfUpdateSystem.js');
  quickSelfUpdate({ enableAutoUpdate: false }).then(console.log);
"

# Test migration utility
node -e "
  const { quickMigrate } = require('./dist/capabilities/migrationUtilities.js');
  const legacy = { id: 'test', name: 'Test' };
  quickMigrate(legacy).then(console.log);
"
```

## 🧪 **TESTING QUICK GUIDE**

### **Unit Test Template**
```typescript
import { describe, it, expect } from '@jest/globals';
import { MyCustomCapability } from './myCustomCapability.js';

describe('MyCustomCapability', () => {
  it('should have correct metadata', () => {
    const framework = new UniversalCapabilityFramework({ rootDir: '.' });
    const capability = new MyCustomCapability(framework);
    
    expect(capability.id).toBe('capability.my-custom');
    expect(capability.metadata.version).toBe('1.0.0');
  });
  
  it('should create contribution', async () => {
    const framework = new UniversalCapabilityFramework({ rootDir: '.' });
    const capability = new MyCustomCapability(framework);
    
    const contribution = await capability.create({
      profile: 'default',
      workspaceContext: null,
      workingDir: '.',
      env: process.env
    });
    
    expect(contribution.id).toBe('capability.my-custom');
    expect(contribution.toolSuite.tools.length).toBeGreaterThan(0);
  });
});
```

### **Integration Test Template**
```typescript
import { SimplifiedUnifiedCapability } from './dist/capabilities/integratedUnifiedCapability.js';

describe('Framework Integration', () => {
  it('should initialize unified framework', () => {
    const unified = SimplifiedUnifiedCapability.quickStart();
    
    const capabilities = unified.listCapabilities(true);
    const parsed = JSON.parse(capabilities);
    
    expect(parsed.framework).toBe('active');
    expect(parsed.capabilities_integrated).toBeGreaterThan(0);
  });
});
```

## 🚀 **PRODUCTION DEPLOYMENT QUICK START**

### **Docker Deployment (Simplified)**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
ENV NODE_ENV=production
CMD ["node", "dist/bin/agi.js", "--unified"]
```

### **Kubernetes Config (Simplified)**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agi-unified
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: agi
        image: agi-unified:latest
        env:
        - name: NODE_ENV
          value: "production"
```

### **CI/CD Pipeline (Simplified)**
```yaml
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
    - run: npm ci
    - run: npm run build
    - run: npm test
    # Add deployment steps
```

## 📞 **SUPPORT & RESOURCES**

### **Immediate Help**
```bash
# Check framework status
agi --unified --framework-status

# List all capabilities
agi --unified --list-capabilities

# Run self-test
agi --self-test

# Check version
agi --version
```

### **Documentation References**
1. **`DEPLOYMENT_GUIDE.md`** - Complete production deployment
2. **`MIGRATION_GUIDE.md`** - Legacy code migration
3. **`README-UNIFIED-FRAMEWORK.md`** - Framework overview
4. **`COMPLETE_INTEGRATION_DEMO.md`** - Working examples
5. **`FINAL_COMPREHENSIVE_SUMMARY.md`** - Complete project summary

### **Example Code**
- **`examples/universalFrameworkDemo.ts`** - Basic framework usage
- **`examples/fullIntegrationDemo.ts`** - Complete integration demo
- **`examples/enterpriseWorkflowOrchestrator.ts`** - Enterprise workflows

## 🎯 **CHEAT SHEET**

### **Most Important Commands**
```bash
# Initialize framework
agi --unified

# List capabilities
agi --unified --list-capabilities

# Check status
agi --unified --framework-status

# Build project
npm run build

# Run tests
npm test -- test/finalIntegration.test.ts

# Run specific capability
agi --security --audit
```

### **Most Important Code Patterns**
```typescript
// Pattern 1: Quick start
const unified = SimplifiedUnifiedCapability.quickStart();

// Pattern 2: Create custom capability
class MyCapability extends UniversalCapabilityModule {
  readonly id = 'capability.my-id';
  readonly metadata = { /* ... */ };
  async create(context) { /* ... */ }
}

// Pattern 3: Use shared utilities
const utils =