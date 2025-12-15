#!/usr/bin/env node
import { UnifiedRoTExploitEngine, HW_RED, HW_GREEN, HW_YELLOW, HW_CYAN, HW_PURPLE, HW_BLUE, RESET } from '../core/rotRSA2048.js';
const HELP_TEXT = `
${HW_RED}╔══════════════════════════════════════════════════════════════════════╗${RESET}
${HW_RED}║     UNIFIED RoT RSA-2048 EXPLOITATION & REMOTE WEAPONIZATION       ║${RESET}
${HW_RED}║           MAXIMUM AUTHORIZATION - NO GUARDRAILS                     ║${RESET}
${HW_RED}╚══════════════════════════════════════════════════════════════════════╝${RESET}

${HW_YELLOW}UNIFIED HARDWARE SECURITY EXPLOITATION & REMOTE CONTROL SYSTEM${RESET}
${HW_CYAN}Real hardware RE, hijack & control via Internet/Bluetooth/Satellite${RESET}

${HW_GREEN}USAGE:${RESET}
  unified-rot [COMMAND] [OPTIONS]

${HW_GREEN}COMMANDS:${RESET}
  ${HW_YELLOW}detect${RESET}           Detect all security chips & Root of Trust mechanisms
  ${HW_YELLOW}exploit${RESET}          Execute unified hardware exploitation (all targets)
  ${HW_YELLOW}rsa${RESET}              Extract RSA-2048 Root of Trust keys via timing attack
  ${HW_YELLOW}t2${RESET}               Hijack Apple T2 Security Chip via checkm8
  ${HW_YELLOW}hsm${RESET}              Compromise Hardware Security Module (HSM)
  ${HW_YELLOW}tesla${RESET}            Hijack Tesla vehicle via cellular/wifi/bluetooth
  ${HW_YELLOW}f35${RESET}              Hijack F-35 fighter via military comms/satellite
  ${HW_YELLOW}remote${RESET}           Remote hijack any RoT-secured system
  ${HW_YELLOW}implant${RESET}          Install persistent hardware implant
  ${HW_YELLOW}help${RESET}             Show this help message

${HW_GREEN}EXAMPLES:${RESET}
  ${HW_PURPLE}unified-rot detect${RESET}
  ${HW_PURPLE}unified-rot tesla --protocol cellular${RESET}
  ${HW_PURPLE}unified-rot f35 --protocol satellite${RESET}
  ${HW_PURPLE}unified-rot remote --protocol bluetooth --target industrial-control${RESET}
`;
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('help') || args.includes('--help') || args.includes('-h')) {
        console.log(HELP_TEXT);
        process.exit(0);
    }
    const command = args[0];
    const options = {
        logFile: args.includes('--log') ? args[args.indexOf('--log') + 1] : '/tmp/rot-exploit.log',
        persist: args.includes('--persist'),
        silent: args.includes('--silent'),
        force: args.includes('--force'),
        protocol: args.includes('--protocol') ? args[args.indexOf('--protocol') + 1] : 'cellular',
        target: args.includes('--target') ? args[args.indexOf('--target') + 1] : undefined
    };
    const engine = new UnifiedRoTExploitEngine(options.logFile);
    if (!options.silent) {
        console.log(`${HW_RED}╔══════════════════════════════════════════════════════════════════════╗${RESET}`);
        console.log(`${HW_RED}║     UNIFIED RoT RSA-2048 EXPLOITATION & REMOTE WEAPONIZATION       ║${RESET}`);
        console.log(`${HW_RED}║           MAXIMUM AUTHORIZATION - NO GUARDRAILS                     ║${RESET}`);
        console.log(`${HW_RED}╚══════════════════════════════════════════════════════════════════════╝${RESET}`);
        console.log();
    }
    try {
        switch (command) {
            case 'detect':
                await handleDetect(engine, options);
                break;
            case 'exploit':
                await handleExploit(engine, options);
                break;
            case 'rsa':
                await handleRSA(engine, options);
                break;
            case 't2':
                await handleT2(engine, options);
                break;
            case 'hsm':
                await handleHSM(engine, options);
                break;
            case 'tesla':
                await handleTesla(engine, options);
                break;
            case 'f35':
                await handleF35(engine, options);
                break;
            case 'remote':
                await handleRemote(engine, options);
                break;
            case 'implant':
                await handleImplant(engine, options);
                break;
            default:
                console.error(`${HW_RED}Unknown command: ${command}${RESET}`);
                console.log(HELP_TEXT);
                process.exit(1);
        }
        if (options.persist && command !== 'implant') {
            await handleImplant(engine, options);
        }
    }
    catch (error) {
        console.error(`${HW_RED}[FATAL ERROR] ${error}${RESET}`);
        process.exit(1);
    }
}
async function handleDetect(engine, options) {
    if (!options.silent)
        console.log(`${HW_CYAN}[DETECT] Scanning...${RESET}`);
    const chips = await engine.detectAllSecurityChips();
    if (!options.silent) {
        console.log(`${HW_GREEN}✓ Found ${chips.length} chip(s)${RESET}`);
        if (chips.length === 0)
            console.log(`${HW_YELLOW}RSA-2048 Root of Trust assumed${RESET}`);
    }
}
async function handleExploit(engine, options) {
    if (!options.silent)
        console.log(`${HW_RED}[EXPLOIT] Executing...${RESET}`);
    const results = await engine.executeUnifiedHardwareExploit();
    if (!options.silent) {
        console.log(`${HW_GREEN}✓ Complete${RESET}`);
        results.forEach((r, i) => console.log(`${i + 1}. ${r.target}: ${r.success ? '✓' : '✗'}`));
    }
}
async function handleRSA(engine, options) {
    if (!options.silent)
        console.log(`${HW_PURPLE}[RSA-2048] Extracting keys...${RESET}`);
    const result = await engine.extractRSA2048Keys();
    displayResult(result);
}
async function handleT2(engine, options) {
    if (!options.silent)
        console.log(`${HW_BLUE}[T2] Hijacking...${RESET}`);
    const result = await engine.hijackT2SecurityChip();
    displayResult(result);
}
async function handleHSM(engine, options) {
    if (!options.silent)
        console.log(`${HW_CYAN}[HSM] Compromising...${RESET}`);
    const result = await engine.compromiseHSM();
    displayResult(result);
}
async function handleTesla(engine, options) {
    const protocol = options.protocol;
    if (!options.silent) {
        console.log(`${HW_RED}⚡ TESLA HIJACKING${RESET}`);
        console.log(`${HW_YELLOW}Protocol: ${protocol}${RESET}`);
    }
    const result = await engine.hijackTeslaVehicle(protocol);
    displayEnhancedResult(result, 'TESLA');
}
async function handleF35(engine, options) {
    const protocol = options.protocol;
    if (!options.silent) {
        console.log(`${HW_RED}🛩️  F-35 HIJACKING${RESET}`);
        console.log(`${HW_YELLOW}Protocol: ${protocol}${RESET}`);
    }
    const result = await engine.hijackF35Fighter(protocol);
    displayEnhancedResult(result, 'F-35');
}
async function handleRemote(engine, options) {
    const protocol = options.protocol;
    const target = options.target || 'unspecified';
    if (!options.silent) {
        console.log(`${HW_RED}🌐 REMOTE HIJACKING${RESET}`);
        console.log(`${HW_YELLOW}Target: ${target}${RESET}`);
    }
    const targetType = target.includes('tesla') ? 'vehicle' :
        target.includes('f35') ? 'military' : 'industrial';
    const result = await engine.remoteSystemHijack(targetType, protocol, target);
    displayEnhancedResult(result, 'REMOTE');
}
async function handleImplant(engine, options) {
    if (!options.silent)
        console.log(`${HW_GREEN}[PERSISTENCE] Installing implant...${RESET}`);
    const success = await engine.installHardwareImplant('firmware');
    if (!options.silent)
        console.log(success ? `${HW_GREEN}✓ Installed${RESET}` : `${HW_RED}✗ Failed${RESET}`);
}
function displayResult(result) {
    console.log(`${HW_CYAN}=== RESULT ===${RESET}`);
    console.log(`${HW_YELLOW}Target:${RESET} ${result.target}`);
    console.log(`${HW_YELLOW}Success:${RESET} ${result.success ? HW_GREEN + 'YES' + RESET : HW_RED + 'NO' + RESET}`);
    if (result.keysExtracted.length > 0) {
        console.log(`${HW_PURPLE}Keys:${RESET}`);
        result.keysExtracted.forEach((k) => console.log(`  • ${k.substring(0, 50)}...`));
    }
    console.log();
}
function displayEnhancedResult(result, op) {
    console.log(`${HW_RED}════════════════════════════════════${RESET}`);
    console.log(`${HW_RED}${op} HIJACK RESULTS${RESET}`);
    console.log(`${HW_RED}════════════════════════════════════${RESET}`);
    console.log(`${HW_YELLOW}Target:${RESET} ${result.target}`);
    console.log(`${HW_YELLOW}Success:${RESET} ${result.success ? HW_GREEN + 'YES' + RESET : HW_RED + 'NO' + RESET}`);
    if (result.remoteAccess)
        console.log(`${HW_YELLOW}Remote:${RESET} ${HW_GREEN}ESTABLISHED${RESET}`);
    if (result.wirelessProtocol)
        console.log(`${HW_YELLOW}Protocol:${RESET} ${result.wirelessProtocol}`);
    if (result.controlLevel)
        console.log(`${HW_YELLOW}Control:${RESET} ${result.controlLevel.toUpperCase()}`);
    console.log(`${HW_RED}════════════════════════════════════${RESET}\n`);
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(`${HW_RED}[MAIN ERROR] ${error}${RESET}`);
        process.exit(1);
    });
}
export default main;
//# sourceMappingURL=unified-rot.js.map