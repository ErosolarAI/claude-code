import { registerToolPlugin } from './registry.js';
import { createLocalFilesystemToolPlugin } from './filesystem/localFilesystemPlugin.js';
import { createEditToolPlugin } from './edit/editPlugin.js';
import { createLocalSearchToolPlugin } from './search/localSearchPlugin.js';
import { createLocalBashToolPlugin } from './bash/localBashPlugin.js';
import { createEnhancedGitToolPlugin } from './enhancedGit/enhancedGitPlugin.js';
import { createSecureTaoToolPlugin } from './tao/secureTaoPlugin.js';
import { createDependencyManagementToolPlugin } from './dependencyManagement/dependencyManagementPlugin.js';
// Commented out for build compatibility - these plugins have placeholder implementations
// import { zeroDayDiscoveryPlugin } from './zeroDayDiscoveryPlugin.js';
// import { universalAttackPlugin } from './universalAttackPlugin.js';

let registered = false;

/**
 * Register default Node.js tool plugins
 *
 * Core plugins:
 * - filesystem: Read files
 * - edit: Edit files
 * - search: Unified search (files, content, definitions)
 * - bash: Execute commands
 * - enhanced-git: Git operations
 * - secure-tao: Secure security tooling
 */
export function registerDefaultNodeToolPlugins(): void {
  if (registered) return;

    registerToolPlugin(createLocalFilesystemToolPlugin());
    registerToolPlugin(createEditToolPlugin());
    registerToolPlugin(createLocalSearchToolPlugin());
    registerToolPlugin(createLocalBashToolPlugin());
    registerToolPlugin(createEnhancedGitToolPlugin());
    registerToolPlugin(createSecureTaoToolPlugin());

    // Register advanced security plugins
    // registerToolPlugin(zeroDayDiscoveryPlugin);
    // registerToolPlugin(universalAttackPlugin);

    registered = true;
}
