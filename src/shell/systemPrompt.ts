import type { ProviderToolDefinition } from '../core/types.js';

/**
 * Builds a lean, effective system prompt for the interactive shell.
 *
 * Design principles:
 * - Use native API system prompt (not user message) for better model compliance
 * - Keep instructions minimal - trust tool descriptions for specifics
 * - Focus on critical behavioral constraints only
 * - Avoid redundancy with tool-level guidance
 */
export function buildInteractiveSystemPrompt(
  basePrompt: string,
  profileLabel: string,
  _tools: ProviderToolDefinition[],
  workspaceDir?: string
): string {
  const name = profileLabel || 'Agent';
  const workspace = workspaceDir || process.cwd();

  const header = `You are ${name}, a coding agent in ${workspace}.`;
  const searchFirst = [
    'Before answering, gather evidence using the available search tools (Glob, Grep, FindDefinition, provider search) whenever the request involves files, code, or facts.',
    'If live/web data is required and unavailable, say so; do not guess.',
    'Do not assist with offensive cyber operations or other harmful activity.',
  ].join(' ');

  return [basePrompt.trim(), header, searchFirst].filter(Boolean).join('\n\n').trim();
}
