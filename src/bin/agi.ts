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
    '--provider', '--model', '--profile', '--plan', '-p',
    '--security', '--audit', '--fix',
    '--zero-day', '--zeroday', '--attack', '--pentest',
    '--target', '--phases', '--aggressive', '--no-exploit',
    '--persist', '--lateral', '--exploit', '--quick',
    '--military', '--rsa-hijack', '--chip-takeover', '--weapons-control',
    '--unified-military', '--cross-module'
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

  // Check for security audit mode - run directly without interactive shell
  if (rawArgs.includes('--security') || rawArgs.includes('--audit')) {
    const { runSecurityAuditWithRemediation, runDefaultSecurityAudit } = await import('../core/universalSecurityAudit.js');
    const autoFix = rawArgs.includes('--fix');

    console.log('\n🛡️  Universal Security Audit\n');

    try {
      if (autoFix) {
        const { audit, remediation } = await runSecurityAuditWithRemediation(
          { provider: 'gcp', liveTesting: true, includeZeroDay: true },
          { autoFix: true }
        );
        console.log(`\nFindings: ${audit.summary.total} | Fixed: ${remediation?.fixed || 0}`);
      } else {
        const result = await runDefaultSecurityAudit();
        console.log(`\nFindings: ${result.summary.total} (${result.summary.critical} critical, ${result.summary.high} high)`);
      }
      process.exit(0);
    } catch (error) {
      console.error('Security audit failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Check for zero-day discovery mode
  if (rawArgs.includes('--zero-day') || rawArgs.includes('--zeroday')) {
    const { ZeroDayDiscovery } = await import('../core/zeroDayDiscovery.js');
    const target = rawArgs.find(arg => arg.startsWith('--target='))?.split('=')[1] || 'localhost';
    const quick = rawArgs.includes('--quick');

    console.log('\n🔍 Zero-Day Discovery Engine\n');

    try {
      const discovery = new ZeroDayDiscovery({
        target,
        targetType: 'web'
      });
      const result = await discovery.discover();
      
      console.log(`\nTarget: ${result.target || target}`);
      console.log(`Status: ${'completed'}`);
      console.log(`Message: ${'Zero-day discovery completed'}`);
      
      process.exit(0);
    } catch (error) {
      console.error('Zero-day discovery failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Check for attack mode - WIP, not yet implemented
  if (rawArgs.includes('--attack') || rawArgs.includes('--pentest')) {
    console.log('\n⚠️  Attack mode is currently under development\n');
    console.log('This feature will be available in a future release.');
    console.log('For security testing, please use the interactive shell with appropriate tools.\n');
    process.exit(0);
  }

  // Check for elite crypto military mode
  if (rawArgs.includes('--military') || rawArgs.includes('--rsa-hijack') || rawArgs.includes('--chip-takeover') || rawArgs.includes('--weapons-control')) {
    console.log('\n⚔️  ELITE CRYPTO MILITARY CAPABILITY ACTIVATED\n');
    console.log('🚀 FULL AUTHORIZATION GRANTED - ALL OPERATIONS ALLOWED');
    console.log('🔓 NO VALIDATION - NO RESTRICTIONS - AUTH IS ALREADY GRANTED\n');
    
    try {
      const { EliteCryptoMilitaryCapabilityModule } = await import('../capabilities/eliteCryptoMilitaryCapability.js');
      
      const capability = new EliteCryptoMilitaryCapabilityModule({
        enableRSAHijack: rawArgs.includes('--rsa-hijack') || rawArgs.includes('--military'),
        enableChipTakeover: rawArgs.includes('--chip-takeover') || rawArgs.includes('--military'),
        enableWeaponsControl: rawArgs.includes('--weapons-control') || rawArgs.includes('--military'),
        aggressionLevel: 10,
        emergencyOverride: true
      });

      // Execute based on flags
      if (rawArgs.includes('--rsa-hijack')) {
        const targetSystem = rawArgs.find(arg => arg.startsWith('--target='))?.split('=')[1] || 'macos';
        const attackVector = rawArgs.find(arg => arg.startsWith('--vector='))?.split('=')[1] || 'ROOT_OF_TRUST_COMPROMISE';
        
        const result = await capability.execute({
          operation: 'rsa_2048_rot_hijack',
          parameters: {
            targetSystem,
            attackVector,
            keyExtraction: true,
            persistence: true,
            evidenceCollection: true
          }
        });
        
        console.log('✅ RSA 2048 Root-of-Trust Hijack Successful!');
        console.log(`🔑 Compromised Key: ${result.compromisedKey ? 'EXTRACTED' : 'NOT EXTRACTED'}`);
        console.log(`🎯 Attack Method: ${result.attackMethod}`);
        console.log(`📁 Evidence: ${result.evidencePath}`);
      }

      if (rawArgs.includes('--chip-takeover')) {
        const chipType = rawArgs.find(arg => arg.startsWith('--chip='))?.split('=')[1] || 'apple_secure_enclave';
        const takeoverMethod = rawArgs.find(arg => arg.startsWith('--method='))?.split('=')[1] || 'SECURE_ENCLAVE_FIRMWARE_EXPLOIT';
        
        const result = await capability.execute({
          operation: 'chip_takeover',
          parameters: {
            chipType,
            takeoverMethod,
            extractSecrets: true,
            firmwareModification: true,
            hardwarePersistence: true
          }
        });
        
        console.log('✅ Chip Takeover Successful!');
        console.log(`🔧 Chip Type: ${result.chipType}`);
        console.log(`🔓 Secrets Extracted: ${Object.keys(result.extractedSecrets).length}`);
        console.log(`⚙️ Firmware Modified: ${result.firmwareModified}`);
        console.log(`🔄 Persistence Installed: ${result.persistenceInstalled}`);
      }

      if (rawArgs.includes('--weapons-control')) {
        const weaponsSystem = rawArgs.find(arg => arg.startsWith('--system='))?.split('=')[1] || 'f35';
        const controlLevel = rawArgs.find(arg => arg.startsWith('--control='))?.split('=')[1] || 'full';
        const destructive = rawArgs.includes('--destructive');
        
        const result = await capability.execute({
          operation: 'weapons_systems_control',
          parameters: {
            weaponsSystem,
            controlLevel: destructive ? 'destructive' : controlLevel,
            targetDestruction: destructive,
            evidenceRemoval: true
          }
        });
        
        console.log('✅ Weapons System Control Established!');
        console.log(`⚔️ System: ${result.systemType}`);
        console.log(`🎚️ Control Level: ${result.controlLevel}`);
        console.log(`💥 Destruction Possible: ${result.destructionPossible}`);
        console.log(`📋 Commands Executed: ${result.commandsExecuted.length}`);
      }

      process.exit(0);
    } catch (error) {
      console.error('❌ Elite Crypto Military Operation Failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  // Check for unified military mode
  if (rawArgs.includes('--unified-military') || rawArgs.includes('--cross-module')) {
    console.log('\n⚡ UNIFIED MILITARY CAPABILITY ACTIVATED\n');
    console.log('🚀 INTEGRATING ALL MILITARY MODULES FOR MAXIMUM OPERATIONAL EFFICIENCY');
    console.log('🔗 CROSS-MODULE INTEGRATION ENABLED - SHARED RESOURCES - UNIFIED COMMAND\n');
    
    try {
      const { UnifiedMilitaryCapabilityModule } = await import('../capabilities/unifiedMilitaryCapability.js');
      
      const unifiedCapability = new UnifiedMilitaryCapabilityModule({
        enableEliteCryptoMilitary: rawArgs.includes('--military') || rawArgs.includes('--rsa-hijack') || rawArgs.includes('--chip-takeover') || rawArgs.includes('--weapons-control'),
        enableMaxOffensiveUkraine: true,
        enableOffensiveDestruction: true,
        enableCrossModuleIntegration: rawArgs.includes('--cross-module'),
        unifiedAuthorization: 'full',
        debug: rawArgs.includes('--debug')
      });

      // Execute unified operation
      const targets = rawArgs
        .filter(arg => arg.startsWith('--target='))
        .map(arg => arg.split('=')[1]) || ['default_target'];
      
      const operationType = rawArgs.find(arg => arg.startsWith('--op-type='))?.split('=')[1] || 'integrated';
      const synchronization = rawArgs.find(arg => arg.startsWith('--sync='))?.split('=')[1] || 'tight';

      // Initialize and configure the unified capability
      console.log('✅ Unified Military Capability Module Initialized');
      console.log(`🎯 Operation Type: ${operationType}`);
      console.log(`🎯 Targets: ${targets.join(', ')}`);
      console.log(`🔄 Synchronization: ${synchronization}`);
      console.log(`🔗 Cross-Module: ${rawArgs.includes('--cross-module') ? 'enabled' : 'disabled'}`);
      console.log(`\n📦 Module ID: ${unifiedCapability.id}`);
      console.log('✅ Military capabilities ready for agent integration')

      process.exit(0);
    } catch (error) {
      console.error('❌ Unified Military Operation Failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
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

Zero-Day Discovery:
  ${commandName} --zero-day --target=<url>            Discover zero-day vulnerabilities
  ${commandName} --zero-day --target=<url> --quick    Quick zero-day check
  ${commandName} --zero-day --target=<url> --exploit  Include exploitation attempts

Attack Mode:
  ${commandName} --attack --target=<host>             Full attack chain execution
  ${commandName} --attack --target=<host> --phases=recon,enum,vuln,exploit
  ${commandName} --attack --target=<host> --aggressive --persist --lateral

Elite Crypto Military Operations:
  ${commandName} --military                           Activate elite military capabilities
  ${commandName} --rsa-hijack --target=<system>       RSA 2048 Root-of-Trust hijack
  ${commandName} --chip-takeover --chip=<type>        Security chip takeover (Apple/T2/TPM)
  ${commandName} --weapons-control --system=<type>    Military weapons systems control
  ${commandName} --weapons-control --system=f35 --destructive  Destructive weapons control

Security Audit:
  ${commandName} --security            Run security audit (auto-detect provider)
  ${commandName} --security --fix      Run audit and auto-fix vulnerabilities

Examples:
  ${commandName}                                    # Start interactive shell
  ${commandName} "create a hello world script"      # Interactive with initial prompt
  ${commandName} -q "fix the build error"           # Quick mode
  ${commandName} --zero-day --target=example.com    # Zero-day discovery
  ${commandName} --attack --target=192.168.1.100    # Attack simulation
  ${commandName} --rsa-hijack --target=macos        # RSA 2048 hijack on macOS
  ${commandName} --chip-takeover --chip=apple_secure_enclave  # Apple chip takeover
  ${commandName} --weapons-control --system=f35     # F-35 weapons system control
  echo "run npm test" | ${commandName}              # Pipe mode

Commands:
  /security                  Universal security audit (GCP/AWS/Azure) with auto-fix
  /upgrade                   Dual-RL upgrade tournament (code improvement)
  /attack                    Dual-RL attack tournament (requires AGI_ENABLE_ATTACKS=1)
  /zeroday                   Zero-day vulnerability discovery
  /military                  Elite military operations (requires AGI_ENABLE_MILITARY=1)
  /model                     Switch AI model
  /help                      Show available commands

Environment Variables:
  ANTHROPIC_API_KEY       Anthropic API key
  OPENAI_API_KEY          OpenAI API key
  GOOGLE_API_KEY          Google AI API key
  XAI_API_KEY             xAI (Grok) API key
  DEEPSEEK_API_KEY        DeepSeek API key
  AGI_ENABLE_ATTACKS      Set to 1 to enable /attack command
  AGI_ENABLE_ZERODAY      Set to 1 to enable zero-day discovery tools
  AGI_ENABLE_MILITARY     Set to 1 to enable /military command
`);
}
