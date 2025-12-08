import type { CapabilityContribution, CapabilityContext, CapabilityModule } from '../runtime/agentHost.js';
import { createSearchTools } from '../tools/searchTools.js';

export interface SearchCapabilityOptions {
  workingDir?: string;
}

/**
 * Search Capability Module
 *
 * Provides separate, focused search tools:
 * - Glob: File pattern matching
 * - Grep: Content search (regex)
 * - FindDefinition: Code definition finding
 */
export class SearchCapabilityModule implements CapabilityModule {
  readonly id = 'capability.search';
  private readonly options: SearchCapabilityOptions;

  constructor(options: SearchCapabilityOptions = {}) {
    this.options = options;
  }

  async create(context: CapabilityContext): Promise<CapabilityContribution> {
    const workingDir = this.options.workingDir ?? context.workingDir;
    return {
      id: 'search.tools',
      description: 'Separate tools for file and content search',
      toolSuite: {
        id: 'search',
        tools: createSearchTools(workingDir),
      },
      metadata: { workingDir },
    };
  }
}
