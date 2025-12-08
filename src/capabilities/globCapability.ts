import type { CapabilityModule, CapabilityContext, CapabilityContribution } from '../runtime/agentHost.js';
import { createSearchTools } from '../tools/searchTools.js';

/**
 * Glob Capability Module
 *
 * @deprecated Use SearchCapabilityModule instead - it provides Glob, Grep, and FindDefinition tools
 */
export class GlobCapabilityModule implements CapabilityModule {
  readonly id = 'capability.glob';

  async create(context: CapabilityContext): Promise<CapabilityContribution> {
    // Returns all search tools for backward compatibility
    // The Glob tool is included in this set
    return {
      id: 'glob.pattern_matching',
      description: 'File pattern matching (via Glob tool)',
      toolSuite: {
        id: 'glob',
        tools: createSearchTools(context.workingDir),
      },
    };
  }
}
