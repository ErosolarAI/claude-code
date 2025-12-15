#!/usr/bin/env node
/**
 * AGI CLI - Core Interactive AI Agent for Coding
 *
 * FAST-PATH OPTIMIZATION:
 * - version/help exit immediately with minimal imports
 * - Heavy modules loaded dynamically only when needed
 *
 * @license MIT
 */

// ============================================================================
// FAST PATH: Handle --version and --help before any heavy imports
// ============================================================================
const rawArgs = process.argv.slice(2);

// Detect which binary was invoked
const invokedAs = process.argv[1]?.includes('erosolar') ? 'erosolar' : 'agi';

if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  // Inline version read for fastest possible response
  import('node:fs').then(fs => {
    import('node:path').then(path => {
      import('node:url').then(url => {
        try {
          const __filename = url.fileURLToPath(import.meta.url);
          const pkgPath = path.resolve(path.dirname(__filename), '../../package.json');
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const version = pkg.version || '0.0.0';
          console.log(`${invokedAs}-cli v${version}`);
        } catch {
          console.log(`${invokedAs}-cli (version unknown)`);
        }
        process.exit(0);
      });
    });
  });
} else if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  printHelpFast(invokedAs);
  process.exit(0);
} else {
  const knownFlags = new Set([
    '--version', '-v', '--help', '-h', '--self-test',
    '--quick', '-q', '--json', '--eval', '-e',
    '--provider', '--model', '--profile', '--plan', '-p'
  ]);
  const unknownFlags = rawArgs.filter((arg) => arg.startsWith('-') && !knownFlags.has(arg.split('=')[0]));
  if (unknownFlags.length) {
    console.error(`Unknown option(s): ${unknownFlags.join(', ')}`);
    process.exit(1);
  }
  // Full initialization path
  void main();
}

// ============================================================================
// MAIN: Load heavy modules only after fast-path check
// ============================================================================
async function main(): Promise<void> {
  // Force color support for TTY terminals (chalk may not detect properly)
  if (process.stdout.isTTY && !process.env['NO_COLOR']) {
    process.env['FORCE_COLOR'] = process.env['FORCE_COLOR'] ?? '1';
  }

  // Light imports first
  const { installGlobalWriteLock } = await import('../ui/globalWriteLock.js');

  installGlobalWriteLock();

  // Check for self-test mode
  if (rawArgs.includes('--self-test')) {
    const { runSelfTest } = await import('./selfTest.js');
    runSelfTest().then((success) => {
      process.exit(success ? 0 : 1);
    }).catch((error) => {
      console.error('Self-test failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
    return;
  }

  // Check for quick mode flag
  if (rawArgs.includes('--quick') || rawArgs.includes('-q')) {
    const { runQuickMode } = await import('../headless/quickMode.js');
    runQuickMode({ argv: rawArgs }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
    return;
  }



  // Determine if we should run interactive mode
  // Interactive mode: TTY available (either with or without initial prompt)
  // Quick mode: No TTY (piped input) or explicit -q flag
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;

  if (isTTY) {
    // Run full interactive shell with rich UI
    const { runInteractiveShell } = await import('../headless/interactiveShell.js');
    runInteractiveShell({ argv: rawArgs }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
  } else {
    // Non-TTY: use quick mode for piped input
    const { runQuickMode } = await import('../headless/quickMode.js');
    runQuickMode({ argv: rawArgs }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
  }
}

// Inline help for fast response (no imports needed)
function printHelpFast(invokedAs: string = 'agi'): void {
  const commandName = invokedAs === 'erosolar' ? 'erosolar' : 'agi';
  console.log(`
${invokedAs}-cli - Unified AGI Core Interactive AI Agent

Usage: ${commandName} [options] [prompt]

Modes:
  ${commandName}                        Start interactive shell (requires TTY)
  ${commandName} "prompt"               Start interactive shell with initial prompt
  ${commandName} -q "prompt"            Quick mode - single command, minimal UI
  echo "prompt" | ${commandName}        Pipe mode - process stdin prompts

Options:
  -v, --version              Show version number
  -h, --help                 Show this help message
  -q, --quick                Quick mode (non-interactive, minimal UI)
  -p, --profile <name>       Use specified agent profile
  --self-test                Run self-tests

Examples:
  ${commandName}                                    # Start interactive shell
  ${commandName} "create a hello world script"      # Interactive with initial prompt
  ${commandName} -q "fix the build error"           # Quick mode
  echo "run npm test" | ${commandName}              # Pipe mode

Commands:
  /upgrade                   Dual-RL upgrade tournament (code improvement)
  /model                     Switch AI model
  /help                      Show available commands

Environment Variables:
  ANTHROPIC_API_KEY       Anthropic API key
  OPENAI_API_KEY          OpenAI API key
  GOOGLE_API_KEY          Google AI API key
  XAI_API_KEY             xAI (Grok) API key
  DEEPSEEK_API_KEY        DeepSeek API key
`);
}
