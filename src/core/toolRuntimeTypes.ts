import type { JSONSchemaObject, ProviderId, ToolCallRequest } from './types.js';
import type { ContextManager } from './contextManager.js';
import type { PreflightWarning } from './toolPreconditions.js';

export interface ToolExecutionContext {
  readonly profileName: string;
  readonly provider: ProviderId;
  readonly model: string;
  readonly workspaceContext?: string | null;
}

export interface ToolRuntimeObserver<T extends Record<string, unknown> = Record<string, unknown>> {
  onToolStart?(call: ToolCallRequest & { args: T }): void;
  onToolResult?(call: ToolCallRequest & { args: T }, output: string): void;
  onToolError?(call: ToolCallRequest & { args: T }, error: string): void;
  onCacheHit?(call: ToolCallRequest & { args: T }): void;
  onToolProgress?(call: ToolCallRequest & { args: T }, progress: ToolProgressUpdate): void;
  onToolWarning?(call: ToolCallRequest & { args: T }, warning: PreflightWarning | string): void;
}

export interface ToolRuntimeOptions {
  readonly observer?: ToolRuntimeObserver;
  readonly enableCache?: boolean;
  readonly cacheTTLMs?: number;
  readonly contextManager?: ContextManager;
  readonly io?: ToolExecutionIO;
  readonly snapshotDir?: string;
}

export type ToolHandler<T extends Record<string, unknown> = Record<string, unknown>> = (
  args: T
) => Promise<string> | string;

export interface ToolDefinition<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  readonly parameters?: JSONSchemaObject;
  readonly handler: ToolHandler<T>;
  readonly cacheable?: boolean;
  readonly cacheTtlMs?: number;
}

export interface ToolSuite {
  readonly id: string;
  readonly description?: string;
  readonly tools: readonly ToolDefinition[];
}

export interface ToolExecutionStore {
  call: ToolCallRequest & { args: Record<string, unknown> };
  observer?: ToolRuntimeObserver;
}

export interface CacheEntry {
  result: string;
  timestamp: number;
}

export interface ToolHistoryEntry {
  toolName: string;
  args: Record<string, unknown>;
  timestamp: number;
  success: boolean;
  hasOutput: boolean;
  error?: string;
}

export interface DiffSnapshotRecord {
  command: string;
  output: string;
  timestamp: number;
}

export interface ToolProgressUpdate {
  current: number;
  total?: number;
  message?: string;
}

export interface ToolExecutionIO {
  root?: string;
  ensureDir?(path: string): void | Promise<void>;
  readFile(path: string): string | Promise<string>;
  writeFile(path: string, content: string): void | Promise<void>;
  deleteFile?(path: string): void | Promise<void>;
  exists?(path: string): boolean | Promise<boolean>;
  listFiles?(path: string): string[] | Promise<string[]>;
}
