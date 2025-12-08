import { EventEmitter } from 'node:events';
import { OrchestrationUIBridge } from '../src/ui/orchestration/OrchestrationUIBridge.js';
import { UIUpdateCoordinator } from '../src/ui/orchestration/UIUpdateCoordinator.js';
import type {
  ExecutionResult,
  Finding,
  OperationConfig,
  OperationReport,
  OrchestratorEvent,
} from '../src/core/unifiedOrchestrator.js';

// Mock renderer that implements the interface expected by OrchestrationUIBridge
class FakeRenderer {
  writes: string[] = [];
  writeRaw(text: string): void {
    this.writes.push(text);
  }
  showError(_title: string, _error: unknown): void {}
  showSystemMessage(_message: string): void {}
}

class FakeOrchestrator extends EventEmitter {
  executeCalls = 0;
  objectives: string[] = [];
  private readonly results: ExecutionResult[];
  private readonly findings: Finding[];

  constructor(results: ExecutionResult[] = [], findings: Finding[] = []) {
    super();
    this.results = results;
    this.findings = findings;
  }

  async execute(config: Partial<OperationConfig>): Promise<OperationReport> {
    this.executeCalls++;
    if (config.objective) {
      this.objectives.push(config.objective);
    }

    const start = Date.now();

    this.emitEvent({
      type: 'tool:start',
      timestamp: start,
      data: { toolId: '1', toolName: 'test', description: 'running', index: 1 },
    });
    this.emitEvent({
      type: 'tool:complete',
      timestamp: start + 5,
      data: { toolId: '1', toolName: 'test', success: true, output: 'ok', duration: 5 },
    });

    const end = start + 10;
    return {
      id: 'fake',
      objective: config.objective ?? '',
      startTime: start,
      endTime: end,
      duration: end - start,
      results: this.results,
      findings: this.findings,
      summary: 'ok',
      success: true,
    };
  }

  onEvent(callback: (event: OrchestratorEvent) => void): () => void {
    this.on('orchestrator:event', callback);
    return () => this.off('orchestrator:event', callback);
  }

  getResults(): ExecutionResult[] {
    return this.results;
  }

  getFindings(): Finding[] {
    return this.findings;
  }

  analyze(): Finding[] {
    return [];
  }

  exec(command: string): Promise<ExecutionResult> {
    return Promise.resolve({ success: true, output: '', duration: 0, command });
  }

  private emitEvent(event: OrchestratorEvent): void {
    this.emit('orchestrator:event', event);
  }
}

describe('OrchestrationUIBridge with external wiring', () => {
  test('reuses provided orchestrator and leaves shared coordinator active', async () => {
    const coordinator = new UIUpdateCoordinator();
    const renderer = new FakeRenderer();
    const orchestrator = new FakeOrchestrator([
      { success: true, output: 'ok', duration: 5, command: 'echo ok' },
    ]);

    const bridge = new OrchestrationUIBridge({
      renderer: renderer as any,
      updateCoordinator: coordinator,
      orchestrator,
      showRealTimeOutput: false,
      showProgressBar: false,
      verboseMode: false,
    });

    const report = await bridge.execute('demo objective');

    expect(report.success).toBe(true);
    expect(orchestrator.executeCalls).toBe(1);
    expect(orchestrator.objectives).toContain('demo objective');
    expect(coordinator.getMode()).toBe('idle');

    bridge.dispose();

    const executed: string[] = [];
    coordinator.enqueue({
      lane: 'status',
      run: () => executed.push('after'),
    });
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(coordinator.isDisposed()).toBe(false);
    expect(executed).toEqual(['after']);
  });
});
