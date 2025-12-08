/**
 * Human Integration Capability
 *
 * Provides the HumanIntegration tool for escalating tasks that require a human
 * (browser/captcha/manual QA/external builds). Records structured hand-off
 * files in .agi/human-ops by default (overridable via AGI_HUMAN_TASK_DIR).
 */

import type { CapabilityContribution, CapabilityContext, CapabilityModule } from '../runtime/agentHost.js';
import { createHumanOpsTools } from '../tools/humanOpsTools.js';

export class HumanCapabilityModule implements CapabilityModule {
  readonly id = 'capability.human-integration';

  async create(_context: CapabilityContext): Promise<CapabilityContribution> {
    return {
      id: 'human.integration',
      description: 'Escalate tasks to human operators (browser/captcha/manual build/QA).',
      toolSuite: {
        id: 'human-ops',
        description: 'Human-in-the-loop task capture and handoff.',
        tools: createHumanOpsTools(),
      },
      metadata: {
        pluginId: 'tool.human.integration',
      },
    };
  }
}
