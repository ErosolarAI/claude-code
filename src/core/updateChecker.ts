/**
 * Update Checker & Auto-Updater for agi-cli
 *
 * This module provides a FULLY NON-INTERACTIVE update system that does not
 * rely on stdin/raw mode, avoiding conflicts with the chat box input handling.
 *
 * Update behavior is controlled by user preferences:
 * - autoUpdate: true  -> Automatically update in background
 * - autoUpdate: false -> Silently skip updates
 * - autoUpdate: null  -> Show notification banner with instructions
 */

import { exec, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { theme } from '../ui/theme.js';

const execAsync = promisify(exec);

export interface UpdateInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
}

export interface AutoUpdateResult {
  attempted: boolean;
  updated: boolean;
  latestVersion?: string;
  command?: string;
  skippedReason?: string;
  error?: string;
}

export interface AutoUpdateState {
  lastCheck?: number;
  lastSeenLatest?: string;
  lastAttempt?: number;
  lastAttemptedVersion?: string;
  lastUpdatedVersion?: string;
}

type Logger = (message: string) => void;

let updateCheckCache: UpdateInfo | null = null;
let lastCheckTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

const AUTO_UPDATE_STATE_FILE = join(homedir(), '.agi', 'update-state.json');
const AUTO_UPDATE_RETRY_INTERVAL = 1000 * 60 * 60 * 6; // 6 hours between install attempts
const INSTALL_TIMEOUT_MS = 1000 * 60 * 2; // 2 minutes
const QUIET_PERIOD = 1000 * 60 * 60 * 2; // 2 hours after an attempt

/**
 * Check for updates from npm registry.
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo | null> {
  const now = Date.now();

  if (updateCheckCache && now - lastCheckTime < CACHE_DURATION) {
    return updateCheckCache;
  }

  try {
    const { stdout } = await execAsync('npm view agi-cli version', {
      timeout: 5000,
      encoding: 'utf8',
    });

    const latest = stdout.trim();
    const updateAvailable = compareVersions(latest, currentVersion) > 0;

    updateCheckCache = {
      current: currentVersion,
      latest,
      updateAvailable,
    };
    lastCheckTime = now;

    return updateCheckCache;
  } catch {
    // Silently fail - don't block startup for update checks
    return null;
  }
}

/**
 * Attempt to auto-update the CLI when a newer version is available.
 * This is throttled and disabled in CI/test environments or when explicitly opted out.
 */
export async function maybeAutoUpdate(
  currentVersion: string,
  options: { updateInfo?: UpdateInfo | null; logger?: Logger } = {}
): Promise<AutoUpdateResult | null> {
  const { enabled, reason } = resolveAutoUpdateEnabled();
  if (!enabled) {
    return {
      attempted: false,
      updated: false,
      skippedReason: reason ?? 'disabled',
    };
  }

  const now = Date.now();
  const state = readAutoUpdateState();

  if (state.lastAttempt && now - state.lastAttempt < AUTO_UPDATE_RETRY_INTERVAL) {
    return {
      attempted: false,
      updated: false,
      skippedReason: 'recent-attempt',
      latestVersion: state.lastSeenLatest,
    };
  }

  const updateInfo = options.updateInfo ?? (await checkForUpdates(currentVersion));
  if (!updateInfo) {
    return null;
  }

  writeAutoUpdateState({
    ...state,
    lastCheck: now,
    lastSeenLatest: updateInfo.latest,
  });

  if (!updateInfo.updateAvailable) {
    return {
      attempted: false,
      updated: false,
      skippedReason: 'up-to-date',
      latestVersion: updateInfo.latest,
    };
  }

  if (state.lastUpdatedVersion === updateInfo.latest) {
    return {
      attempted: false,
      updated: false,
      skippedReason: 'already-updated',
      latestVersion: updateInfo.latest,
    };
  }

  const command = resolveUpdateCommand();
  options.logger?.(
    theme.info(`Updating agi-cli to v${updateInfo.latest} (current v${updateInfo.current})...`)
  );

  try {
    await execAsync(command, {
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 4,
      env: {
        ...process.env,
        npm_config_loglevel: process.env['npm_config_loglevel'] ?? 'error',
      },
    });

    writeAutoUpdateState({
      ...state,
      lastCheck: now,
      lastSeenLatest: updateInfo.latest,
      lastAttempt: now,
      lastAttemptedVersion: updateInfo.latest,
      lastUpdatedVersion: updateInfo.latest,
    });

    options.logger?.(
      theme.success(`Auto-update complete. Restart agi to use v${updateInfo.latest}.`)
    );

    return {
      attempted: true,
      updated: true,
      latestVersion: updateInfo.latest,
      command,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    writeAutoUpdateState({
      ...state,
      lastCheck: now,
      lastSeenLatest: updateInfo.latest,
      lastAttempt: now,
      lastAttemptedVersion: updateInfo.latest,
    });

    options.logger?.(
      theme.warning(
        `Auto-update failed: ${message}. Run "${command}" manually if you want the latest build.`
      )
    );

    return {
      attempted: true,
      updated: false,
      latestVersion: updateInfo.latest,
      skippedReason: 'install-failed',
      error: message,
      command,
    };
  }
}

/**
 * Compare semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Format update notification message (legacy box format)
 */
export function formatUpdateNotification(updateInfo: UpdateInfo, note?: string): string {
  const width = 57;
  const border = '─'.repeat(width - 2);

  const padLine = (text: string, colorize: (value: string) => string = (v) => v): string => {
    const raw = text.length > width - 4 ? text.slice(0, width - 7) + '...' : text;
    const padding = ' '.repeat(Math.max(0, width - 4 - raw.length));
    return `${theme.warning('│')}  ${colorize(raw)}${padding}${theme.warning('│')}`;
  };

  const lines = [
    '',
    theme.warning(`╭${border}╮`),
    padLine('📦 Update Available!', theme.info),
    padLine(`Current: ${updateInfo.current}  →  Latest: ${updateInfo.latest}`, (text) => {
      return text
        .replace(updateInfo.current, theme.ui.muted(updateInfo.current))
        .replace(updateInfo.latest, theme.success(updateInfo.latest));
    }),
  ];

  if (note) {
    lines.push(padLine(note, theme.ui.muted));
  }

  lines.push(
    padLine('Run: npm install -g agi-cli@latest', theme.primary),
    theme.warning(`╰${border}╯`),
    ''
  );

  return lines.join('\n');
}

/**
 * Format a simple update notification banner (non-interactive).
 * Returns a string that can be displayed to the user.
 */
export function formatUpdateBanner(
  updateInfo: UpdateInfo,
  preference: 'auto' | 'skip' | 'ask'
): string {
  const lines: string[] = [];

  lines.push(
    theme.info(`Update available: ${theme.ui.muted(updateInfo.current)} → ${theme.success(updateInfo.latest)}`)
  );

  if (preference === 'auto') {
    lines.push(theme.ui.muted('  Auto-update enabled. Installing in background...'));
  } else if (preference === 'skip') {
    lines.push(theme.ui.muted('  Auto-update disabled. Run /update check to update manually.'));
  } else {
    lines.push(theme.ui.muted('  Run /update auto to enable auto-updates, or /update check to update now.'));
  }

  return lines.join('\n');
}

/**
 * Get the user's update decision based on their saved preference.
 * No interactive input required - purely preference-based.
 */
export function getUpdateDecision(autoUpdatePref: boolean | null): 'auto' | 'skip' | 'ask' {
  if (autoUpdatePref === true) return 'auto';
  if (autoUpdatePref === false) return 'skip';
  return 'ask';
}

/**
 * Check if we should show update notification (respects quiet period after recent attempts).
 */
export function shouldShowUpdateNotification(state: AutoUpdateState): boolean {
  const now = Date.now();

  if (state.lastAttempt && now - state.lastAttempt < QUIET_PERIOD) {
    return false;
  }

  return true;
}

function resolveAutoUpdateEnabled(): { enabled: boolean; reason?: string } {
  const disabledEnv = process.env['EROSOLAR_DISABLE_AUTO_UPDATE'];
  const autoEnv = process.env['EROSOLAR_AUTO_UPDATE'];

  const explicitDisable =
    parseBoolean(autoEnv) === false ||
    (typeof disabledEnv === 'string' && parseBoolean(disabledEnv) !== false);
  if (explicitDisable) {
    return { enabled: false, reason: 'disabled-by-env' };
  }

  if (process.env['CI'] === 'true' || process.env['CI'] === '1') {
    return { enabled: false, reason: 'ci' };
  }

  if (process.env['NODE_ENV'] === 'test' || process.env['JEST_WORKER_ID']) {
    return { enabled: false, reason: 'test' };
  }

  if (isRunningFromSource()) {
    return { enabled: false, reason: 'dev-mode' };
  }

  return { enabled: true };
}

function isRunningFromSource(): boolean {
  try {
    const filePath = new URL(import.meta.url).pathname;
    return filePath.includes('/src/');
  } catch {
    return false;
  }
}

function parseBoolean(value: string | undefined): boolean | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'n'].includes(normalized)) return false;
  return null;
}

/**
 * Read the auto-update state from disk.
 */
export function readAutoUpdateState(): AutoUpdateState {
  try {
    if (!existsSync(AUTO_UPDATE_STATE_FILE)) {
      return {};
    }
    const raw = readFileSync(AUTO_UPDATE_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return {
      lastCheck: typeof parsed.lastCheck === 'number' ? parsed.lastCheck : undefined,
      lastSeenLatest:
        typeof parsed.lastSeenLatest === 'string' && parsed.lastSeenLatest.trim()
          ? parsed.lastSeenLatest.trim()
          : undefined,
      lastAttempt: typeof parsed.lastAttempt === 'number' ? parsed.lastAttempt : undefined,
      lastAttemptedVersion:
        typeof parsed.lastAttemptedVersion === 'string' && parsed.lastAttemptedVersion.trim()
          ? parsed.lastAttemptedVersion.trim()
          : undefined,
      lastUpdatedVersion:
        typeof parsed.lastUpdatedVersion === 'string' && parsed.lastUpdatedVersion.trim()
          ? parsed.lastUpdatedVersion.trim()
          : undefined,
    };
  } catch {
    return {};
  }
}

function writeAutoUpdateState(state: AutoUpdateState): void {
  try {
    mkdirSync(join(homedir(), '.agi'), { recursive: true });
    writeFileSync(AUTO_UPDATE_STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Best-effort only
  }
}

function resolveUpdateCommand(): string {
  const override = process.env['EROSOLAR_UPDATE_COMMAND'];
  if (override && override.trim()) {
    return override.trim();
  }
  return 'npm install -g agi-cli@latest';
}

export interface UpdatePromptResult {
  choice: 'update' | 'skip';
  rememberChoice: boolean;
}

/**
 * DEPRECATED: Interactive prompts conflict with chat box input handling.
 * Use getUpdateDecision() for preference-based decisions instead.
 *
 * This function now returns skip without any interaction.
 * The interactive prompt has been removed to avoid stdin conflicts.
 */
export async function promptForUpdate(_updateInfo: UpdateInfo): Promise<UpdatePromptResult> {
  // Always skip - preferences should be used via getUpdateDecision() instead
  // This function is kept for backward compatibility but should not be used
  return { choice: 'skip', rememberChoice: false };
}

/**
 * Perform a background update without blocking the main process.
 * Spawns the update command in a detached process.
 */
export async function performBackgroundUpdate(
  updateInfo: UpdateInfo,
  logger?: (message: string) => void
): Promise<{ started: boolean; error?: string }> {
  const command = resolveUpdateCommand();

  logger?.(theme.info(`Updating agi-cli to v${updateInfo.latest} in background...`));

  try {
    // Parse command into executable and args
    const parts = command.split(/\s+/).filter(Boolean);
    const executable = parts[0];
    if (!executable) {
      throw new Error('Invalid update command');
    }
    const args = parts.slice(1);

    // Spawn detached process that continues after parent exits
    const child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        npm_config_loglevel: process.env['npm_config_loglevel'] ?? 'error',
      },
    });

    // Unref so parent can exit independently
    if (child.unref) {
      child.unref();
    }

    // Record that we started an update
    const state = readAutoUpdateState();
    writeAutoUpdateState({
      ...state,
      lastCheck: Date.now(),
      lastSeenLatest: updateInfo.latest,
      lastAttempt: Date.now(),
      lastAttemptedVersion: updateInfo.latest,
      // Don't set lastUpdatedVersion until we confirm success
    });

    logger?.(theme.ui.muted(`Update started. New version will be available on next launch.`));

    return { started: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger?.(theme.warning(`Background update failed to start: ${message}`));
    return { started: false, error: message };
  }
}

/**
 * Perform the update with progress feedback (blocking).
 */
export async function performUpdate(
  updateInfo: UpdateInfo,
  logger?: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  const command = resolveUpdateCommand();
  logger?.(theme.info(`Updating agi-cli to v${updateInfo.latest}...`));

  try {
    await execAsync(command, {
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 4,
      env: {
        ...process.env,
        npm_config_loglevel: process.env['npm_config_loglevel'] ?? 'error',
      },
    });

    const state = readAutoUpdateState();
    writeAutoUpdateState({
      ...state,
      lastCheck: Date.now(),
      lastSeenLatest: updateInfo.latest,
      lastAttempt: Date.now(),
      lastAttemptedVersion: updateInfo.latest,
      lastUpdatedVersion: updateInfo.latest,
    });

    logger?.(theme.success(`Updated to v${updateInfo.latest}. Restart agi to use the new version.`));
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger?.(theme.warning(`Update failed: ${message}`));
    logger?.(theme.ui.muted(`Run "${command}" manually to update.`));
    return { success: false, error: message };
  }
}
