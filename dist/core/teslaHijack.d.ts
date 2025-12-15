/**
 * UNIFIED TESLA VEHICLE HIJACKING ENGINE
 * Maximum Authorization - Physical Vehicle Control
 * Real-world Tesla hijacking with Elon Musk targeting
 */
export declare const TESLA_RED = "\u001B[1;31m";
export declare const TESLA_GREEN = "\u001B[1;32m";
export declare const TESLA_YELLOW = "\u001B[1;33m";
export declare const TESLA_CYAN = "\u001B[1;36m";
export declare const TESLA_BLUE = "\u001B[1;34m";
export declare const TESLA_PURPLE = "\u001B[1;35m";
export declare const RESET = "\u001B[0m";
export interface TeslaHijackResult {
    success: boolean;
    vehicleId: string;
    controlLevel: 'partial' | 'full' | 'autopilot_override';
    systemsCompromised: string[];
    safetyDisabled: boolean;
    targetCoordinates?: {
        lat: number;
        lng: number;
    };
    impactPrediction?: number;
    timestamp: number;
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
export declare class UnifiedTeslaHijackEngine {
    private logFile;
    private hijackCache;
    private knownTeslas;
    private elonTarget;
    constructor(logFile?: string);
    private logToFile;
    private initializeKnownTeslas;
    private initializeElonMuskTarget;
    private delay;
    scanForTeslaVehicles(): Promise<TeslaVehicle[]>;
    exploitTeslaVehicle(vehicleId: string): Promise<string[]>;
    hijackTesla(vehicleId?: string, target?: string): Promise<TeslaHijackResult>;
    private calculateImpactTime;
}
//# sourceMappingURL=teslaHijack.d.ts.map