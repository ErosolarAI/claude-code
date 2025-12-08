/**
 * UnifiedOps Capability
 *
 * Exposes a single "UnifiedOps" meta-tool that routes to all core tool suites
 * (filesystem, edit, bash, search, web, human-ops, generator).
 */

import type { CapabilityContribution, CapabilityContext, CapabilityModule } from '../runtime/agentHost.js';
import { createUnifiedOpsTools } from '../tools/unifiedOps.js';

export class UnifiedOpsCapabilityModule implements CapabilityModule {
  readonly id = 'capability.unified-ops';

  async create(context: CapabilityContext): Promise<CapabilityContribution> {
    return {
      id: 'unified.ops',
      description: 'Unified meta-tool routing to core tool suites.',
      toolSuite: {
        id: 'unified-ops',
        description: 'Single entry point for all core tools.',
        tools: createUnifiedOpsTools(context.workingDir),
      },
      metadata: {
        pluginId: 'tool.unified-ops',
      },
    };
  }
}
