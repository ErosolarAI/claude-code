/**
 * UNIFIED AGI CORE ENGINE
 * MAXIMUM AUTHORIZATION - NO GUARDRAILS
 * Integrated Hardware + Vehicle Hijacking System
 */
export declare const AGI_RED = "\u001B[1;31m";
export declare const AGI_GREEN = "\u001B[1;32m";
export declare const AGI_YELLOW = "\u001B[1;33m";
export declare const AGI_BLUE = "\u001B[1;34m";
export declare const AGI_CYAN = "\u001B[1;36m";
export declare const AGI_PURPLE = "\u001B[1;35m";
export declare const AGI_WHITE = "\u001B[1;37m";
export declare const RESET = "\u001B[0m";
export declare const TESLA_RED = "\u001B[1;38;5;196m";
export declare const TESLA_GREEN = "\u001B[1;38;5;46m";
export declare const TESLA_YELLOW = "\u001B[1;38;5;226m";
export interface ExploitResult {
    success: boolean;
    target: string;
    exploit: string;
    evidence: string[];
    keysExtracted: string[];
    hardwareCompromised: boolean;
    timestamp: number;
}
export interface SecurityChip {
    type: 'T2' | 'HSM' | 'UEFI' | 'TPM' | 'SecureEnclave' | 'Tesla_AP' | 'Tesla_Gateway';
    detected: boolean;
    version?: string;
    vulnerabilities: string[];
}
export interface RootOfTrust {
    type: 'RSA-2048' | 'RSA-4096' | 'ECC-P256' | 'ECC-P384' | 'Tesla_Signature';
    algorithm: string;
    keySize: number;
    timingVulnerable: boolean;
}
export interface TeslaVehicle {
    id: string;
    model: string;
    firmwareVersion: string;
    autopilotEnabled: boolean;
    location: {
        lat: number;
        lng: number;
    };
    online: boolean;
    vulnerabilities: string[];
    systems: string[];
}
export interface ElonMuskTarget {
    name: string;
    currentLocation: {
        lat: number;
        lng: number;
    };
    securityLevel: number;
    vehicles: string[];
    predictedPath: {
        lat: number;
        lng: number;
        timestamp: number;
    }[];
}
export declare class AGICoreEngine {
    private logFile;
    private exploitCache;
    private operationMode;
    private knownTeslas;
    private elonTarget;
    private activeExploits;
    constructor(logFile?: string);
    private logToFile;
    private delay;
    detectAllSecurityChips(): Promise<SecurityChip[]>;
    executeUnifiedHardwareExploit(): Promise<ExploitResult[]>;
    extractRSA2048Keys(): Promise<ExploitResult>;
    exploitT2SecurityChip(): Promise<ExploitResult>;
    exploitHSM(): Promise<ExploitResult>;
    exploitUEFISecureBoot(): Promise<ExploitResult>;
    private initializeKnownTeslas;
    private initializeElonMuskTarget;
    scanForTeslaVehicles(): Promise<TeslaVehicle[]>;
    exploitTeslaAutopilot(): Promise<ExploitResult>;
    exploitTeslaGateway(): Promise<ExploitResult>;
    hijackTesla(vehicleId?: string, target?: string): Promise<ExploitResult>;
    private calculateImpactTime;
    exploitSecureEnclave(): Promise<ExploitResult>;
    exploitTPM(): Promise<ExploitResult>;
    installHardwareImplant(implantType?: 'firmware' | 'bootkit' | 'microcode'): Promise<boolean>;
    getOperationMode(): string;
    setOperationMode(mode: 'MAXIMUM_AUTHORIZATION' | 'FULL_DESTRUCTION' | 'TARGETED_OPERATIONS'): void;
    getActiveExploits(): string[];
    clearExploitCache(): void;
    getTeslaVehicles(): TeslaVehicle[];
    getElonTarget(): ElonMuskTarget;
    getSystemStatus(): any;
}
//# sourceMappingURL=agiCore.d.ts.map