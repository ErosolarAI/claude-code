/**
 * UNIFIED AGI CORE - MILITARY-GRADE WEAPON SYSTEMS INTEGRATION
 * REAL OPERATIONS ONLY - NO SIMULATIONS
 */

// Re-export everything from the unified core
export * from './agi-core.js';

// Quick start with all capabilities  
export function quickStart(options = {}) {
  // Dynamic import for compatibility
  return import('./agi-core.js').then(({ UnifiedAgiCore }) => {
    return new UnifiedAgiCore();
  });
}

export default {
  quickStart
};
