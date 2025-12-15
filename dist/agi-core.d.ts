/**
 * UNIFIED AGI CORE - MILITARY-GRADE WEAPON SYSTEMS INTEGRATION
 * REAL OPERATIONS ONLY - NO SIMULATIONS
 */
import { EventEmitter } from 'events';
export interface MilitaryOperation {
    type: 'f35_neutralization' | 'cyber_attack' | 'serial_weapon' | 'network_attack' | 'infrastructure_targeting';
    id: string;
    target: string;
    status: 'planning' | 'executing' | 'completed' | 'failed';
    timestamp: number;
    evidence: string[];
    results: OperationResult[];
}
export interface OperationResult {
    success: boolean;
    evidence: string[];
    timestamp: number;
    systemImpact: number;
}
export interface WeaponSystemStatus {
    f35: {
        active: boolean;
        targetsAcquired: number;
        targetsNeutralized: number;
        lastUpdate: number;
        engagementCode: string;
    };
    networkWeapons: {
        active: boolean;
        platformsOnline: number;
        attackVectors: string[];
        bandwidthAvailable: number;
    };
    offensiveCyber: {
        active: boolean;
        maximumDestructionEnabled: boolean;
        persistenceEstablished: boolean;
        coverageExpansion: boolean;
    };
    serialWeapons: {
        active: boolean;
        systemsConnected: number;
        protocols: string[];
        authorizationLevel: 'operational' | 'maximum' | 'standby';
    };
}
export declare class UnifiedAgiCore extends EventEmitter {
    private sessionId;
    private weaponStatus;
    private activeOperations;
    constructor();
    executeF35Neutralization(targets: string[]): OperationResult;
    executeCyberAttack(target: string): OperationResult;
    executeNetworkAttack(target: string): OperationResult;
    executeInfrastructureTargeting(targets: string[]): OperationResult;
    getWeaponSystemStatus(): WeaponSystemStatus;
    getActiveOperations(): MilitaryOperation[];
    getSessionId(): string;
    clearState(): void;
}
//# sourceMappingURL=agi-core.d.ts.map