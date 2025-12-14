
import type { ToolSuite } from '../../../core/toolRuntime.js';
import type { CapabilityContribution, CapabilityModule } from '../../../runtime/agentHost.js';
import type { ToolPlugin } from '../registry.js';
import { createSecureTaoTools } from '../../../tools/secureTaoTools.js';

class SecureTaoCapabilityModule implements CapabilityModule {
  id = 'tool.tao.secure';
  description = 'SECURE TAO tooling suite - Security patched';

  async create(): Promise<CapabilityContribution> {
    const { tools } = createSecureTaoTools();
    const toolSuite: ToolSuite = {
      id: 'tao.tools.secure',
      description: 'Secure offensive security tooling (patched)',
      tools,
    };

    return {
      id: this.id,
      description: this.description,
      toolSuite,
    };
  }
}

export function createSecureTaoToolPlugin(): ToolPlugin {
  return {
    id: 'tool.tao.secure',
    targets: ['universal'],
    create: () => new SecureTaoCapabilityModule(),
  };
}
