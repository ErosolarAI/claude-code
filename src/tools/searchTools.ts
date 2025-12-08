/**
 * Separate Search Tools for AI
 *
 * Provides individual, focused tools:
 * - Glob: File pattern matching
 * - Grep: Content search (regex)
 * - FindDefinition: Code definition finding
 *
 * Each tool has a clear, single purpose for better AI comprehension.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import type { ToolDefinition } from '../core/toolRuntime.js';
import { buildError } from '../core/errors.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', '.next', 'build', 'coverage',
  '.turbo', '.cache', '__pycache__', '.pytest_cache', '.venv', 'venv',
  '.agi',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.mp3', '.mp4', '.avi', '.mov', '.flv',
  '.woff', '.woff2', '.ttf', '.eot',
]);

const FILE_TYPE_MAP: Record<string, string[]> = {
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  ts: ['.ts', '.tsx'],
  py: ['.py'],
  rust: ['.rs'],
  go: ['.go'],
  java: ['.java'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
  c: ['.c', '.h'],
  ruby: ['.rb'],
  php: ['.php'],
  html: ['.html', '.htm'],
  css: ['.css', '.scss', '.sass', '.less'],
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  md: ['.md', '.markdown'],
  swift: ['.swift'],
  kotlin: ['.kt', '.kts'],
};

export function createSearchTools(workingDir: string): ToolDefinition[] {
  return [
    createGlobTool(workingDir),
    createGrepTool(workingDir),
    createFindDefinitionTool(workingDir),
  ];
}

// ============================================================================
// GLOB TOOL - File pattern matching
// ============================================================================

function createGlobTool(workingDir: string): ToolDefinition {
  return {
    name: 'Glob',
    description: 'Find files matching a glob pattern. Returns file paths sorted by modification time (newest first).',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.js", "*.json")',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (defaults to working directory)',
        },
        limit: {
          type: 'number',
          description: 'Maximum files to return (default: 20, max: 100)',
        },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const pattern = args['pattern'];
      if (typeof pattern !== 'string' || !pattern.trim()) {
        return 'Error: pattern is required';
      }

      const pathArg = args['path'];
      const limit = typeof args['limit'] === 'number' ? Math.min(args['limit'], 100) : 20;

      const searchPath = pathArg && typeof pathArg === 'string'
        ? resolvePath(workingDir, pathArg)
        : workingDir;

      try {
        return searchFiles(searchPath, workingDir, pattern, { limit });
      } catch (error) {
        return buildError('Glob', error, { pattern: String(pattern) });
      }
    },
  };
}

// ============================================================================
// GREP TOOL - Content search
// ============================================================================

function createGrepTool(workingDir: string): ToolDefinition {
  return {
    name: 'Grep',
    description: 'Search file contents for a regex pattern. Returns matching lines with file paths and line numbers.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for in file contents',
        },
        path: {
          type: 'string',
          description: 'Directory or file to search (defaults to working directory)',
        },
        type: {
          type: 'string',
          description: 'File type filter (js, ts, py, go, rust, java, cpp, etc.)',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.ts", "src/**/*.js")',
        },
        ignoreCase: {
          type: 'boolean',
          description: 'Case insensitive search (default: true)',
        },
        context: {
          type: 'number',
          description: 'Lines of context around each match (default: 0)',
        },
        limit: {
          type: 'number',
          description: 'Maximum matches to return (default: 20, max: 100)',
        },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const pattern = args['pattern'];
      if (typeof pattern !== 'string' || !pattern.trim()) {
        return 'Error: pattern is required';
      }

      const pathArg = args['path'];
      const fileType = args['type'];
      const globPattern = args['glob'];
      const ignoreCase = args['ignoreCase'] !== false; // default true
      const contextLines = typeof args['context'] === 'number' ? args['context'] : 0;
      const limit = typeof args['limit'] === 'number' ? Math.min(args['limit'], 100) : 20;

      const searchPath = pathArg && typeof pathArg === 'string'
        ? resolvePath(workingDir, pathArg)
        : workingDir;

      try {
        return searchContent(searchPath, workingDir, pattern, {
          ignoreCase,
          fileType: typeof fileType === 'string' ? fileType : undefined,
          globPattern: typeof globPattern === 'string' ? globPattern : undefined,
          contextLines,
          limit,
        });
      } catch (error) {
        return buildError('Grep', error, { pattern: String(pattern) });
      }
    },
  };
}

// ============================================================================
// FIND DEFINITION TOOL - Code structure search
// ============================================================================

function createFindDefinitionTool(workingDir: string): ToolDefinition {
  return {
    name: 'FindDefinition',
    description: 'Find code definitions (functions, classes, interfaces, types, constants) by name.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the definition to find (function, class, interface, etc.)',
        },
        type: {
          type: 'string',
          enum: ['function', 'class', 'interface', 'type', 'const', 'any'],
          description: 'Type of definition to find (default: "any")',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (defaults to working directory)',
        },
        limit: {
          type: 'number',
          description: 'Maximum definitions to return (default: 10, max: 50)',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const name = args['name'];
      if (typeof name !== 'string' || !name.trim()) {
        return 'Error: name is required';
      }

      const pathArg = args['path'];
      const defType = typeof args['type'] === 'string' ? args['type'] : 'any';
      const limit = typeof args['limit'] === 'number' ? Math.min(args['limit'], 50) : 10;

      const searchPath = pathArg && typeof pathArg === 'string'
        ? resolvePath(workingDir, pathArg)
        : workingDir;

      try {
        return searchDefinitions(searchPath, workingDir, name, {
          definitionType: defType,
          limit,
        });
      } catch (error) {
        return buildError('FindDefinition', error, { name: String(name) });
      }
    },
  };
}

// ============================================================================
// Utility functions
// ============================================================================

function resolvePath(workingDir: string, path: string): string {
  const normalized = path.trim();
  return normalized.startsWith('/') ? normalized : join(workingDir, normalized);
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<!GLOBSTAR!>')
    .replace(/\*/g, '[^/]*')
    .replace(/<!GLOBSTAR!>/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`${escaped}$`);
}

function matchesFileType(filePath: string, fileType: string): boolean {
  const ext = extname(filePath).toLowerCase();
  const extensions = FILE_TYPE_MAP[fileType.toLowerCase()];
  return extensions ? extensions.includes(ext) : false;
}

function matchesGlob(filePath: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(filePath);
}

function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function isCodeFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.swift', '.kt'];
  return codeExts.includes(ext);
}

// ============================================================================
// GLOB implementation
// ============================================================================

function searchFiles(
  searchPath: string,
  workingDir: string,
  pattern: string,
  options: { limit: number }
): string {
  const regex = globToRegex(pattern);
  const matches: Array<{ path: string; mtime: number }> = [];

  function walk(dir: string) {
    if (matches.length >= options.limit * 2) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (regex.test(fullPath)) {
          try {
            const stat = statSync(fullPath);
            matches.push({ path: fullPath, mtime: stat.mtimeMs });
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  walk(searchPath);

  // Sort by modification time (newest first)
  matches.sort((a, b) => b.mtime - a.mtime);

  const limited = matches.slice(0, options.limit);
  if (limited.length === 0) {
    return `No files matching: ${pattern}`;
  }

  const relativePaths = limited.map(m => {
    const rel = relative(workingDir, m.path);
    return rel && !rel.startsWith('..') ? rel : m.path;
  });

  let result = `${matches.length} file(s) matching "${pattern}"`;
  if (matches.length > options.limit) {
    result += ` (showing ${options.limit})`;
  }
  result += `:\n${relativePaths.join('\n')}`;

  return result;
}

// ============================================================================
// GREP implementation
// ============================================================================

interface ContentMatch {
  file: string;
  line: number;
  content: string;
}

function searchContent(
  searchPath: string,
  workingDir: string,
  pattern: string,
  options: {
    ignoreCase: boolean;
    fileType?: string;
    globPattern?: string;
    contextLines: number;
    limit: number;
  }
): string {
  const flags = options.ignoreCase ? 'gi' : 'g';
  const regex = new RegExp(pattern, flags);
  const matches: ContentMatch[] = [];
  const maxScan = options.limit * 3;

  function walk(dir: string) {
    if (matches.length >= maxScan) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (matches.length >= maxScan) break;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          searchFile(fullPath);
        }
      }
    } catch { /* skip */ }
  }

  function searchFile(filePath: string) {
    // Filter by type
    if (options.fileType && !matchesFileType(filePath, options.fileType)) return;
    if (options.globPattern && !matchesGlob(filePath, options.globPattern)) return;
    if (isBinary(filePath)) return;

    try {
      const stat = statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return;

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length && matches.length < maxScan; i++) {
        if (regex.test(lines[i]!)) {
          matches.push({
            file: filePath,
            line: i + 1,
            content: lines[i]!.trim(),
          });
        }
        regex.lastIndex = 0; // Reset for next test
      }
    } catch { /* skip */ }
  }

  walk(searchPath);

  if (matches.length === 0) {
    return `No matches for: ${pattern}`;
  }

  const limited = matches.slice(0, options.limit);
  const lines: string[] = [];

  for (const m of limited) {
    const relPath = relative(workingDir, m.file);
    const displayPath = relPath && !relPath.startsWith('..') ? relPath : m.file;
    lines.push(`${displayPath}:${m.line}: ${m.content}`);
  }

  let result = lines.join('\n');
  if (matches.length > options.limit) {
    result += `\n\n[${matches.length - options.limit} more matches, use limit parameter to see more]`;
  }

  return result;
}

// ============================================================================
// FIND DEFINITION implementation
// ============================================================================

function searchDefinitions(
  searchPath: string,
  workingDir: string,
  name: string,
  options: { definitionType: string; limit: number }
): string {
  const patterns: Record<string, string> = {
    function: `(function\\s+${name}|const\\s+${name}\\s*=.*=>|${name}\\s*\\([^)]*\\)\\s*\\{)`,
    class: `class\\s+${name}`,
    interface: `interface\\s+${name}`,
    type: `type\\s+${name}`,
    const: `const\\s+${name}`,
    any: `(function\\s+${name}|class\\s+${name}|interface\\s+${name}|type\\s+${name}|const\\s+${name})`,
  };

  const patternStr = patterns[options.definitionType] || patterns['any'];
  const regex = new RegExp(patternStr!, 'gi');
  const matches: ContentMatch[] = [];

  function walk(dir: string) {
    if (matches.length >= options.limit * 2) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (matches.length >= options.limit * 2) break;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (isCodeFile(fullPath)) {
          searchFile(fullPath);
        }
      }
    } catch { /* skip */ }
  }

  function searchFile(filePath: string) {
    try {
      const stat = statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return;

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length && matches.length < options.limit * 2; i++) {
        if (regex.test(lines[i]!)) {
          matches.push({
            file: filePath,
            line: i + 1,
            content: lines[i]!.trim(),
          });
        }
        regex.lastIndex = 0;
      }
    } catch { /* skip */ }
  }

  walk(searchPath);

  if (matches.length === 0) {
    return `No definitions found for: ${name}`;
  }

  const limited = matches.slice(0, options.limit);
  const lines: string[] = [];

  for (const m of limited) {
    const relPath = relative(workingDir, m.file);
    const displayPath = relPath && !relPath.startsWith('..') ? relPath : m.file;
    lines.push(`${displayPath}:${m.line}: ${m.content}`);
  }

  return lines.join('\n');
}

// Legacy export for backward compatibility
export { createSearchTools as createGrepTools };
