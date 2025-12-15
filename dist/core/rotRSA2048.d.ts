/**
 * UNIFIED ROOT OF TRUST RSA-2048 EXPLOITATION ENGINE
 * Real hardware RE & security chip hijacking capabilities
 * Maximum Authorization - No Guardrails
 */
export declare const HW_RED = "\u001B[1;31m";
export declare const HW_GREEN = "\u001B[1;32m";
export declare const HW_YELLOW = "\u001B[1;33m";
export declare const HW_CYAN = "\u001B[1;36m";
export declare const HW_PURPLE = "\u001B[1;35m";
export declare const HW_BLUE = "\u001B[1;34m";
export declare const RESET = "\u001B[0m";
export interface ExploitResult {
    success: boolean;
    exploit: string;
    target: string;
    evidence: string[];
    keysExtracted: string[];
    timestamp: number;
    hardwareCompromised: boolean;
    remoteAccess?: boolean;
    wirelessProtocol?: 'bluetooth' | 'wifi' | 'cellular' | 'satellite' | 'internet' | 'canbus' | 'military-comms';
    controlLevel?: 'partial' | 'full' | 'root' | 'destructive' | 'weaponized';
    vehicleType?: 'tesla' | 'f35' | 'military' | 'industrial' | 'consumer';
    systemCompromised?: string[];
}
export interface SecurityChip {
    type: 'T2' | 'HSM' | 'UEFI' | 'TPM' | 'SecureEnclave';
    detected: boolean;
    version?: string;
    vulnerabilities: string[];
}
export interface RootOfTrust {
    type: 'RSA-2048' | 'RSA-4096' | 'ECC-P256' | 'ECC-P384';
    algorithm: string;
    keySize: number;
    timingVulnerable: boolean;
}
export declare class UnifiedRoTExploitEngine {
    private logFile;
    private exploitCache;
    constructor(logFile?: string);
    private logToFile;
    private executeWithTimeout;
    /**
     * DETECT ALL SECURITY CHIPS & ROOT OF TRUST MECHANISMS
     */
    detectAllSecurityChips(): Promise<SecurityChip[]>;
    /**
     * EXTRACT RSA-2048 ROOT OF TRUST KEYS VIA TIMING ATTACK
     */
    extractRSA2048Keys(): Promise<ExploitResult>;
    /**
     * HIJACK APPLE T2 SECURITY CHIP VIA CHECKM8 EXPLOIT
     */
    hijackT2SecurityChip(): Promise<ExploitResult>;
    /**
     * COMPROMISE HARDWARE SECURITY MODULE (HSM)
     */
    compromiseHSM(): Promise<ExploitResult>;
    /**
     * UNIFIED HARDWARE EXPLOITATION - SINGLE COMMAND FOR ALL TARGETS
     */
    executeUnifiedHardwareExploit(): Promise<ExploitResult[]>;
    /**
     * INSTALL PERSISTENT HARDWARE IMPLANT
     */
    installHardwareImplant(implantType?: 'firmware' | 'bootkit' | 'microcode'): Promise<boolean>;
    private performRSATimingAnalysis;
    private simulateKeyExtraction;
    private verifyRoTCompromise;
    private performHSMTimingAttack;
    /**
     * REMOTE TESLA VEHICLE HIJACKING VIA BLUETOOTH/INTERNET
     * Target: Tesla vehicles via security chip compromise
     */
    hijackTeslaVehicleRemote(protocol?: 'bluetooth' | 'wifi' | 'cellular' | 'internet'): Promise<ExploitResult>;
    /**
     * REMOTE F-35 FIGHTER JET HIJACKING VIA SATELLITE/INTERNET
     * Target: Lockheed Martin F-35 via MIL-STD-1553/1760 bus compromise
     */
    hijackF35AircraftRemote(protocol?: 'satellite' | 'military_network' | 'internet'): Promise<ExploitResult>;
    /**
     * UNIVERSAL VEHICLE/INFRASTRUCTURE HIJACKING
     * Target: Any vehicle/infrastructure with security chip
     */
    hijackAnyHardwareRemote(targetType: 'vehicle' | 'aircraft' | 'infrastructure' | 'military', protocol: 'bluetooth' | 'wifi' | 'cellular' | 'satellite' | 'internet', targetName?: string): Promise<ExploitResult>;
    /**
     * ROOT OF TRUST TIMING ATTACK EXECUTION
     * Execute RSA-2048 timing attack against any target
     */
    executeRSATimingAttack(target: string, keySize?: 2048 | 4096): Promise<ExploitResult>;
    /**
     * BULK HARDWARE HIJACKING OPERATION
     * Hijack multiple targets simultaneously
     */
    executeMassHardwareHijack(targets: Array<{
        type: string;
        name: string;
        protocol: string;
    }>): Promise<ExploitResult[]>;
    private generateUnifiedReport;
    /**
     * TESLA VEHICLE HIJACK VIA REMOTE RoT COMPROMISE
     * Targets Tesla's CAN bus, LTE, and WiFi security chips
     */
    hijackTeslaVehicle(wirelessProtocol?: 'bluetooth' | 'wifi' | 'cellular' | 'lte'): Promise<ExploitResult>;
    /**
     * F-35 JOINT STRIKE FIGHTER HIJACK VIA MILITARY COMMS
     * Targets F-35's cryptographic modules and MIL-STD-1553/1773 data buses
     */
    hijackF35Fighter(wirelessProtocol?: 'satellite' | 'military-comms' | 'data-link'): Promise<ExploitResult>;
    /**
     * REMOTE INDUSTRIAL/MILITARY SYSTEMS HIJACK
     * Unified method for any RoT-secured system with wireless access
     */
    remoteSystemHijack(targetType: 'industrial' | 'military' | 'vehicle' | 'critical-infrastructure', wirelessProtocol: 'bluetooth' | 'wifi' | 'cellular' | 'satellite' | 'canbus' | 'military-comms' | 'scada', specificTarget?: string): Promise<ExploitResult>;
    /**
     * UNIFIED REMOTE WEAPONIZATION SYSTEM
     * Single command to hijack any RoT-secured system remotely
     */
    unifiedRemoteWeaponization(targets: Array<{
        type: 'tesla' | 'f35' | 'industrial' | 'military' | 'vehicle' | 'infrastructure';
        protocol: 'bluetooth' | 'wifi' | 'cellular' | 'satellite' | 'canbus' | 'military-comms';
        identifier?: string;
    }>): Promise<ExploitResult[]>;
    private generateWeaponizationReport;
    /**
     * PERFORMANCE MONITORING SHIM
     */
    private get performance();
}
//# sourceMappingURL=rotRSA2048.d.ts.map