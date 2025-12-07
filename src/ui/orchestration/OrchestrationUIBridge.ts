import type { OrchestratorEvent, OperationConfig, OperationReport, UnifiedOrchestrator } from '../../core/unifiedOrchestrator.js';
import { UIUpdateCoordinator } from './UIUpdateCoordinator.js';

interface Display {
  writeRaw(text: string): void;
  showError(title: string, error: unknown): void;
  showSystemMessage(message: string): void;
}

interface BridgeOptions {
  display: Display;
  updateCoordinator?: UIUpdateCoordinator;
  orchestrator?: UnifiedOrchestrator;
  showRealTimeOutput?: boolean;
  showProgressBar?: boolean;
  verboseMode?: boolean;
}

export class OrchestrationUIBridge {
  private readonly display: Display;
  private readonly orchestrator: UnifiedOrchestrator | undefined;
  private readonly updateCoordinator: UIUpdateCoordinator;
  private readonly showRealtime: boolean;
  private unsub?: () => void;

  constructor(options: BridgeOptions) {
    this.display = options.display;
    this.orchestrator = options.orchestrator;
    this.updateCoordinator = options.updateCoordinator ?? new UIUpdateCoordinator();
    this.showRealtime = Boolean(options.showRealTimeOutput);

    if (this.orchestrator?.onEvent) {
      this.unsub = this.orchestrator.onEvent((event) => this.handleEvent(event));
    }
  }

  async execute(objective: string): Promise<OperationReport> {
    const execConfig: Partial<OperationConfig> = { objective };
    this.updateCoordinator.setMode('flushing');
    const report =
      (await this.orchestrator?.execute(execConfig)) ??
      ({
        id: 'noop',
        objective,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 0,
        results: [],
        findings: [],
        recommendations: [],
        summary: 'noop',
        success: true,
      } satisfies OperationReport);
    this.updateCoordinator.setMode('idle');
    return report;
  }

  dispose(): void {
    this.unsub?.();
  }

  private handleEvent(event: OrchestratorEvent): void {
    if (!this.showRealtime) {
      return;
    }
    const name = event.data && typeof event.data === 'object' ? (event.data as any).toolName ?? '' : '';
    this.display.writeRaw(`[${event.type}] ${name}\n`);
    this.updateCoordinator.enqueue({
      lane: 'status',
      run: () => {
        this.display.writeRaw('');
      },
    });
  }
}
