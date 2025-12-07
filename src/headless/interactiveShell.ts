/**
 * Interactive Shell - Full interactive CLI experience with rich UI.
 *
 * Usage:
 *   agi                    # Start interactive shell
 *   agi "initial prompt"   # Start with initial prompt
 *
 * Features:
 * - Rich terminal UI with status bar
 * - Command history
 * - Streaming responses
 * - Tool execution display
 * - Ctrl+C to interrupt
 */

import { stdin, stdout, exit } from 'node:process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec as childExec } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import gradientString from 'gradient-string';
import type { ProfileName, ResolvedProfileConfig } from '../config.js';
import { resolveProfileConfig } from '../config.js';
import { hasAgentProfile, listAgentProfiles } from '../core/agentProfiles.js';
import { createAgentController, type AgentController } from '../runtime/agentController.js';
import { resolveWorkspaceCaptureOptions, buildWorkspaceContext } from '../workspace.js';
import { loadAllSecrets, listSecretDefinitions, setSecretValue, getSecretValue, type SecretName } from '../core/secretStore.js';
import { PromptController } from '../ui/PromptController.js';
import { getConfiguredProviders, quickCheckProviders, type QuickProviderStatus } from '../core/modelDiscovery.js';
import { saveModelPreference } from '../core/preferences.js';
import { setDebugMode, debugSnippet, logDebug } from '../utils/debugLogger.js';
import type { AgentEventUnion } from '../contracts/v1/agent.js';
import type { ProviderId } from '../core/types.js';
import type { RepoUpgradeMode, RepoUpgradeReport } from '../core/repoUpgradeOrchestrator.js';
import { runRepoUpgradeFlow } from '../orchestration/repoUpgradeRunner.js';

const exec = promisify(childExec);
import { ensureNextSteps } from '../core/finalResponseFormatter.js';

let cachedVersion: string | null = null;

// Get version from package.json
function getVersion(): string {
  if (cachedVersion) return cachedVersion;

  try {
    const __filename = fileURLToPath(import.meta.url);
    const pkgPath = resolve(dirname(__filename), '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    cachedVersion = pkg.version || '0.0.0';
    return cachedVersion;
  } catch {
    return '0.0.0';
  }
}

// ASCII art banner for AGI - compact version with wider chrome
const AGI_BANNER = `
  ╭───────────────────────────────────────────────╮
  │  ◉ ◉ ◉   A G I   C O R E   ◉ ◉ ◉  │
  ╰───────────────────────────────────────────────╯
`;

const BANNER_GRADIENT = gradientString(['#0EA5E9', '#6366F1', '#EC4899', '#FBBF24']);
const BANNER_GLOW = gradientString(['#22D3EE', '#A855F7', '#F472B6']);
const AGI_GLOW_BAR = '▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁';
const AGI_BANNER_LINES = AGI_BANNER.trim().split('\n');
const AGI_BANNER_RENDERED = AGI_BANNER_LINES.map(line => BANNER_GRADIENT(line)).join('\n');
const AGI_GLOW_RENDERED = BANNER_GLOW(`  ${AGI_GLOW_BAR}`);

export interface InteractiveShellOptions {
  argv: string[];
}

interface ParsedArgs {
  profile?: string;
  initialPrompt?: string | null;
}

/**
 * Run the fully interactive shell with rich UI.
 */
export async function runInteractiveShell(options: InteractiveShellOptions): Promise<void> {
  // Ensure TTY for interactive mode
  if (!stdin.isTTY || !stdout.isTTY) {
    console.error('Interactive mode requires a TTY. Use agi -q "prompt" for non-interactive mode.');
    exit(1);
  }

  loadAllSecrets();

  const parsed = parseArgs(options.argv);
  const profile = resolveProfile(parsed.profile);
  const workingDir = process.cwd();

  const workspaceOptions = resolveWorkspaceCaptureOptions(process.env);
  const workspaceContext = buildWorkspaceContext(workingDir, workspaceOptions);

  // Resolve profile config for model info
  const profileConfig = resolveProfileConfig(profile, workspaceContext);

  // Create agent controller
  const controller = await createAgentController({
    profile,
    workingDir,
    workspaceContext,
    env: process.env,
  });

  // Create the interactive shell instance
  const shell = new InteractiveShell(controller, profile, profileConfig, workingDir);

  // Handle initial prompt if provided
  if (parsed.initialPrompt) {
    shell.queuePrompt(parsed.initialPrompt);
  }

  await shell.run();
}

class InteractiveShell {
  private readonly controller: AgentController;
  private readonly profile: ProfileName;
  private profileConfig: ResolvedProfileConfig;
  private readonly workingDir: string;
  private promptController: PromptController | null = null;
  private isProcessing = false;
  private shouldExit = false;
  private pendingPrompts: string[] = [];
  private debugEnabled = false;
  private ctrlCCount = 0;
  private lastCtrlCTime = 0;
  private cachedProviders: QuickProviderStatus[] | null = null;
  private secretInputMode: { active: boolean; secretId: SecretName | null; queue: SecretName[] } = {
    active: false,
    secretId: null,
    queue: [],
  };
  private currentResponseBuffer = '';
  private preferredUpgradeMode: RepoUpgradeMode = 'single-continuous';

  constructor(controller: AgentController, profile: ProfileName, profileConfig: ResolvedProfileConfig, workingDir: string) {
    this.controller = controller;
    this.profile = profile;
    this.profileConfig = profileConfig;
    this.workingDir = workingDir;
    // Pre-fetch provider status in background
    void this.fetchProviders();
  }

  private async fetchProviders(): Promise<void> {
    try {
      this.cachedProviders = await quickCheckProviders();
    } catch {
      this.cachedProviders = [];
    }
  }

  queuePrompt(prompt: string): void {
    this.pendingPrompts.push(prompt);
  }

  async run(): Promise<void> {
    this.promptController = new PromptController(
      stdin as NodeJS.ReadStream,
      stdout as NodeJS.WriteStream,
      {
        onSubmit: (text) => this.handleSubmit(text),
        onQueue: (text) => this.queuePrompt(text),
        onInterrupt: () => this.handleInterrupt(),
        onExit: () => this.handleExit(),
        onCtrlC: (info) => this.handleCtrlC(info),
        onToggleDualRl: () => this.handleDualRlToggle(),
      }
    );

    // Start the UI
    this.promptController.start();
    this.applyDebugState(this.debugEnabled);

    // Set initial status
    this.promptController.setChromeMeta({
      profile: this.profile,
      directory: this.workingDir,
    });

    // Show welcome message
    this.showWelcome();

    // Process any queued prompts
    if (this.pendingPrompts.length > 0) {
      const prompts = this.pendingPrompts.splice(0);
      for (const prompt of prompts) {
        await this.processPrompt(prompt);
      }
    }

    // Keep running until exit
    await this.waitForExit();
  }

  private showWelcome(): void {
    const renderer = this.promptController?.getRenderer();
    if (!renderer) return;

    const version = getVersion();

    // Clear screen - this needs to be direct for terminal control
    stdout.write('\x1b[2J\x1b[H'); // Clear screen and move to top

    const header = chalk.bold.hex('#8B5CF6')(`v${version}`) +
      chalk.dim(' • ') + chalk.bold.hex('#EC4899')('Bo Shang');

    const modelChip = chalk.bgHex('#0EA5E9').hex('#0B1120').bold(` ⚡ ${this.profileConfig.model} `);
    const providerChip = chalk.bgHex('#10B981').hex('#0B1120').bold(` 🔌 ${this.profileConfig.provider} `);

    const commandChip = (label: string, color: string) =>
      chalk.bgHex(color).hex('#0B1120').bold(` ${label} `);

    const commands = [
      commandChip('💡 /model', '#FBBF24'),
      commandChip('🔑 /secrets', '#F59E0B'),
      commandChip('❓ /help', '#F472B6'),
      commandChip('🐛 /debug', '#22D3EE'),
    ].join('  ');

    const usageHint = chalk.dim('  hint: type a prompt to start, /help for commands, or -q for headless runs');

    const welcomeContent = [
      AGI_GLOW_RENDERED,
      AGI_BANNER_RENDERED,
      AGI_GLOW_RENDERED,
      '  ' + header,
      '  ' + modelChip + chalk.dim(' · ') + providerChip,
      '  ' + commands,
      usageHint,
      ''
    ].join('\n');

    // Use renderer event system instead of direct stdout writes
    renderer.addEvent('banner', welcomeContent);

    // Update renderer meta with model info
    this.promptController?.setModelContext({
      model: this.profileConfig.model,
      provider: this.profileConfig.provider,
    });
  }

  private applyDebugState(enabled: boolean, statusMessage?: string): void {
    this.debugEnabled = enabled;
    setDebugMode(enabled);
    this.promptController?.setDebugMode(enabled);
    // Show transient status message instead of chat banner
    if (statusMessage) {
      this.promptController?.setStatusMessage(statusMessage);
      setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
    }
  }

  private describeEventForDebug(event: AgentEventUnion): string {
    switch (event.type) {
      case 'message.start':
        return 'message.start';
      case 'message.delta': {
        const snippet = debugSnippet(event.content);
        return snippet ? `message.delta → ${snippet}` : 'message.delta (empty)';
      }
      case 'message.complete': {
        const snippet = debugSnippet(event.content);
        return snippet
          ? `message.complete → ${snippet} (${event.elapsedMs}ms)`
          : `message.complete (${event.elapsedMs}ms)`;
      }
      case 'tool.start':
        return `tool.start ${event.toolName}`;
      case 'tool.complete': {
        const snippet = debugSnippet(event.result);
        return snippet
          ? `tool.complete ${event.toolName} → ${snippet}`
          : `tool.complete ${event.toolName}`;
      }
      case 'tool.error':
        return `tool.error ${event.toolName} → ${event.error}`;
      case 'edit.explanation': {
        const snippet = debugSnippet(event.content);
        return snippet ? `edit.explanation → ${snippet}` : 'edit.explanation';
      }
      case 'error':
        return `error → ${event.error}`;
      case 'usage': {
        const parts = [];
        if (event.inputTokens != null) parts.push(`in:${event.inputTokens}`);
        if (event.outputTokens != null) parts.push(`out:${event.outputTokens}`);
        if (event.totalTokens != null) parts.push(`total:${event.totalTokens}`);
        return `usage ${parts.length ? parts.join(', ') : '(no tokens)'}`;
      }
      default:
        return event.type;
    }
  }

  private handleDebugCommand(arg?: string): boolean {
    const normalized = arg?.toLowerCase();

    // /debug alone - toggle
    if (!normalized) {
      const targetState = !this.debugEnabled;
      this.applyDebugState(targetState, `Debug ${targetState ? 'on' : 'off'}`);
      return true;
    }

    // /debug status - show current state
    if (normalized === 'status') {
      this.promptController?.setStatusMessage(`Debug is ${this.debugEnabled ? 'on' : 'off'}`);
      setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
      return true;
    }

    // /debug on|enable
    if (normalized === 'on' || normalized === 'enable') {
      if (this.debugEnabled) {
        this.promptController?.setStatusMessage('Debug already on');
        setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
        return true;
      }
      this.applyDebugState(true, 'Debug on');
      return true;
    }

    // /debug off|disable
    if (normalized === 'off' || normalized === 'disable') {
      if (!this.debugEnabled) {
        this.promptController?.setStatusMessage('Debug already off');
        setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
        return true;
      }
      this.applyDebugState(false, 'Debug off');
      return true;
    }

    // Invalid argument
    this.promptController?.setStatusMessage(`Invalid: /debug ${arg}. Use on|off|status`);
    setTimeout(() => this.promptController?.setStatusMessage(null), 2500);
    return true;
  }

  private async runRepoUpgradeCommand(args: string[]): Promise<void> {
    if (this.isProcessing) {
      this.promptController?.setStatusMessage('Already processing a task');
      setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
      return;
    }

    const mode = this.resolveUpgradeMode(args);
    const continueOnFailure = !args.some(arg => arg === '--stop-on-fail');
    const validationMode = this.parseValidationMode(args);
    const additionalScopes = args
      .filter(arg => arg.startsWith('scope:'))
      .map(arg => arg.slice('scope:'.length))
      .filter(Boolean);

    this.isProcessing = true;
    this.promptController?.setStatusMessage(`Running repo upgrade (${mode})...`);
    this.promptController?.setStreaming(true);

    try {
      const report = await runRepoUpgradeFlow({
        controller: this.controller,
        workingDir: this.workingDir,
        mode,
        continueOnFailure,
        validationMode,
        additionalScopes,
        objective: `Repo upgrade (${mode})`,
        onEvent: (event) => this.handleUpgradeEvent(event.type, event.data),
      });

      this.renderUpgradeReport(report);
      if (validationMode === 'ask') {
        this.promptController?.setStatusMessage('Validation commands listed (rerun with --validate to execute)');
        setTimeout(() => this.promptController?.setStatusMessage(null), 4000);
      }
      this.promptController?.setStatusMessage('Repo upgrade complete');
      setTimeout(() => this.promptController?.setStatusMessage(null), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.promptController?.setStatusMessage(`Upgrade failed: ${message}`);
      setTimeout(() => this.promptController?.setStatusMessage(null), 4000);
    } finally {
      this.promptController?.setStreaming(false);
      this.isProcessing = false;
    }
  }

  private handleUpgradeEvent(type: string, data?: Record<string, unknown>): void {
    if (!this.promptController) return;
    if (type === 'upgrade.module.start') {
      const label = typeof data?.['label'] === 'string' ? data['label'] : data?.['moduleId'];
      this.promptController.setStatusMessage(`Upgrading ${label ?? 'module'}...`);
    } else if (type === 'upgrade.step.start') {
      const stepId = data?.['stepId'];
      this.promptController.setStatusMessage(`Running step ${stepId ?? ''}...`);
    }
  }

  private renderUpgradeReport(report: RepoUpgradeReport): void {
    if (!this.promptController?.supportsInlinePanel()) {
      return;
    }

    const lines: string[] = [];
    const status = report.success ? chalk.green('✓') : chalk.yellow('⚠');
    lines.push(chalk.bold(`${status} Repo upgrade (${report.mode})`));
    lines.push(chalk.dim(`Continue on failure: ${report.continueOnFailure ? 'yes' : 'no'}`));
    if (report.mode === 'dual-rl-continuous') {
      const stats = this.getVariantStats(report);
      const tieText = stats.ties > 0 ? chalk.dim(` · ties ${stats.ties}`) : '';
      lines.push(
        chalk.dim(`RL competition: primary ${stats.primaryWins} · refiner ${stats.refinerWins}${tieText}`)
      );
    }
    lines.push('');

    for (const module of report.modules) {
      const icon = module.status === 'completed' ? '✔' : module.status === 'skipped' ? '…' : '✖';
      lines.push(`${icon} ${module.label} (${module.status})`);
      for (const step of module.steps.slice(0, 2)) {
        const winnerMark = step.winnerVariant === 'refiner' ? 'R' : 'P';
        const summary = this.truncateInline(step.winner.summary, 80);
        lines.push(`   • [${winnerMark}] ${step.intent}: ${summary}`);
      }
    }

    if (report.recommendations.length) {
      lines.push('');
      lines.push(chalk.bold('Next steps'));
      for (const rec of report.recommendations.slice(0, 3)) {
        lines.push(` - ${rec}`);
      }
    }

    const firstValidations = report.modules.flatMap(m => m.validations ?? []).slice(0, 3);
    if (firstValidations.length) {
      lines.push('');
      lines.push(chalk.bold('Validation'));
      for (const val of firstValidations) {
        const icon = val.skipped ? '…' : val.success ? '✓' : '✖';
        lines.push(` ${icon} ${val.command} ${val.skipped ? '(skipped)' : ''}`);
      }
    }

    this.promptController.setInlinePanel(lines);
    this.scheduleInlinePanelDismiss();
  }

  private getVariantStats(report: RepoUpgradeReport): { primaryWins: number; refinerWins: number; ties: number } {
    if (report.variantStats) {
      const { primaryWins, refinerWins, ties } = report.variantStats;
      return { primaryWins, refinerWins, ties };
    }

    const stats = { primaryWins: 0, refinerWins: 0, ties: 0 };
    for (const module of report.modules) {
      for (const step of module.steps) {
        if (step.winnerVariant === 'refiner') {
          stats.refinerWins += 1;
        } else {
          stats.primaryWins += 1;
        }
        if (step.refiner && step.primary.success && step.refiner.success) {
          const primaryScore = typeof step.primary.score === 'number' ? step.primary.score : 0;
          const refinerScore = typeof step.refiner.score === 'number' ? step.refiner.score : 0;
          if (Math.abs(primaryScore - refinerScore) < 1e-6) {
            stats.ties += 1;
          }
        }
      }
    }

    return stats;
  }

  private truncateInline(text: string, limit: number): string {
    if (!text) return '';
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  }

  private resolveUpgradeMode(args: string[]): RepoUpgradeMode {
    const normalized = args.map(arg => arg.toLowerCase());
    const explicitDual = normalized.some(arg => arg === 'dual' || arg === 'multi');
    const explicitSingle = normalized.some(arg => arg === 'single' || arg === 'solo');
    const mode: RepoUpgradeMode = explicitDual
      ? 'dual-rl-continuous'
      : explicitSingle
        ? 'single-continuous'
        : this.preferredUpgradeMode;

    this.preferredUpgradeMode = mode;

    const toggles = this.promptController?.getModeToggleState();
    const currentlyDual = toggles?.dualRlEnabled ?? false;
    if (toggles && currentlyDual !== (mode === 'dual-rl-continuous')) {
      this.promptController?.setModeToggles({
        verificationEnabled: toggles.verificationEnabled,
        verificationHotkey: toggles.verificationHotkey,
        autoContinueEnabled: toggles.autoContinueEnabled,
        autoContinueHotkey: toggles.autoContinueHotkey,
        thinkingModeLabel: toggles.thinkingModeLabel,
        thinkingHotkey: toggles.thinkingHotkey,
        criticalApprovalMode: toggles.criticalApprovalMode,
        criticalApprovalHotkey: toggles.criticalApprovalHotkey,
        dualRlEnabled: mode === 'dual-rl-continuous',
        dualRlHotkey: toggles.dualRlHotkey,
      });
    }

    return mode;
  }

  private parseValidationMode(args: string[]): 'auto' | 'ask' | 'skip' {
    if (args.includes('--validate') || args.includes('--validate=auto')) {
      return 'auto';
    }
    if (args.includes('--no-validate')) {
      return 'skip';
    }
    return 'ask';
  }

  private async runLocalCommand(command: string): Promise<void> {
    const renderer = this.promptController?.getRenderer();
    if (!command) {
      this.promptController?.setStatusMessage('Usage: /bash <command>');
      setTimeout(() => this.promptController?.setStatusMessage(null), 2500);
      return;
    }

    this.promptController?.setStatusMessage(`bash: ${command}`);
    try {
      const { stdout: out, stderr } = await exec(command, {
        cwd: this.workingDir,
        maxBuffer: 4 * 1024 * 1024,
      });
      const output = [out, stderr].filter(Boolean).join('').trim() || '(no output)';
      renderer?.addEvent('tool', `$ ${command}\n${output}`);
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').trim();
      renderer?.addEvent('error', `$ ${command}\n${output || 'command failed'}`);
    } finally {
      this.promptController?.setStatusMessage(null);
    }
  }

  private handleSlashCommand(command: string): boolean {
    const trimmed = command.trim();
    const lower = trimmed.toLowerCase();

    // Handle /model with arguments - silent model switch
    if (lower.startsWith('/model ') || lower.startsWith('/m ')) {
      const arg = trimmed.slice(trimmed.indexOf(' ') + 1).trim();
      if (arg) {
        void this.switchModel(arg);
        return true;
      }
    }

    // Handle /model or /m alone - cycle to next provider silently
    if (lower === '/model' || lower === '/m') {
      void this.cycleProvider();
      return true;
    }

    // Handle /secrets with subcommands
    if (lower.startsWith('/secrets') || lower.startsWith('/s ') || lower === '/s') {
      const parts = trimmed.split(/\s+/);
      const subCmd = parts[1]?.toLowerCase();
      if (subCmd === 'set') {
        const secretArg = parts[2];
        void this.startSecretInput(secretArg);
        return true;
      }
      // /secrets or /s alone - show status
      this.showSecrets();
      return true;
    }

    if (lower === '/help' || lower === '/h' || lower === '/?') {
      this.showHelp();
      return true;
    }

    if (lower === '/clear' || lower === '/c') {
      stdout.write('\x1b[2J\x1b[H');
      this.showWelcome();
      return true;
    }

    if (lower.startsWith('/bash') || lower.startsWith('/sh ')) {
      const cmd = trimmed.replace(/^\/(bash|sh)\s*/i, '').trim();
      void this.runLocalCommand(cmd);
      return true;
    }

    if (lower.startsWith('/upgrade') || lower === '/up' || lower.startsWith('/up ')) {
      const args = trimmed.split(/\s+/).slice(1);
      void this.runRepoUpgradeCommand(args);
      return true;
    }

    // Toggle dual-agent RL mode
    if (lower === '/dual' || lower === '/mode') {
      this.promptController?.toggleDualMode();
      this.syncPreferredModeFromToggles();
      const state = this.promptController?.getModeToggleState();
      this.promptController?.setStatusMessage(state?.dualRlEnabled ? 'Dual RL on' : 'Dual RL off');
      setTimeout(() => this.promptController?.setStatusMessage(null), 1500);
      return true;
    }
    if (lower.startsWith('/mode ')) {
      const arg = lower.split(/\s+/)[1];
      const state = this.promptController?.getModeToggleState();
      if (arg === 'dual' || arg === 'multi') {
        this.promptController?.setModeToggles({
          dualRlEnabled: true,
          verificationEnabled: state?.verificationEnabled ?? false,
          autoContinueEnabled: state?.autoContinueEnabled ?? false,
        });
        this.syncPreferredModeFromToggles();
        this.promptController?.setStatusMessage('Dual RL on');
      } else if (arg === 'single' || arg === 'solo') {
        this.promptController?.setModeToggles({
          dualRlEnabled: false,
          verificationEnabled: state?.verificationEnabled ?? false,
          autoContinueEnabled: state?.autoContinueEnabled ?? false,
        });
        this.syncPreferredModeFromToggles();
        this.promptController?.setStatusMessage('Dual RL off');
      } else {
        this.promptController?.setStatusMessage('Use /mode dual|single');
      }
      setTimeout(() => this.promptController?.setStatusMessage(null), 1500);
      return true;
    }

    // Toggle auto-continue
    if (lower === '/auto' || lower === '/continue' || lower === '/loop') {
      this.promptController?.toggleAutoContinue();
      const on = this.promptController?.getModeToggleState().autoContinueEnabled;
      this.promptController?.setStatusMessage(on ? 'Auto-continue on' : 'Auto-continue off');
      setTimeout(() => this.promptController?.setStatusMessage(null), 1500);
      return true;
    }

    // Toggle verification
    if (lower === '/verify' || lower === '/test') {
      this.promptController?.toggleVerify();
      const on = this.promptController?.getModeToggleState().verificationEnabled;
      this.promptController?.setStatusMessage(on ? 'Verify on' : 'Verify off');
      setTimeout(() => this.promptController?.setStatusMessage(null), 1500);
      return true;
    }

    // Toggle approvals mode
    if (lower === '/approve' || lower === '/approvals') {
      this.promptController?.toggleApprovals();
      const mode = this.promptController?.getModeToggleState().criticalApprovalMode ?? 'auto';
      this.promptController?.setStatusMessage(`Approvals: ${mode}`);
      setTimeout(() => this.promptController?.setStatusMessage(null), 1500);
      return true;
    }

    if (lower === '/exit' || lower === '/quit' || lower === '/q') {
      this.handleExit();
      return true;
    }

    if (lower.startsWith('/debug')) {
      const parts = trimmed.split(/\s+/);
      this.handleDebugCommand(parts[1]);
      return true;
    }

    return false;
  }

  /**
   * Switch model silently without writing to chat.
   * Accepts formats: "provider", "provider model", "provider/model", or "model"
   * Updates status bar to show new model.
   */
  private async switchModel(arg: string): Promise<void> {
    // Ensure we have provider info
    if (!this.cachedProviders) {
      await this.fetchProviders();
    }

    const providers = this.cachedProviders || [];
    const configuredProviders = getConfiguredProviders();
    let targetProvider: ProviderId | null = null;
    let targetModel: string | null = null;

    // Parse argument: could be "provider model", "provider/model", "provider", or just "model"
    // Check for space-separated format first: "openai o1-pro"
    const parts = arg.split(/[\s/]+/);
    if (parts.length >= 2) {
      // Try first part as provider
      const providerMatch = this.matchProvider(parts[0] || '');
      if (providerMatch) {
        targetProvider = providerMatch as ProviderId;
        targetModel = parts.slice(1).join('/'); // Rest is model (handle models with slashes)
      } else {
        // First part isn't a provider, treat whole arg as model name
        const inferredProvider = this.inferProviderFromModel(arg.replace(/\s+/g, '-'));
        if (inferredProvider) {
          targetProvider = inferredProvider;
          targetModel = arg.replace(/\s+/g, '-');
        }
      }
    } else {
      // Single token - could be provider or model
      const matched = this.matchProvider(arg);
      if (matched) {
        targetProvider = matched as ProviderId;
        // Use provider's best model
        const providerStatus = providers.find(p => p.provider === targetProvider);
        targetModel = providerStatus?.latestModel || null;
      } else {
        // Assume it's a model name - try to infer provider from model prefix
        const inferredProvider = this.inferProviderFromModel(arg);
        if (inferredProvider) {
          targetProvider = inferredProvider;
          targetModel = arg;
        }
      }
    }

    // Validate we have a valid provider
    if (!targetProvider) {
      // Silent error - just flash status briefly
      this.promptController?.setStatusMessage(`Unknown: ${arg}`);
      setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
      return;
    }

    // Check provider is configured
    const providerInfo = configuredProviders.find(p => p.id === targetProvider);
    if (!providerInfo) {
      // Silent error - just flash status briefly
      this.promptController?.setStatusMessage(`${targetProvider} not configured`);
      setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
      return;
    }

    // Get model if not specified
    if (!targetModel) {
      const providerStatus = providers.find(p => p.provider === targetProvider);
      targetModel = providerStatus?.latestModel || providerInfo.latestModel;
    }

    // Save preference and update config
    saveModelPreference(this.profile, {
      provider: targetProvider,
      model: targetModel,
    });

    // Update local config
    this.profileConfig = {
      ...this.profileConfig,
      provider: targetProvider,
      model: targetModel,
    };

    // Update controller's model
    await this.controller.switchModel({
      provider: targetProvider,
      model: targetModel,
    });

    // Update status bar - this displays the model below the chat box
    this.promptController?.setModelContext({
      model: targetModel,
      provider: targetProvider,
    });

    // Silent success - no chat output, just status bar update
  }

  /**
   * Match user input to a provider ID (fuzzy matching)
   */
  private matchProvider(input: string): ProviderId | null {
    const lower = input.toLowerCase();
    const providers = getConfiguredProviders();

    // Exact match
    const exact = providers.find(p => p.id === lower || p.name.toLowerCase() === lower);
    if (exact) return exact.id;

    // Prefix match
    const prefix = providers.find(p =>
      p.id.startsWith(lower) || p.name.toLowerCase().startsWith(lower)
    );
    if (prefix) return prefix.id;

    // Alias matching
    const aliases: Record<string, ProviderId> = {
      'claude': 'anthropic',
      'ant': 'anthropic',
      'gpt': 'openai',
      'oai': 'openai',
      'gemini': 'google',
      'gem': 'google',
      'ds': 'deepseek',
      'deep': 'deepseek',
      'grok': 'xai',
      'x': 'xai',
      'local': 'ollama',
      'llama': 'ollama',
    };

    if (aliases[lower]) {
      const aliased = providers.find(p => p.id === aliases[lower]);
      if (aliased) return aliased.id;
    }

    return null;
  }

  /**
   * Infer provider from model name
   */
  private inferProviderFromModel(model: string): ProviderId | null {
    const lower = model.toLowerCase();

    if (lower.startsWith('claude') || lower.startsWith('opus') || lower.startsWith('sonnet') || lower.startsWith('haiku')) {
      return 'anthropic';
    }
    if (lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('codex')) {
      return 'openai';
    }
    if (lower.startsWith('gemini')) {
      return 'google';
    }
    if (lower.startsWith('deepseek')) {
      return 'deepseek';
    }
    if (lower.startsWith('grok')) {
      return 'xai';
    }
    if (lower.startsWith('llama') || lower.startsWith('mistral') || lower.startsWith('qwen')) {
      return 'ollama';
    }

    return null;
  }

  /**
   * Cycle to the next available provider silently.
   * Only updates the status bar, no chat output.
   */
  private async cycleProvider(): Promise<void> {
    const configuredProviders = getConfiguredProviders();
    if (configuredProviders.length === 0) {
      this.promptController?.setStatusMessage('No providers configured');
      setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
      return;
    }

    const currentProvider = this.profileConfig.provider;
    const currentIndex = configuredProviders.findIndex(p => p.id === currentProvider);
    const nextIndex = (currentIndex + 1) % configuredProviders.length;
    const nextProvider = configuredProviders[nextIndex];

    if (!nextProvider) return;

    // Switch to the next provider's default model
    await this.switchModel(nextProvider.id);
  }

  private showSecrets(): void {
    const secrets = listSecretDefinitions();

    if (!this.promptController?.supportsInlinePanel()) {
      // Fallback for non-TTY - use status message
      const setCount = secrets.filter(s => !!process.env[s.envVar]).length;
      this.promptController?.setStatusMessage(`API Keys: ${setCount}/${secrets.length} configured`);
      setTimeout(() => this.promptController?.setStatusMessage(null), 3000);
      return;
    }

    // Build inline panel content
    const lines: string[] = [
      chalk.bold.hex('#6366F1')('API Keys') + chalk.dim('  (press any key to dismiss)'),
    ];

    if (secrets.length === 0) {
      lines.push(chalk.dim('No API keys defined.'));
    } else {
      // Show secrets in compact format
      for (const secret of secrets) {
        const envVar = secret.envVar;
        const isSet = !!process.env[envVar];
        const status = isSet ? chalk.hex('#34D399')('✓') : chalk.hex('#EF4444')('✗');
        const providers = secret.providers?.length ? chalk.dim(` ${secret.providers.join(',')}`) : '';
        lines.push(`${status} ${chalk.hex('#FBBF24')(envVar)}${providers}`);
      }
    }

    lines.push('');
    lines.push(chalk.dim('/secrets set') + ' to configure keys');

    this.promptController.setInlinePanel(lines);
    this.scheduleInlinePanelDismiss();
  }

  /**
   * Start interactive secret input flow.
   * If secretArg is provided, set only that secret.
   * Otherwise, prompt for all unset secrets.
   */
  private async startSecretInput(secretArg?: string): Promise<void> {
    const secrets = listSecretDefinitions();

    if (secretArg) {
      // Set a specific secret
      const upper = secretArg.toUpperCase();
      const secret = secrets.find(s => s.id === upper || s.envVar === upper);
      if (!secret) {
        this.promptController?.setStatusMessage(`Unknown secret: ${secretArg}`);
        setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
        return;
      }
      this.promptForSecret(secret.id);
      return;
    }

    // Queue all unset secrets for input
    const unsetSecrets = secrets.filter(s => !getSecretValue(s.id));
    if (unsetSecrets.length === 0) {
      this.promptController?.setStatusMessage('All secrets configured');
      setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
      return;
    }

    // Queue all unset secrets and start with the first one
    this.secretInputMode.queue = unsetSecrets.map(s => s.id);
    const first = this.secretInputMode.queue.shift();
    if (first) {
      this.promptForSecret(first);
    }
  }

  /**
   * Show prompt for a specific secret and enable secret input mode.
   */
  private promptForSecret(secretId: SecretName): void {
    const secrets = listSecretDefinitions();
    const secret = secrets.find(s => s.id === secretId);
    if (!secret) return;

    // Show in inline panel (no chat output)
    if (this.promptController?.supportsInlinePanel()) {
      const lines = [
        chalk.bold.hex('#6366F1')(`Set ${secret.label}`),
        chalk.dim(secret.description),
        '',
        chalk.dim('Enter value (or press Enter to skip)'),
      ];
      this.promptController.setInlinePanel(lines);
    }

    // Enable secret input mode
    this.secretInputMode.active = true;
    this.secretInputMode.secretId = secretId;
    this.promptController?.setSecretMode(true);
    this.promptController?.setStatusMessage(`Enter ${secret.label}...`);
  }

  /**
   * Handle secret value submission.
   */
  private handleSecretValue(value: string): void {
    const secretId = this.secretInputMode.secretId;
    if (!secretId) return;

    // Disable secret mode and clear inline panel
    this.promptController?.setSecretMode(false);
    this.promptController?.clearInlinePanel();
    this.secretInputMode.active = false;
    this.secretInputMode.secretId = null;

    if (value.trim()) {
      try {
        setSecretValue(secretId, value.trim());
        this.promptController?.setStatusMessage(`${secretId} saved`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to save';
        this.promptController?.setStatusMessage(msg);
      }
    } else {
      this.promptController?.setStatusMessage(`Skipped ${secretId}`);
    }

    // Clear status after a moment
    setTimeout(() => this.promptController?.setStatusMessage(null), 1500);

    // Process next secret in queue if any
    if (this.secretInputMode.queue.length > 0) {
      const next = this.secretInputMode.queue.shift();
      if (next) {
        setTimeout(() => this.promptForSecret(next), 500);
      }
    }
  }

  private showHelp(): void {
    if (!this.promptController?.supportsInlinePanel()) {
      // Fallback for non-TTY - use status message
      this.promptController?.setStatusMessage('Help: /model /secrets /clear /debug /exit');
      setTimeout(() => this.promptController?.setStatusMessage(null), 3000);
      return;
    }

    // Show help in inline panel (no chat output)
    const lines = [
      chalk.bold.hex('#6366F1')('Commands') + chalk.dim('  (press any key to dismiss)'),
      '',
      chalk.hex('#FBBF24')('/model') + chalk.dim(' - Cycle provider') + '  ' +
        chalk.hex('#FBBF24')('/model <name>') + chalk.dim(' - Switch model'),
      chalk.hex('#FBBF24')('/secrets') + chalk.dim(' - Show API keys') + '  ' +
        chalk.hex('#FBBF24')('/secrets set') + chalk.dim(' - Configure keys'),
      chalk.hex('#FBBF24')('/bash') + chalk.dim(' - Run local command'),
      chalk.hex('#FBBF24')('/upgrade') + chalk.dim(' - Repo upgrade (add "dual" for dual RL, scope:<path>)'),
      chalk.hex('#FBBF24')('/clear') + chalk.dim(' - Clear screen') + '  ' +
        chalk.hex('#FBBF24')('/debug') + chalk.dim(' - Toggle debug'),
      chalk.hex('#FBBF24')('/help') + chalk.dim(' - This help') + '  ' +
        chalk.hex('#FBBF24')('/exit') + chalk.dim(' - Exit AGI'),
    ];

    this.promptController.setInlinePanel(lines);
    this.scheduleInlinePanelDismiss();
  }

  /**
   * Auto-dismiss inline panel after timeout or on next input.
   */
  private inlinePanelDismissTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleInlinePanelDismiss(): void {
    // Clear any existing timer
    if (this.inlinePanelDismissTimer) {
      clearTimeout(this.inlinePanelDismissTimer);
    }
    // Auto-dismiss after 8 seconds
    this.inlinePanelDismissTimer = setTimeout(() => {
      this.promptController?.clearInlinePanel();
      this.inlinePanelDismissTimer = null;
    }, 8000);
  }

  private dismissInlinePanel(): void {
    if (this.inlinePanelDismissTimer) {
      clearTimeout(this.inlinePanelDismissTimer);
      this.inlinePanelDismissTimer = null;
    }
    this.promptController?.clearInlinePanel();
  }

  private handleSubmit(text: string): void {
    const trimmed = text.trim();

    // Handle secret input mode - capture the API key value
    if (this.secretInputMode.active && this.secretInputMode.secretId) {
      this.handleSecretValue(trimmed);
      return;
    }

    if (!trimmed) {
      return;
    }

    // Handle slash commands first - these don't go to the AI
    if (trimmed.startsWith('/')) {
      if (this.handleSlashCommand(trimmed)) {
        return;
      }
      // Unknown slash command - silent status flash, dismiss inline panel
      this.dismissInlinePanel();
      this.promptController?.setStatusMessage(`Unknown: ${trimmed}`);
      setTimeout(() => this.promptController?.setStatusMessage(null), 2000);
      return;
    }

    // Dismiss inline panel for regular user prompts
    this.dismissInlinePanel();

    if (this.isProcessing) {
      this.pendingPrompts.push(trimmed);
      return;
    }

    void this.processPrompt(trimmed);
  }

  private async processPrompt(prompt: string): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.currentResponseBuffer = '';
    this.promptController?.setStreaming(true);
    this.promptController?.setStatusMessage('Processing...');

    const renderer = this.promptController?.getRenderer();

    try {
      logDebug('[DEBUG] Starting send loop for prompt:', debugSnippet(prompt));
      for await (const event of this.controller.send(prompt)) {
        logDebug('[DEBUG] Received event:', this.describeEventForDebug(event));
        if (this.shouldExit) {
          break;
        }

        switch (event.type) {
          case 'message.start':
            // AI has started processing - update status to show activity
            logDebug('[DEBUG] message.start - setting Thinking status');
            this.currentResponseBuffer = '';
            this.promptController?.setStatusMessage('Thinking...');
            break;

          case 'message.delta':
            // Stream content as it arrives
            this.currentResponseBuffer += event.content ?? '';
            if (renderer) {
              renderer.addEvent('stream', event.content);
            }
            break;

          case 'message.complete':
            // Response complete - ensure final output includes required "Next steps"
            if (renderer) {
              const base = (event.content ?? '').trimEnd();
              const sourceText = base || this.currentResponseBuffer;
              const { output } = ensureNextSteps(sourceText);
              const extra = output.startsWith(this.currentResponseBuffer)
                ? output.slice(this.currentResponseBuffer.length)
                : output;

              if (extra.trim()) {
                renderer.addEvent('stream', extra);
              }
              renderer.addEvent('response', '\n');
            }
            this.currentResponseBuffer = '';
            break;

          case 'tool.start': {
            const toolName = event.toolName;
            const args = event.parameters;
            let toolDisplay = `[${toolName}]`;

            if (toolName === 'Bash' && args?.['command']) {
              toolDisplay += ` $ ${args['command']}`;
            } else if (toolName === 'Read' && args?.['file_path']) {
              toolDisplay += ` ${args['file_path']}`;
            } else if (toolName === 'Write' && args?.['file_path']) {
              toolDisplay += ` ${args['file_path']}`;
            } else if (toolName === 'Edit' && args?.['file_path']) {
              toolDisplay += ` ${args['file_path']}`;
            } else if (toolName === 'Search' && args?.['pattern']) {
              toolDisplay += ` ${args['pattern']}`;
            } else if (toolName === 'Grep' && args?.['pattern']) {
              toolDisplay += ` ${args['pattern']}`;
            }

            if (renderer) {
              renderer.addEvent('tool', toolDisplay);
            }
            this.promptController?.setStatusMessage(`Running ${toolName}...`);
            break;
          }

          case 'tool.complete': {
            // Show truncated results
            if (event.result && typeof event.result === 'string' && renderer) {
              const lines = event.result.split('\n');
              if (lines.length > 8) {
                const preview = lines.slice(0, 8).join('\n');
                renderer.addEvent('tool-result', `${preview}\n... (${lines.length - 8} more lines)`);
              } else if (event.result.length > 500) {
                renderer.addEvent('tool-result', `${event.result.slice(0, 500)}...`);
              } else if (event.result.trim()) {
                renderer.addEvent('tool-result', event.result);
              }
            }
            break;
          }

          case 'tool.error':
            if (renderer) {
              renderer.addEvent('error', event.error);
            }
            break;

          case 'error':
            if (renderer) {
              renderer.addEvent('error', event.error);
            }
            break;

          case 'usage':
            this.promptController?.setMetaStatus({
              tokensUsed: event.totalTokens,
              tokenLimit: 200000, // Approximate limit
            });
            break;

          case 'provider.fallback': {
            // Display fallback notification
            if (renderer) {
              const fallbackMsg = chalk.yellow('⚠ ') +
                chalk.dim(`${event.fromProvider}/${event.fromModel} failed: `) +
                chalk.hex('#EF4444')(event.reason) +
                chalk.dim(' → switching to ') +
                chalk.hex('#34D399')(`${event.toProvider}/${event.toModel}`);
              renderer.addEvent('banner', fallbackMsg);
            }

            // Update the model context to reflect the new provider/model
            this.profileConfig = {
              ...this.profileConfig,
              provider: event.toProvider,
              model: event.toModel,
            };
            this.promptController?.setModelContext({
              model: event.toModel,
              provider: event.toProvider,
            });
            break;
          }

          case 'edit.explanation':
            // Show explanation for edits made
            if (event.content && renderer) {
              const filesInfo = event.files?.length ? ` (${event.files.join(', ')})` : '';
              renderer.addEvent('response', `${event.content}${filesInfo}`);
            }
            break;
        }
      }
    } catch (error) {
      logDebug('[DEBUG] Caught error in send loop:', error);
      const message = error instanceof Error ? error.message : String(error);
      if (renderer) {
        renderer.addEvent('error', message);
      }
    } finally {
      logDebug('[DEBUG] Finally block - cleaning up');
      this.isProcessing = false;
      this.promptController?.setStreaming(false);
      this.promptController?.setStatusMessage(null);
      this.currentResponseBuffer = '';

      // Process any queued prompts
      if (this.pendingPrompts.length > 0 && !this.shouldExit) {
        const next = this.pendingPrompts.shift();
        if (next) {
          await this.processPrompt(next);
        }
      }
    }
  }

  private handleInterrupt(): void {
    // Interrupt current processing
    if (this.isProcessing) {
      const renderer = this.promptController?.getRenderer();
      if (renderer) {
        renderer.addEvent('banner', chalk.yellow('Interrupted'));
      }
    }
  }

  private handleDualRlToggle(): void {
    this.syncPreferredModeFromToggles();
    const dual = this.preferredUpgradeMode === 'dual-rl-continuous';
    this.promptController?.setStatusMessage(dual ? 'Dual RL on' : 'Single mode');
    setTimeout(() => this.promptController?.setStatusMessage(null), 1500);
  }

  private syncPreferredModeFromToggles(): void {
    const dual = this.promptController?.getModeToggleState().dualRlEnabled ?? false;
    this.preferredUpgradeMode = dual ? 'dual-rl-continuous' : 'single-continuous';
  }

  private handleCtrlC(info: { hadBuffer: boolean }): void {
    const now = Date.now();

    // Reset count if more than 2 seconds since last Ctrl+C
    if (now - this.lastCtrlCTime > 2000) {
      this.ctrlCCount = 0;
    }

    this.lastCtrlCTime = now;
    this.ctrlCCount++;

    if (info.hadBuffer) {
      // Clear buffer, reset count
      this.ctrlCCount = 0;
      return;
    }

    if (this.isProcessing) {
      // Interrupt processing
      this.handleInterrupt();
      return;
    }

    // Double Ctrl+C to exit
    if (this.ctrlCCount >= 2) {
      this.handleExit();
    } else {
      const renderer = this.promptController?.getRenderer();
      if (renderer) {
        renderer.addEvent('banner', chalk.dim('Press Ctrl+C again to exit'));
      }
    }
  }

  private handleExit(): void {
    this.shouldExit = true;

    // Show goodbye message through UI system
    const renderer = this.promptController?.getRenderer();
    if (renderer) {
      renderer.addEvent('banner', chalk.hex('#EC4899')('\n  Goodbye! 👋\n'));
    }

    this.promptController?.stop();
    exit(0);
  }

  private waitForExit(): Promise<void> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.shouldExit) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  let profile: string | undefined;
  const promptTokens: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === '--profile' || token === '-p') {
      profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith('--profile=')) {
      profile = token.slice('--profile='.length);
      continue;
    }
    // Skip known flags
    if (token.startsWith('--') || token.startsWith('-')) {
      continue;
    }
    promptTokens.push(token);
  }

  return {
    profile,
    initialPrompt: promptTokens.length ? promptTokens.join(' ').trim() : null,
  };
}

function resolveProfile(override?: string): ProfileName {
  if (override) {
    if (!hasAgentProfile(override as ProfileName)) {
      const available = listAgentProfiles().map((p) => p.name).join(', ');
      throw new Error(`Unknown profile "${override}". Available: ${available}`);
    }
    return override as ProfileName;
  }
  return 'agi-code';
}
