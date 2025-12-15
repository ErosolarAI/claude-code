/**
 * AGI Core - Unified Autonomous General Intelligence for Software Engineering
 *
 * This is the central intelligence module that provides:
 * 1. Unified prompt understanding and routing
 * 2. Real task decomposition and planning
 * 3. Persistent learning and memory
 * 4. Autonomous execution with verification
 *
 * NO SIMULATIONS - All operations execute real tools
 */
import { EventEmitter } from 'events';
import { type EpisodicMemory, type Episode, type MemorySearchResult } from './episodicMemory.js';
import { SelfUpgrade, type UpgradeSessionState } from './selfUpgrade.js';
import { HotReload } from './hotReload.js';
export interface AGIContext {
    workingDir: string;
    sessionId: string;
    startTime: number;
    memory: AGIMemory;
}
export interface AGIMemory {
    /** Learned patterns from successful operations */
    patterns: LearnedPattern[];
    /** Recent operations for context */
    recentOps: OperationRecord[];
    /** Project-specific knowledge */
    projectKnowledge: ProjectKnowledge;
}
export interface LearnedPattern {
    id: string;
    trigger: string;
    successfulApproach: string;
    tools: string[];
    successCount: number;
    lastUsed: number;
}
export interface OperationRecord {
    id: string;
    prompt: string;
    interpretation: string;
    tasks: string[];
    success: boolean;
    timestamp: number;
    duration: number;
    toolsUsed: string[];
    errors?: string[];
}
export interface ProjectKnowledge {
    type: 'node' | 'python' | 'rust' | 'go' | 'java' | 'unknown';
    buildSystem: string | null;
    testCommand: string | null;
    lintCommand: string | null;
    entryPoints: string[];
    dependencies: Record<string, string>;
    lastAnalyzed: number;
}
export interface AGITask {
    id: string;
    description: string;
    category: TaskCategory;
    tools: string[];
    dependencies: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
    result?: TaskResult;
}
export type TaskCategory = 'analysis' | 'search' | 'execution' | 'modification' | 'verification' | 'communication' | 'research' | 'generation' | 'computation' | 'automation';
export interface TaskResult {
    success: boolean;
    output: string;
    duration: number;
    artifacts?: string[];
    errors?: string[];
}
export interface PromptAnalysis {
    originalPrompt: string;
    interpretation: string;
    intent: PromptIntent;
    category: PromptCategory;
    confidence: number;
    tasks: AGITask[];
    clarificationNeeded: string[];
}
export type PromptIntent = 'fix_bugs' | 'add_feature' | 'refactor' | 'test' | 'document' | 'deploy' | 'analyze' | 'explain' | 'optimize' | 'security_audit' | 'setup' | 'migrate' | 'research' | 'data_analysis' | 'scientific_computing' | 'legal_research' | 'business_analysis' | 'financial_analysis' | 'automate' | 'monitor' | 'generic_task';
export type PromptCategory = 'code_modification' | 'code_analysis' | 'infrastructure' | 'testing' | 'documentation' | 'research' | 'automation' | 'scientific' | 'business' | 'legal' | 'financial' | 'operations' | 'general_coding';
export declare class AGICore extends EventEmitter {
    private context;
    private memoryPath;
    private episodicMemory;
    private currentEpisodeId;
    private selfUpgrade;
    private hotReload;
    private upgradeCheckPromise;
    constructor(workingDir?: string);
    /**
     * Non-blocking upgrade check on startup
     */
    private checkForUpgradeOnStart;
    private loadMemory;
    private createEmptyMemory;
    private saveMemory;
    /**
     * Learn from a successful operation
     */
    learnFromSuccess(prompt: string, approach: string, tools: string[]): void;
    /**
     * Record an operation for context
     */
    recordOperation(op: OperationRecord): void;
    /**
     * Get learned approach for similar prompts
     */
    getLearnedApproach(prompt: string): LearnedPattern | null;
    private normalizePrompt;
    private promptSimilarity;
    private analyzeProject;
    /**
     * Analyze a user prompt and produce a comprehensive execution plan
     */
    analyzePrompt(prompt: string): PromptAnalysis;
    private determineIntent;
    private determineCategory;
    private generateInterpretation;
    private generateTasks;
    private checkAmbiguity;
    private createFromLearnedPattern;
    /**
     * Generate tool calls for a given analysis
     * Returns explicit tool call specifications ready for execution
     */
    generateToolCalls(analysis: PromptAnalysis): ToolCallSpec[];
    /**
     * Get the current AGI context
     */
    getContext(): AGIContext;
    /**
     * Get project knowledge
     */
    getProjectKnowledge(): ProjectKnowledge;
    /**
     * Get recent operations
     */
    getRecentOperations(limit?: number): OperationRecord[];
    /**
     * Get learned patterns
     */
    getLearnedPatterns(): LearnedPattern[];
    /**
     * Force project re-analysis
     */
    refreshProjectKnowledge(): ProjectKnowledge;
    /**
     * Start tracking a new episode (task/conversation unit)
     */
    startEpisode(intent: string): string;
    /**
     * Record tool usage within the current episode
     */
    recordEpisodeToolUse(toolName: string): void;
    /**
     * Record file modification within the current episode
     */
    recordEpisodeFileModification(filePath: string): void;
    /**
     * End the current episode and save to memory
     */
    endEpisode(success: boolean, summary: string): Promise<Episode | null>;
    /**
     * Abort the current episode without saving
     */
    abortEpisode(): void;
    /**
     * Search episodic memory for similar past work
     */
    searchMemory(query: string, options?: {
        limit?: number;
        successOnly?: boolean;
        since?: number;
    }): Promise<MemorySearchResult[]>;
    /**
     * Get learned approach from episodic memory
     */
    getEpisodicApproach(intent: string): Promise<{
        approach: string[];
        tools: string[];
        successRate: number;
    } | null>;
    /**
     * Get recent episodes for context
     */
    getRecentEpisodes(limit?: number): Episode[];
    /**
     * Get episodic memory statistics
     */
    getEpisodicMemoryStats(): {
        totalEpisodes: number;
        successfulEpisodes: number;
        totalApproaches: number;
        categoryCounts: Record<string, number>;
        topTags: string[];
    };
    /**
     * Get the episodic memory instance for direct access
     */
    getEpisodicMemory(): EpisodicMemory;
    /**
     * Check if there's an active episode
     */
    hasActiveEpisode(): boolean;
    /**
     * Get current episode ID
     */
    getCurrentEpisodeId(): string | null;
    /**
     * Check for available updates
     */
    checkForUpdates(): Promise<{
        available: boolean;
        current: string;
        latest: string;
    }>;
    /**
     * Perform self-upgrade to latest version
     * Saves session state and restarts CLI automatically
     */
    performSelfUpgrade(options?: {
        version?: string;
        preserveSession?: boolean;
    }): Promise<{
        success: boolean;
        fromVersion: string;
        toVersion?: string;
        error?: string;
    }>;
    /**
     * Perform self-upgrade with build and test verification
     */
    performVerifiedUpgrade(options?: {
        version?: string;
        buildCommand?: string;
        testCommand?: string;
    }): Promise<{
        success: boolean;
        buildSuccess: boolean;
        testsPassed: number;
        testsFailed: number;
        fromVersion: string;
        toVersion?: string;
    }>;
    /**
     * Trigger hot-reload if update is available
     */
    triggerHotReload(options?: {
        preserveState?: Record<string, unknown>;
        activeEdits?: string[];
    }): Promise<{
        success: boolean;
        strategy: 'hot-swap' | 'restart';
        error?: string;
    }>;
    /**
     * Resume from previous upgrade session
     */
    resumeFromUpgrade(): UpgradeSessionState | null;
    /**
     * Get the self-upgrade instance for direct access
     */
    getSelfUpgrade(): SelfUpgrade;
    /**
     * Get the hot-reload instance for direct access
     */
    getHotReload(): HotReload;
    /**
     * Check if this session was started after an upgrade
     */
    wasUpgraded(): boolean;
    /**
     * Get version we upgraded from (if applicable)
     */
    getUpgradeFromVersion(): string | null;
}
export interface ToolCallSpec {
    tool: string;
    args: Record<string, unknown>;
    description: string;
    taskId: string;
}
export declare function getAGI(workingDir?: string): AGICore;
export declare function resetAGI(): void;
//# sourceMappingURL=agiCore.d.ts.map