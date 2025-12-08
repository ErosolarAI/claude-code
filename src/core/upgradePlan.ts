import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoUpgradeModule, RepoUpgradePlan, RepoUpgradeStep } from './repoUpgradeOrchestrator.js';

/**
 * Build a repo-wide upgrade plan using common directories. Falls back to a single
 * catch-all module when no known scopes are found.
 */
export function buildRepoWidePlan(workspaceRoot: string, additionalScopes: string[] = []): RepoUpgradePlan {
  const normalizedScopes = normalizeScopes(additionalScopes);
  const areas: Array<{
    id: string;
    label: string;
    description: string;
    scope: string[];
    candidates: string[];
    codemodCommands?: string[];
    validationCommands?: string[];
  }> = [
    {
      id: 'source',
      label: 'Source',
      description: 'Core application and library code.',
      scope: ['src/**/*', 'lib/**/*'],
      candidates: ['src', 'lib'],
      codemodCommands: ['npx jscodeshift -t <transform> src'],
      validationCommands: ['npm run build', 'npm test'],
    },
    {
      id: 'tests',
      label: 'Tests',
      description: 'Unit, integration, and smoke tests.',
      scope: ['test/**/*', '__tests__/**/*'],
      candidates: ['test', '__tests__'],
      validationCommands: ['npm test -- --runInBand', 'npm run lint'],
    },
    {
      id: 'docs',
      label: 'Docs',
      description: 'Documentation and guides.',
      scope: ['docs/**/*', 'README.md'],
      candidates: ['docs', 'README.md'],
    },
    {
      id: 'scripts',
      label: 'Tooling Scripts',
      description: 'Build, migration, and maintenance scripts.',
      scope: ['scripts/**/*'],
      candidates: ['scripts'],
      validationCommands: ['npm run lint -- scripts/**/*.ts'],
    },
    {
      id: 'agents',
      label: 'Agents',
      description: 'Agent rules and behaviors.',
      scope: ['agents/**/*'],
      candidates: ['agents'],
      validationCommands: ['npm run build'],
    },
    {
      id: 'skills',
      label: 'Skills',
      description: 'Skill packs and reusable automation.',
      scope: ['skills/**/*'],
      candidates: ['skills'],
      validationCommands: ['npm run build'],
    },
    {
      id: 'examples',
      label: 'Examples',
      description: 'Example flows and templates.',
      scope: ['examples/**/*'],
      candidates: ['examples'],
    },
    {
      id: 'configs',
      label: 'Configuration',
      description: 'Configuration and deployment settings.',
      scope: ['config/**/*', '*.config.*', '*.rc', '*.json'],
      candidates: ['config'],
    },
  ];

  const modules: RepoUpgradeModule[] = [];
  const workspaceModules = detectWorkspaceModules(workspaceRoot);

  // When scopes are provided, build a targeted plan instead of sweeping the repo.
  if (normalizedScopes.length) {
    for (const scope of normalizedScopes) {
      modules.push(buildCustomScopeModule(scope));
    }

    for (const module of workspaceModules) {
      if (moduleMatchesRequestedScopes(module.scope, normalizedScopes)) {
        modules.push(module);
      }
    }

    const deduped = dedupeModules(modules);
    if (deduped.length === 0) {
      deduped.push(buildCustomScopeModule(normalizedScopes[0] ?? 'repo'));
    }

    return { modules: deduped };
  }

  modules.push(...workspaceModules);

  for (const area of areas) {
    const matches = area.candidates.some((candidate) => existsSync(join(workspaceRoot, candidate)));
    if (!matches) {
      continue;
    }
    modules.push({
      id: area.id,
      label: area.label,
      description: area.description,
      scope: area.scope,
      codemodCommands: area.codemodCommands,
      validationCommands: area.validationCommands,
      steps: buildDefaultSteps(area.id),
    });
  }

  if (modules.length === 0) {
    modules.push({
      id: 'repo-wide',
      label: 'Repository',
      description: 'Fallback repo-wide upgrade module.',
      scope: ['**/*'],
      steps: buildDefaultSteps('repo'),
    });
  }

  return { modules };
}

export function detectWorkspaceModules(workspaceRoot: string): RepoUpgradeModule[] {
  const pkgPath = join(workspaceRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    return [];
  }

  let workspaces: string[] = [];
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    workspaces = parseWorkspaceField(pkg?.workspaces);
  } catch {
    return [];
  }

  if (!workspaces.length) {
    return [];
  }

  const modules: RepoUpgradeModule[] = [];
  const seen = new Set<string>();

  for (const pattern of workspaces) {
    const paths = expandWorkspacePattern(workspaceRoot, pattern);
    for (const relPath of paths) {
      if (seen.has(relPath)) {
        continue;
      }
      seen.add(relPath);

      const cleanPath = relPath.replace(/\/+$/, '');
      const name = cleanPath.split('/').filter(Boolean).pop() ?? cleanPath;
      const normalizedPath = cleanPath.replace(/[/\\]+/g, '-');
      const slug = `workspace-${normalizedPath.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase() || 'default'}`;

      modules.push({
        id: slug,
        label: `Workspace: ${name}`,
        description: `Upgrade tasks scoped to workspace "${name}" (${cleanPath}).`,
        scope: [`${cleanPath}/**/*`],
        validationCommands: [
          `npm test --workspace ${name} --if-present`,
          `npm run lint --workspace ${name} --if-present`,
        ],
        steps: buildDefaultSteps(slug),
      });
    }
  }

  return modules;
}

export function parseWorkspaceField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    const record = value as { packages?: unknown };
    if (Array.isArray(record.packages)) {
      return record.packages.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
    }
  }
  return [];
}

export function expandWorkspacePattern(workspaceRoot: string, pattern: string): string[] {
  const normalized = pattern.trim();
  if (!normalized) return [];

  if (!normalized.includes('*')) {
    const target = join(workspaceRoot, normalized);
    return existsSync(target) ? [normalized] : [];
  }

  const base = normalized.split('*')[0]?.replace(/\/+$/, '') ?? '';
  if (!base) return [];

  const baseDir = join(workspaceRoot, base);
  if (!existsSync(baseDir)) return [];

  try {
    const entries = readdirSync(baseDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => `${base}/${entry.name}`);
  } catch {
    return [];
  }
}

export function buildDefaultSteps(moduleId: string): RepoUpgradeStep[] {
  return [
    {
      id: `${moduleId}-analyze`,
      intent: 'analyze',
      description: `Map the upgrade surface for ${moduleId}. Identify risky files and coupling.`,
      prompt:
        'Inventory core runtime/orchestration/session/tool IO paths first. DO NOT run any build/test/lint/package/dependency tooling (tsc, npm/yarn/pnpm, gradle, maven, go test, cargo, make, bazel, etc.) during analyze; read code and trace critical flows instead. Defer typing/import/build/toolchain hygiene until the verify step.',
    },
    {
      id: `${moduleId}-upgrade`,
      intent: 'upgrade',
      description: `Apply modular upgrades for ${moduleId} with minimal blast radius.`,
      prompt:
        'Execute targeted edits starting with core architectural logic. Forbidden during upgrade: build/test/lint/dependency installs or language-toolchain commands of any stack (tsc, npm/yarn/pnpm, gradle, maven, go test/build, cargo, make, bazel, etc.). Only touch typing/import/build/lint when it unblocks core logic. Keep edits small, atomic, and scoped.',
    },
    {
      id: `${moduleId}-verify`,
      intent: 'verify',
      description: `Validate ${moduleId} after the upgrade.`,
      prompt:
        'Only now run validation: TypeScript checks, tests, lint, and package validation relevant to this scope. Summarize residual risks.',
    },
  ];
}

function normalizeScopeValue(scope: string): string {
  return scope.replace(/^[./\\]+/, '').replace(/[/\\]+$/, '').trim();
}

function normalizeScopes(scopes: string[]): string[] {
  return scopes.map(normalizeScopeValue).filter(Boolean);
}

function stripGlob(scope: string): string {
  return scope.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\[[^\]]*]/g, '').replace(/[/\\]+$/, '');
}

function moduleMatchesRequestedScopes(moduleScope: string[], requestedScopes: string[]): boolean {
  if (!requestedScopes.length) return true;
  const normalizedModuleScopes = moduleScope
    .map((scope) => normalizeScopeValue(stripGlob(scope)))
    .filter(Boolean);

  return requestedScopes.some((requested) =>
    normalizedModuleScopes.some(
      (modulePath) =>
        modulePath === requested ||
        modulePath.startsWith(`${requested}/`) ||
        requested.startsWith(`${modulePath}/`)
    )
  );
}

function buildCustomScopeModule(scope: string): RepoUpgradeModule {
  const slug = scope.replace(/[^\w]/g, '-').toLowerCase() || 'custom';
  return {
    id: `custom-${slug}`,
    label: `Custom: ${scope}`,
    description: `User-specified scope: ${scope}`,
    scope: [`${scope}/**/*`],
    validationCommands: ['npm run build', 'npm test'],
    steps: buildDefaultSteps(`custom-${slug}`),
  };
}

function dedupeModules(modules: RepoUpgradeModule[]): RepoUpgradeModule[] {
  const seen = new Set<string>();
  const result: RepoUpgradeModule[] = [];
  for (const module of modules) {
    if (seen.has(module.id)) continue;
    seen.add(module.id);
    result.push(module);
  }
  return result;
}
