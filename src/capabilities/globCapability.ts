import type { CapabilityModule, CapabilityContext, CapabilityContribution } from '../runtime/agentHost.js';
import { createSearchTools } from '../tools/searchTools.js';

/**
 * Glob Capability Module
 *
 * Provides file pattern matching via the unified Search tool.
 * Use mode="files" with glob patterns.
 *
 * @deprecated Use SearchCapabilityModule instead
 */
export class GlobCapabilityModule implements CapabilityModule {
  readonly id = 'capability.glob';

  async create(context: CapabilityContext): Promise<CapabilityContribution> {
    return {
      id: 'glob.pattern_matching',
      description: 'File pattern matching (via unified Search)',
      toolSuite: {
        id: 'glob',
        tools: createSearchTools(context.workingDir),
      },
    };
  }
}
