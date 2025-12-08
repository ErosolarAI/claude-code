import { createUniversalRuntime, type UniversalRuntime, type UniversalRuntimeOptions } from './universal.js';
import type { CapabilityModule } from './agentHost.js';
import {
  FilesystemCapabilityModule,
  EditCapabilityModule,
  BashCapabilityModule,
  SearchCapabilityModule,
  WebCapabilityModule,
  HumanCapabilityModule,
  GeneratorCapabilityModule,
} from '../capabilities/index.js';

export interface NodeRuntimeOptions
  extends Omit<UniversalRuntimeOptions, 'additionalModules'> {
  additionalModules?: CapabilityModule[];
}

/**
 * Create core Node.js capability modules for the CLI.
 */
function createNodeCapabilityModules(): CapabilityModule[] {
  return [
    new FilesystemCapabilityModule(),
    new EditCapabilityModule(),
    new BashCapabilityModule(),
    new SearchCapabilityModule(),
    new WebCapabilityModule(),
    new HumanCapabilityModule(),
    new GeneratorCapabilityModule(),
    // Note: GlobCapabilityModule removed - it's deprecated and duplicates the Search tool from SearchCapabilityModule
  ];
}

export async function createNodeRuntime(options: NodeRuntimeOptions): Promise<UniversalRuntime> {
  const coreModules = createNodeCapabilityModules();
  const additionalModules = options.additionalModules ?? [];

  return createUniversalRuntime({
    ...options,
    additionalModules: [...coreModules, ...additionalModules],
  });
}
