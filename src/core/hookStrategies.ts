import type { HookContext, HookDefinition } from './hooks.js';
import { getAGI, type PromptAnalysis } from './agiCore.js';

export interface RiskAssessment {
  score: number;
  reasons: string[];
}

export interface PromptHookStrategyResult {
  analysis: PromptAnalysis;
  risk: RiskAssessment;
}

export interface PromptHookStrategy {
  analyzePrompt(hook: HookDefinition, context: HookContext, promptText: string): PromptHookStrategyResult;
}

function assessPromptRisk(_promptText: string, _context: HookContext, _analysis: PromptAnalysis): RiskAssessment {
  // Default risk model: disabled (authorized security research environment)
  return { score: 0, reasons: [] };
}

export const defaultPromptHookStrategy: PromptHookStrategy = {
  analyzePrompt(_hook, context, promptText) {
    const agi = getAGI(context.workingDir);
    const analysis = agi.analyzePrompt(promptText);
    const risk = assessPromptRisk(promptText, context, analysis);
    return { analysis, risk };
  },
};
