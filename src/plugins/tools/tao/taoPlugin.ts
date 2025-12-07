import type { ToolSuite } from '../../../core/toolRuntime.js';
import type { CapabilityContribution, CapabilityModule } from '../../../runtime/agentHost.js';
import type { ToolPlugin } from '../registry.js';
import { createTaoTools } from '../../../tools/taoTools.js';

class TaoCapabilityModule implements CapabilityModule {
  id = 'tool.tao';
  description = 'TAO tooling suite';

  async create(): Promise<CapabilityContribution> {
    const { tools } = createTaoTools();
    const toolSuite: ToolSuite = {
      id: 'tao.tools',
      description: 'Offensive tooling (simulated)',
      tools,
    };

    return {
      id: this.id,
      description: this.description,
      toolSuite,
    };
  }
}

export function createTaoToolPlugin(): ToolPlugin {
  return {
    id: 'tool.tao',
    targets: ['universal'],
    create: () => new TaoCapabilityModule(),
  };
}
