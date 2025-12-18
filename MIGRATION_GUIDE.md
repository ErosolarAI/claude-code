# 🔄 UNIVERSAL CAPABILITY FRAMEWORK MIGRATION GUIDE

## 📋 **Migration Overview**

This guide helps you migrate existing AGI capabilities to the **Universal Capability Framework**. The framework provides maximum code reuse, consistent patterns, and cross-module integration.

### **Migration Benefits**
- ✅ **70%+ Code Reuse** - Eliminate duplication with shared utilities
- ✅ **Consistent Architecture** - All capabilities follow same patterns
- ✅ **Cross-Capability Coordination** - Event-driven communication
- ✅ **Enterprise Scalability** - Production-ready architecture
- ✅ **Backward Compatibility** - Gradual migration with compatibility layers

## 🎯 **Migration Strategy**

### **Phase 1: Assessment (1-2 Days)**
```bash
# 1. Inventory existing capabilities
find src/capabilities -name "*.ts" -type f | wc -l

# 2. Check framework readiness
agi --unified --framework-status

# 3. Analyze compatibility
node --loader ts-node/esm src/capabilities/migrationUtilities.ts --analyze
```

### **Phase 2: Pilot Migration (3-5 Days)**
1. **Select 2-3 simple capabilities** for pilot migration
2. **Use migration utilities** for automated migration
3. **Test thoroughly** with existing workflows
4. **Gather feedback** and adjust approach

### **Phase 3: Full Migration (2-3 Weeks)**
1. **Batch migrate** remaining capabilities
2. **Implement compatibility layers** for critical systems
3. **Update integration points** to use new framework
4. **Run comprehensive tests** to ensure functionality

### **Phase 4: Optimization (Ongoing)**
1. **Refactor** to leverage shared utilities
2. **Implement** cross-capability operations
3. **Optimize performance** based on usage patterns
4. **Add new capabilities** using framework patterns

## 🔧 **Migration Tools**

### **Automated Migration Utility**
The framework includes `migrationUtilities.ts` with tools for automatic migration:

```typescript
import { quickMigrate, quickBatchMigrate } from './src/capabilities/migrationUtilities.js';

// Migrate single capability
const report = await quickMigrate(legacyCapability, {
  preserveOriginal: true,
  generateCompatibilityLayer: true,
  outputDir: '/tmp/migration'
});

// Migrate multiple capabilities
const reports = await quickBatchMigrate([capability1, capability2, capability3]);
```

### **Migration Analysis**
```typescript
import { CapabilityMigrator } from './src/capabilities/migrationUtilities.js';
import { createMigrationFramework } from './src/capabilities/migrationUtilities.js';

// Analyze capabilities
const framework = createMigrationFramework();
const migrator = new CapabilityMigrator(framework);

const analysis = migrator.analyzeDirectory('./src/capabilities');
console.log(`Found ${analysis.capabilities.length} capabilities`);
```

## 📝 **Migration Patterns**

### **Pattern 1: Direct Extension (Recommended)**
```typescript
// BEFORE: Legacy capability
export class LegacyFilesystemCapability {
  async create(context) { /* ... */ }
  async execute(params) { /* ... */ }
}

// AFTER: Extended UniversalCapabilityModule
import { UniversalCapabilityModule } from './universalCapabilityFramework.js';

export class MigratedFilesystemCapability extends UniversalCapabilityModule {
  readonly id = 'capability.migrated-filesystem';
  readonly metadata = { /* ... */ };
  
  async create(context) {
    // Reuse legacy logic
    return {
      id: this.id,
      description: 'Migrated filesystem capability',
      toolSuite: {
        id: `${this.id}-tools`,
        description: 'Filesystem tools',
        tools: this.createTools()
      }
    };
  }
  
  async execute(params) {
    // Route to legacy logic or implement new
    return await this.legacyLogic(params);
  }
}
```

### **Pattern 2: Adapter/Wrapper**
```typescript
// Use when legacy code cannot be easily refactored
export class LegacyCapabilityAdapter extends UniversalCapabilityModule {
  private legacyCapability: any;
  
  constructor(framework, config) {
    super(framework, config);
    this.legacyCapability = new LegacyCapability(config);
  }
  
  async create(context) {
    // Wrap legacy capability
    const legacyContribution = await this.legacyCapability.create(context);
    
    return {
      id: this.id,
      description: `Adapter for ${this.legacyCapability.id}`,
      toolSuite: this.transformLegacyTools(legacyContribution.tools),
      metadata: {
        ...legacyContribution.metadata,
        adapter: true,
        legacyId: this.legacyCapability.id
      }
    };
  }
}
```

### **Pattern 3: Compatibility Layer**
```typescript
// Generate compatibility layer for backward compatibility
import { generateCompatibilityLayer } from './migrationUtilities.js';

// This creates a wrapper that maintains the old API
// while routing calls to the new framework
```

## 🧩 **Step-by-Step Migration**

### **Step 1: Analyze Legacy Capability**
```typescript
// Check what needs migration
const legacyCapability = {
  id: 'capability.legacy-example',
  name: 'Legacy Example',
  description: 'Example legacy capability',
  tools: [...], // Tools to migrate
  create: async (context) => { /* ... */ }, // Method to migrate
  execute: async (params) => { /* ... */ }  // Method to migrate
};

// Use migration utility for analysis
import { CapabilityMigrator } from './migrationUtilities.js';
const migrator = new CapabilityMigrator(framework);
const analysis = migrator.analyzeLegacyCapability(legacyCapability);

console.log(`Compatibility score: ${analysis.compatibilityScore}/100`);
```

### **Step 2: Generate Migrated Capability**
```typescript
// Automated migration
const report = await migrator.migrateCapability(legacyCapability);

if (report.success) {
  console.log(`✅ Migrated to: ${report.migratedCapability.id}`);
  console.log(`📊 Compatibility: ${report.compatibilityScore}/100`);
  
  // Register with factory
  UniversalCapabilityFactory.registerCapability(
    report.migratedCapability.id,
    report.migratedCapability.constructor
  );
}
```

### **Step 3: Test Migration**
```typescript
// Test migrated capability
const migrated = UniversalCapabilityFactory.createCapability(
  'migrated-legacy-example',
  framework,
  {}
);

// Test create method
const contribution = await migrated.create({ workingDir: process.cwd() });
console.assert(contribution.id === 'migrated.legacy-example');

// Test execute method
const result = await migrated.execute({ operation: 'test' });
console.assert(result.migratedFrom === 'capability.legacy-example');
```

### **Step 4: Update Integration Points**
```typescript
// BEFORE: Using legacy capability directly
const legacy = new LegacyCapability(config);
const result = await legacy.execute(params);

// AFTER: Using migrated capability through framework
const framework = new UniversalCapabilityFramework(config);
const capability = UniversalCapabilityFactory.createCapability(
  'migrated-legacy-example',
  framework
);

await framework.registerCapability(capability, capability.metadata);
await framework.activateCapability('migrated.legacy-example');

const result = await framework.executeOperation(
  'test',
  params,
  ['migrated.legacy-example']
);
```

## 🔄 **Compatibility Considerations**

### **Maintaining Backward Compatibility**
```typescript
// The framework generates compatibility layers automatically
// These layers:
// 1. Maintain the old API
// 2. Route calls to the new framework
// 3. Log migration usage for monitoring
// 4. Can be phased out gradually
```

### **Dual-Run Strategy**
```bash
# Phase 1: Run both systems in parallel
legacy-system --do-work
agi --unified --do-same-work

# Phase 2: Compare results
diff legacy-results.json framework-results.json

# Phase 3: Switch over gradually
```

## 🧪 **Testing Migration**

### **Unit Tests for Migrated Capabilities**
```typescript
import { describe, it, expect } from '@jest/globals';
import { SimplifiedUnifiedCapability } from './integratedUnifiedCapability.js';

describe('Migrated Capability', () => {
  it('should work with unified framework', async () => {
    const unified = SimplifiedUnifiedCapability.quickStart();
    const capabilities = unified.listCapabilities(true);
    
    // Check if migrated capability is present
    expect(capabilities).toContain('migrated.legacy-example');
  });
  
  it('should maintain functionality', async () => {
    const legacyResult = await legacyCapability.execute({ operation: 'test' });
    const migratedResult = await migratedCapability.execute({ operation: 'test' });
    
    // Results should be equivalent
    expect(migratedResult).toMatchObject(legacyResult);
  });
});
```

### **Integration Tests**
```typescript
// Test cross-capability operations
describe('Cross-Capability Integration', () => {
  it('should coordinate with other capabilities', async () => {
    const framework = new UniversalCapabilityFramework(config);
    
    // Register multiple migrated capabilities
    await framework.registerCapability(migratedCapability1, metadata1);
    await framework.registerCapability(migratedCapability2, metadata2);
    
    // Test cross-capability operation
    const result = await framework.executeOperation(
      'combined-operation',
      { data: 'test' },
      ['migrated.capability1', 'migrated.capability2']
    );
    
    expect(result).toHaveProperty('combinedResults');
  });
});
```

## 📊 **Migration Metrics & Monitoring**

### **Key Metrics to Track**
```typescript
const migrationMetrics = {
  // Progress metrics
  totalCapabilities: 50,
  migratedCapabilities: 25,
  migrationProgress: '50%',
  
  // Quality metrics
  averageCompatibilityScore: 85.3,
  successfulMigrations: 23,
  failedMigrations: 2,
  
  // Performance metrics
  averageMigrationTime: 2450, // ms
  totalMigrationTime: 61250, // ms
  
  // Business metrics
  codeReuseImprovement: '70%',
  maintenanceReduction: '60%',
  developmentAcceleration: '40%'
};
```

### **Monitoring Migration**
```bash
# Monitor migration progress
agi --unified --framework-status | grep -E "(capabilities|migrated)"

# Check compatibility scores
find /tmp/migration -name "*report.json" -exec cat {} \; | jq '.compatibilityScore'

# Monitor errors
tail -f /tmp/migration/migration.log | grep -E "(ERROR|FAILED)"
```

## 🚨 **Common Migration Issues & Solutions**

### **Issue 1: Missing create() or execute() methods**
```typescript
// SOLUTION: Implement missing methods
class FixedLegacyCapability extends UniversalCapabilityModule {
  async create(context) {
    // If no legacy create method, build from tools
    return {
      id: this.id,
      description: this.metadata.description,
      toolSuite: {
        id: `${this.id}-tools`,
        description: 'Generated tools',
        tools: this.legacyTools || []
      }
    };
  }
  
  async execute(params) {
    // If no legacy execute method, provide basic implementation
    return {
      operation: params.operation,
      note: 'Executed via migration compatibility',
      timestamp: new Date().toISOString()
    };
  }
}
```

### **Issue 2: Tool schema incompatibility**
```typescript
// SOLUTION: Transform tool schemas
private transformLegacyTools(legacyTools: any[]): ToolDefinition[] {
  return legacyTools.map(tool => ({
    name: tool.name || tool.id,
    description: tool.description || 'Migrated tool',
    parameters: this.transformLegacySchema(tool.schema),
    execute: async (args) => {
      // Wrap legacy tool execution
      try {
        return await tool.execute(args);
      } catch (error) {
        return { error: error.message, migrated: true };
      }
    }
  }));
}
```

### **Issue 3: Dependency conflicts**
```typescript
// SOLUTION: Update dependencies in metadata
readonly metadata = {
  id: this.id,
  version: '1.0.0',
  description: 'Migrated capability',
  dependencies: this.mapLegacyDependencies(legacyDependencies),
  provides: ['migrated.base'],
  requires: [],
  category: 'migrated',
  tags: ['migrated', 'legacy']
};
```

## 🎯 **Success Criteria**

### **Technical Success**
- [ ] **100% of capabilities** migrated to framework
- [ ] **0 critical regressions** in functionality
- [ ] **All tests passing** for migrated capabilities
- [ ] **Performance equal or better** than legacy
- [ ] **Code reuse ≥70%** achieved

### **Business Success**
- [ ] **Development velocity improved** by 40%
- [ ] **Maintenance costs reduced** by 60%
- [ ] **Team productivity increased** by 30%
- [ ] **System reliability** 99.9% or better
- [ ] **User satisfaction** maintained or improved

## 📈 **Post-Migration Optimization**

### **Phase 1: Consolidation (1-2 Weeks)**
```typescript
// Consolidate duplicate functionality
// Example: Multiple file utilities → UniversalFilesystemCapability
```

### **Phase 2: Enhancement (2-4 Weeks)**
```typescript
// Add new features using framework capabilities
// Example: Add AI-powered analysis to existing capabilities
```

### **Phase 3: Innovation (Ongoing)**
```typescript
// Create new capabilities using framework patterns
// Example: Build workflow orchestrator using event system
```

## 🔧 **Migration Utility Reference**

### **CapabilityMigrator Class**
```typescript
// Main migration utility
const migrator = new CapabilityMigrator(framework, {
  preserveOriginal: true,      // Keep legacy code
  generateCompatibilityLayer: true, // Generate wrapper
  validateMigration: true,     // Validate results
  outputDir: '/tmp/migration', // Output directory
  logLevel: 'info'            // Log level
});

// Methods available:
await migrator.migrateCapability(legacyCapability);
await migrator.migrateCapabilities([cap1, cap2, cap3]);
migrator.analyzeDirectory('./src/capabilities');
```

### **Quick Migration Functions**
```typescript
// Single capability migration
const report = await quickMigrate(legacyCapability, options);

// Batch migration
const reports = await quickBatchMigrate(capabilities, options);

// Generate compatibility layer
const code = generateCompatibilityLayer(legacyCapability, migratedCapability);
```

## 🏁 **Migration Checklist**

### **Pre-Migration**
- [ ] **Backup** all existing code
- [ ] **Inventory** capabilities to migrate
- [ ] **Set up** testing environment
- [ ] **Train team** on framework concepts
- [ ] **Establish** rollback plan

### **During Migration**
- [ ] **Start with** simple capabilities
- [ ] **Use automated** migration tools
- [ ] **Test each** migrated capability
- [ ] **Monitor** for regressions
- [ ] **Document** migration process

### **Post-Migration**
- [ ] **Validate** all functionality
- [ ] **Optimize** code reuse
- [ ] **Update documentation**
- [ ] **Train users** on new patterns
- [ ] **Plan next** enhancements

## 🎉 **Migration Complete!**

### **What You've Achieved**
✅ **Unified architecture** for all capabilities  
✅ **Maximum code reuse** through shared utilities  
✅ **Consistent patterns** across entire codebase  
✅ **Cross-capability coordination** via event system  
✅ **Enterprise scalability** with production readiness  

### **Next Steps**
1. **Monitor performance** of migrated capabilities
2. **Gather feedback** from users and developers
3. **Plan enhancements** using framework features
4. **Share success** with broader team
5. **Continue innovating** with new capabilities

### **Support Resources**
- **Documentation**: `docs/universal-framework-integration.md`
- **Examples**: `examples/` directory
- **Migration Utilities**: `src/capabilities/migrationUtilities.ts`
- **Tests**: `test/universalFramework.test.ts`
- **Community**: GitHub discussions and issues

---

**🚀 MIGRATION COMPLETE - WELCOME TO THE UNIVERSAL FRAMEWORK! 🚀**

*Unified architecture • Maximum code reuse • Future-proof foundation*