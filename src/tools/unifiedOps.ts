import type { ToolDefinition } from '../core/toolRuntime.js';
import { createFileTools } from './fileTools.js';
import { createEditTools } from './editTools.js';
import { createBashTools } from './bashTools.js';
import { createSearchTools } from './searchTools.js';
import { createWebTools } from './webTools.js';
import { createHumanOpsTools } from './humanOpsTools.js';
import { createGeneratorTools } from './generatorTools.js';

type ToolMap = Record<string, ToolDefinition>;

function buildToolMap(workingDir: string): { map: ToolMap; list: Array<{ name: string; description: string }> } {
  const toolSets = [
    createFileTools(workingDir),
    createEditTools(workingDir),
    createBashTools(workingDir),
    createSearchTools(workingDir),
    createWebTools(),
    createHumanOpsTools(),
    createGeneratorTools(),
  ];

  const map: ToolMap = {};
  const list: Array<{ name: string; description: string }> = [];

  for (const suite of toolSets) {
    for (const tool of suite) {
      if (!tool?.name) continue;
      // Prefer first occurrence to avoid surprising overrides
      if (map[tool.name]) continue;
      map[tool.name] = tool;
      list.push({ name: tool.name, description: tool.description || '' });
    }
  }

  return { map, list };
}

/**
 * UnifiedOps - a single entry point that routes to any core tool by name.
 * Useful for agents that want a stable meta-tool interface or to mix flows
 * (e.g., human-ops + generator + bash/search) without juggling suites.
 */
export function createUnifiedOpsTools(workingDir: string): ToolDefinition[] {
  const { map, list } = buildToolMap(workingDir);
  const toolNames = list.map((item) => item.name);

  const unified: ToolDefinition = {
    name: 'UnifiedOps',
    description:
      'Meta-tool that dispatches to any core tool by name (filesystem, edit, bash, search, web, human-ops, generator). Use tool="list" to see available tools.',
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: `Tool to run (${toolNames.join(', ')} or "list").`,
        },
        args: {
          type: 'object',
          description: 'Arguments for the chosen tool (matches the tool schema).',
        },
      },
      required: ['tool'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const toolName = typeof args['tool'] === 'string' ? args['tool'].trim() : '';
      if (!toolName) {
        return 'Error: tool is required. Use tool="list" to see options.';
      }

      if (toolName === 'list') {
        const entries = list.map((entry) => `- ${entry.name}: ${entry.description || ''}`).join('\n');
        return `Available tools:\n${entries}`;
      }

      const target = map[toolName];
      if (!target) {
        return `Error: unknown tool "${toolName}". Use tool="list" to see available tools.`;
      }

      const toolArgs =
        args['args'] && typeof args['args'] === 'object' && !Array.isArray(args['args'])
          ? (args['args'] as Record<string, unknown>)
          : {};

      try {
        const result = await target.handler(toolArgs);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `UnifiedOps error running "${toolName}": ${message}`;
      }
    },
  };

  return [unified];
}
