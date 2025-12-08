/**
 * Generator Capability
 *
 * Provides a meta-tool to draft new tool definitions quickly (name/params/handler skeleton),
 * usable standalone or alongside HumanIntegration to propose/build new tools.
 */

import type { CapabilityContribution, CapabilityContext, CapabilityModule } from '../runtime/agentHost.js';
import { createGeneratorTools } from '../tools/generatorTools.js';

export class GeneratorCapabilityModule implements CapabilityModule {
  readonly id = 'capability.generator';

  async create(_context: CapabilityContext): Promise<CapabilityContribution> {
    return {
      id: 'generator.tools',
      description: 'Draft new tools (schema + handler skeleton) for AGI Core.',
      toolSuite: {
        id: 'generator',
        description: 'Meta-tools for generating tool definitions.',
        tools: createGeneratorTools(),
      },
      metadata: {
        pluginId: 'tool.generator',
      },
    };
  }
}
