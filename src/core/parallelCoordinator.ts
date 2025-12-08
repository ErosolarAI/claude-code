import { ParallelExecutor, createTask, type ParallelTask, type BatchResult } from './parallelExecutor.js';
import type { UpgradeModuleReport, RepoUpgradeMode, RepoUpgradeModeDefinition, VariantWinStats, RepoUpgradeModule } from './repoUpgradeOrchestrator.js';

export interface ParallelCoordinatorOptions {
  concurrency: number;
  mode: RepoUpgradeMode;
  modeDefinition: RepoUpgradeModeDefinition;
  parallelVariants: boolean;
  continueOnFailure: boolean;
  variantStats: VariantWinStats;
  processModule: (module: RepoUpgradeModule) => Promise<UpgradeModuleReport>;
  emit: (event: { type: string; timestamp: number; data: Record<string, unknown> }) => void;
}

export interface ParallelRunner {
  execute(tasks: ParallelTask<UpgradeModuleReport>[]): Promise<BatchResult<UpgradeModuleReport>>;
}

export class ParallelCoordinator {
  private readonly runnerFactory: (concurrency: number, emit: ParallelCoordinatorOptions['emit']) => ParallelRunner;

  constructor(
    runnerFactory?: (concurrency: number, emit: ParallelCoordinatorOptions['emit']) => ParallelRunner
  ) {
    this.runnerFactory =
      runnerFactory ??
      ((concurrency, emit) =>
        new ParallelExecutor({
          maxConcurrency: Math.max(1, concurrency),
          continueOnFailure: true,
          onTaskEvent: (event) =>
            emit({
              type: `parallel.${event.type}`,
              timestamp: event.timestamp,
              data: event.data ?? {},
            }),
        }));
  }

  async runModules(options: ParallelCoordinatorOptions, modules: RepoUpgradeModule[]): Promise<UpgradeModuleReport[]> {
    const { concurrency, emit, processModule } = options;
    const continueOnFailure = options.continueOnFailure;

    emit({
      type: 'upgrade.parallel.start',
      timestamp: Date.now(),
      data: { moduleCount: modules.length, concurrency },
    });

    const tasks: ParallelTask<UpgradeModuleReport>[] = modules.map((module) =>
      createTask(
        `module:${module.id}`,
        async () => processModule(module),
        {
          label: module.label,
          parallelizable: true,
          group: 'modules',
        }
      )
    );

    const runner = this.runnerFactory(concurrency, emit);
    const batchResult = await runner.execute(tasks);

    emit({
      type: 'upgrade.parallel.complete',
      timestamp: Date.now(),
      data: {
        totalDurationMs: batchResult.totalDurationMs,
        successCount: batchResult.successCount,
        failureCount: batchResult.failureCount,
        parallelismAchieved: batchResult.parallelismAchieved,
      },
    });

    const moduleReports: UpgradeModuleReport[] = [];
    for (const result of batchResult.results) {
      if (result.status === 'completed' && result.result) {
        moduleReports.push(result.result);
      } else {
        const moduleId = result.taskId.replace('module:', '');
        const module = modules.find((m) => m.id === moduleId);
        moduleReports.push({
          id: moduleId,
          label: module?.label ?? moduleId,
          scope: module?.scope ?? [],
          steps: [],
          status: 'failed',
        });
      }
    }

    if (!continueOnFailure) {
      const firstFailure = moduleReports.findIndex((report) => report.status === 'failed');
      if (firstFailure >= 0) {
        return moduleReports.slice(0, firstFailure + 1);
      }
    }

    return moduleReports;
  }
}
