/**
 * Episodic Memory System - Cross-session pattern learning with semantic indexing
 *
 * Features:
 * 1. Episode detection and boundary marking
 * 2. Semantic indexing via vector embeddings (pluggable providers)
 * 3. Cross-session pattern learning and retrieval
 * 4. Task-specific memory with temporal decay
 * 5. Memory consolidation and pruning
 *
 * Storage: ~/.agi/episodic-memory/
 *   - episodes.json     (episode metadata index)
 *   - embeddings.bin    (vector embeddings cache)
 *   - patterns.json     (learned patterns)
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface Episode {
  id: string;
  sessionId: string;
  startTime: number;
  endTime: number;
  /** User's original intent/prompt that started this episode */
  intent: string;
  /** Category of work performed */
  category: EpisodeCategory;
  /** Tools used during this episode */
  toolsUsed: string[];
  /** Key files touched */
  filesModified: string[];
  /** Whether the episode was successful */
  success: boolean;
  /** Summary of what was accomplished */
  summary: string;
  /** Tags for semantic grouping */
  tags: string[];
  /** Embedding vector for semantic search (optional) */
  embedding?: number[];
  /** Parent episode if this is a sub-task */
  parentId?: string;
  /** Retrieval count for popularity weighting */
  retrievalCount: number;
  /** Last time this episode was retrieved */
  lastRetrieved: number;
}

export type EpisodeCategory =
  | 'bug_fix'
  | 'feature_add'
  | 'refactor'
  | 'test_write'
  | 'documentation'
  | 'analysis'
  | 'configuration'
  | 'debugging'
  | 'optimization'
  | 'migration'
  | 'unknown';

export interface LearnedApproach {
  id: string;
  /** Pattern that triggers this approach (normalized) */
  triggerPattern: string;
  /** Keywords for fast matching */
  keywords: string[];
  /** Step-by-step approach that worked */
  approach: string[];
  /** Tools typically used */
  tools: string[];
  /** Success rate (0-1) */
  successRate: number;
  /** Number of times this approach was used */
  useCount: number;
  /** Episode IDs that contributed to this pattern */
  sourceEpisodes: string[];
  /** Embedding for semantic matching */
  embedding?: number[];
  /** Last update timestamp */
  updatedAt: number;
}

export interface MemoryQuery {
  /** Natural language query */
  query: string;
  /** Filter by category */
  category?: EpisodeCategory;
  /** Filter by tags */
  tags?: string[];
  /** Filter by time range (ms since epoch) */
  since?: number;
  /** Filter by success status */
  successOnly?: boolean;
  /** Maximum results */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
}

export interface MemorySearchResult {
  episode: Episode;
  similarity: number;
  matchReason: string;
}

export interface EmbeddingProvider {
  /** Generate embedding vector for text */
  embed(text: string): Promise<number[]>;
  /** Dimension of embedding vectors */
  dimension: number;
  /** Provider name for tracking */
  name: string;
}

export interface EpisodicMemoryConfig {
  /** Maximum episodes to keep */
  maxEpisodes: number;
  /** Maximum learned approaches to keep */
  maxApproaches: number;
  /** Temporal decay factor (0-1, lower = faster decay) */
  decayFactor: number;
  /** Minimum similarity for semantic search (0-1) */
  minSimilarity: number;
  /** Enable embedding-based search */
  useEmbeddings: boolean;
  /** Embedding provider (optional) */
  embeddingProvider?: EmbeddingProvider;
  /** Storage directory */
  storageDir: string;
}

// ============================================================================
// DEFAULT EMBEDDING PROVIDER (Simple TF-IDF style, no external deps)
// ============================================================================

class SimpleEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 256;
  readonly name = 'simple-tfidf';

  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();

  async embed(text: string): Promise<number[]> {
    const tokens = this.tokenize(text);
    const vector = new Array(this.dimension).fill(0);

    // Simple hash-based embedding (deterministic, no training needed)
    for (const token of tokens) {
      const hash = this.hashToken(token);
      const idx = Math.abs(hash) % this.dimension;
      vector[idx] += 1;
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private hashToken(token: string): number {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

// ============================================================================
// EPISODIC MEMORY SYSTEM
// ============================================================================

export class EpisodicMemory {
  private config: EpisodicMemoryConfig;
  private episodes: Map<string, Episode> = new Map();
  private approaches: Map<string, LearnedApproach> = new Map();
  private embeddingProvider: EmbeddingProvider;
  private dirty = false;

  // In-memory episode being recorded
  private currentEpisode: Partial<Episode> | null = null;
  private episodeToolsUsed: Set<string> = new Set();
  private episodeFilesModified: Set<string> = new Set();

  constructor(config: Partial<EpisodicMemoryConfig> = {}) {
    const dataRoot = process.env['EROSOLAR_DATA_DIR']?.trim() || join(homedir(), '.agi');

    this.config = {
      maxEpisodes: 1000,
      maxApproaches: 200,
      decayFactor: 0.95,
      minSimilarity: 0.3,
      useEmbeddings: true,
      storageDir: join(dataRoot, 'episodic-memory'),
      ...config,
    };

    this.embeddingProvider = config.embeddingProvider || new SimpleEmbeddingProvider();
    this.load();
  }

  // ==========================================================================
  // EPISODE LIFECYCLE
  // ==========================================================================

  /**
   * Start recording a new episode
   */
  startEpisode(intent: string, sessionId: string, category?: EpisodeCategory): string {
    const id = this.generateId();

    this.currentEpisode = {
      id,
      sessionId,
      startTime: Date.now(),
      intent,
      category: category || this.inferCategory(intent),
      toolsUsed: [],
      filesModified: [],
      success: false,
      summary: '',
      tags: this.extractTags(intent),
      retrievalCount: 0,
      lastRetrieved: 0,
    };

    this.episodeToolsUsed.clear();
    this.episodeFilesModified.clear();

    return id;
  }

  /**
   * Record tool usage within current episode
   */
  recordToolUse(toolName: string): void {
    this.episodeToolsUsed.add(toolName);
  }

  /**
   * Record file modification within current episode
   */
  recordFileModification(filePath: string): void {
    this.episodeFilesModified.add(filePath);
  }

  /**
   * End current episode and save to memory
   */
  async endEpisode(success: boolean, summary: string): Promise<Episode | null> {
    if (!this.currentEpisode) return null;

    const episode: Episode = {
      ...this.currentEpisode as Episode,
      endTime: Date.now(),
      success,
      summary,
      toolsUsed: Array.from(this.episodeToolsUsed),
      filesModified: Array.from(this.episodeFilesModified),
    };

    // Generate embedding for semantic search
    if (this.config.useEmbeddings) {
      const textForEmbedding = `${episode.intent} ${episode.summary} ${episode.tags.join(' ')}`;
      episode.embedding = await this.embeddingProvider.embed(textForEmbedding);
    }

    this.episodes.set(episode.id, episode);
    this.dirty = true;

    // Learn from successful episodes
    if (success) {
      await this.learnFromEpisode(episode);
    }

    // Prune if needed
    this.pruneEpisodes();

    // Clear current episode
    this.currentEpisode = null;
    this.episodeToolsUsed.clear();
    this.episodeFilesModified.clear();

    // Auto-save
    this.save();

    return episode;
  }

  /**
   * Abort current episode without saving
   */
  abortEpisode(): void {
    this.currentEpisode = null;
    this.episodeToolsUsed.clear();
    this.episodeFilesModified.clear();
  }

  // ==========================================================================
  // RETRIEVAL & SEARCH
  // ==========================================================================

  /**
   * Search for similar past episodes
   */
  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];
    const limit = query.limit || 10;

    // Generate query embedding if using embeddings
    let queryEmbedding: number[] | null = null;
    if (this.config.useEmbeddings) {
      queryEmbedding = await this.embeddingProvider.embed(query.query);
    }

    for (const episode of this.episodes.values()) {
      // Apply filters
      if (query.category && episode.category !== query.category) continue;
      if (query.successOnly && !episode.success) continue;
      if (query.since && episode.startTime < query.since) continue;
      if (query.tags && !query.tags.some(t => episode.tags.includes(t))) continue;

      // Calculate similarity
      let similarity = 0;
      let matchReason = '';

      if (queryEmbedding && episode.embedding) {
        // Cosine similarity for embeddings
        similarity = this.cosineSimilarity(queryEmbedding, episode.embedding);
        matchReason = 'semantic similarity';
      } else {
        // Fallback to keyword matching
        similarity = this.keywordSimilarity(query.query, episode.intent + ' ' + episode.summary);
        matchReason = 'keyword match';
      }

      // Apply temporal decay
      const ageInDays = (Date.now() - episode.endTime) / (1000 * 60 * 60 * 24);
      const decayedSimilarity = similarity * Math.pow(this.config.decayFactor, ageInDays / 30);

      // Boost for popularity
      const popularityBoost = 1 + (episode.retrievalCount * 0.01);
      const finalSimilarity = decayedSimilarity * popularityBoost;

      if (finalSimilarity >= (query.minSimilarity || this.config.minSimilarity)) {
        results.push({
          episode,
          similarity: finalSimilarity,
          matchReason,
        });
      }
    }

    // Sort by similarity and limit
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, limit);

    // Update retrieval counts
    for (const result of topResults) {
      result.episode.retrievalCount++;
      result.episode.lastRetrieved = Date.now();
      this.dirty = true;
    }

    return topResults;
  }

  /**
   * Get learned approach for a task
   */
  async getApproach(intent: string): Promise<LearnedApproach | null> {
    const keywords = this.extractKeywords(intent);

    // First try exact keyword match
    for (const approach of this.approaches.values()) {
      const overlapCount = keywords.filter(k => approach.keywords.includes(k)).length;
      if (overlapCount >= Math.min(3, keywords.length * 0.5)) {
        return approach;
      }
    }

    // Try semantic search if embeddings enabled
    if (this.config.useEmbeddings) {
      const queryEmbedding = await this.embeddingProvider.embed(intent);
      let bestMatch: LearnedApproach | null = null;
      let bestSimilarity = 0;

      for (const approach of this.approaches.values()) {
        if (approach.embedding) {
          const similarity = this.cosineSimilarity(queryEmbedding, approach.embedding);
          if (similarity > bestSimilarity && similarity >= this.config.minSimilarity) {
            bestSimilarity = similarity;
            bestMatch = approach;
          }
        }
      }

      return bestMatch;
    }

    return null;
  }

  /**
   * Get recent episodes for context
   */
  getRecentEpisodes(limit = 5, sessionId?: string): Episode[] {
    const episodes = Array.from(this.episodes.values());

    const filtered = sessionId
      ? episodes.filter(e => e.sessionId === sessionId)
      : episodes;

    return filtered
      .sort((a, b) => b.endTime - a.endTime)
      .slice(0, limit);
  }

  // ==========================================================================
  // LEARNING
  // ==========================================================================

  /**
   * Learn patterns from a successful episode
   */
  private async learnFromEpisode(episode: Episode): Promise<void> {
    const keywords = this.extractKeywords(episode.intent);
    const approachKey = keywords.sort().join('_');

    const existing = this.approaches.get(approachKey);

    if (existing) {
      // Update existing approach
      existing.useCount++;
      existing.successRate = (existing.successRate * (existing.useCount - 1) + 1) / existing.useCount;
      existing.sourceEpisodes.push(episode.id);
      existing.tools = [...new Set([...existing.tools, ...episode.toolsUsed])];
      existing.updatedAt = Date.now();

      // Re-compute embedding
      if (this.config.useEmbeddings) {
        existing.embedding = await this.embeddingProvider.embed(existing.triggerPattern);
      }
    } else {
      // Create new approach
      const approach: LearnedApproach = {
        id: this.generateId(),
        triggerPattern: episode.intent,
        keywords,
        approach: [episode.summary],
        tools: episode.toolsUsed,
        successRate: 1,
        useCount: 1,
        sourceEpisodes: [episode.id],
        updatedAt: Date.now(),
      };

      if (this.config.useEmbeddings) {
        approach.embedding = await this.embeddingProvider.embed(approach.triggerPattern);
      }

      this.approaches.set(approachKey, approach);
    }

    this.pruneApproaches();
    this.dirty = true;
  }

  /**
   * Record approach failure to update success rate
   */
  recordApproachFailure(approachId: string): void {
    for (const approach of this.approaches.values()) {
      if (approach.id === approachId) {
        approach.useCount++;
        approach.successRate = (approach.successRate * (approach.useCount - 1)) / approach.useCount;
        approach.updatedAt = Date.now();
        this.dirty = true;
        break;
      }
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `ep_${timestamp}_${random}`;
  }

  private inferCategory(intent: string): EpisodeCategory {
    const lower = intent.toLowerCase();

    if (/\b(fix|bug|error|issue|crash|broken)\b/.test(lower)) return 'bug_fix';
    if (/\b(add|feature|implement|create|new)\b/.test(lower)) return 'feature_add';
    if (/\b(refactor|clean|reorganize|restructure)\b/.test(lower)) return 'refactor';
    if (/\b(test|spec|coverage)\b/.test(lower)) return 'test_write';
    if (/\b(doc|readme|comment|explain)\b/.test(lower)) return 'documentation';
    if (/\b(analyz|understand|explore|investigate)\b/.test(lower)) return 'analysis';
    if (/\b(config|setup|install|env)\b/.test(lower)) return 'configuration';
    if (/\b(debug|trace|log|inspect)\b/.test(lower)) return 'debugging';
    if (/\b(optim|perf|speed|fast)\b/.test(lower)) return 'optimization';
    if (/\b(migrat|upgrad|update|convert)\b/.test(lower)) return 'migration';

    return 'unknown';
  }

  private extractTags(text: string): string[] {
    const tags: string[] = [];
    const lower = text.toLowerCase();

    // Extract technology tags
    const techPatterns: Record<string, RegExp> = {
      typescript: /\btypescript\b|\\.tsx?\b/,
      javascript: /\bjavascript\b|\\.jsx?\b/,
      python: /\bpython\b|\\.py\b/,
      react: /\breact\b/,
      node: /\bnode\.?js?\b/,
      api: /\bapi\b|\brest\b|\bgraphql\b/,
      database: /\bdb\b|\bdatabase\b|\bsql\b|\bmongo\b/,
      test: /\btest\b|\bspec\b|\bjest\b|\bvitest\b/,
      git: /\bgit\b|\bcommit\b|\bbranch\b/,
    };

    for (const [tag, pattern] of Object.entries(techPatterns)) {
      if (pattern.test(lower)) {
        tags.push(tag);
      }
    }

    return tags;
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !['this', 'that', 'with', 'from', 'have', 'will', 'would', 'could', 'should'].includes(w));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  private keywordSimilarity(query: string, text: string): number {
    const queryWords = new Set(this.extractKeywords(query));
    const textWords = new Set(this.extractKeywords(text));

    if (queryWords.size === 0 || textWords.size === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (textWords.has(word)) matches++;
    }

    return matches / queryWords.size;
  }

  // ==========================================================================
  // PRUNING
  // ==========================================================================

  private pruneEpisodes(): void {
    if (this.episodes.size <= this.config.maxEpisodes) return;

    // Score episodes by value (recency + success + retrieval count)
    const scored = Array.from(this.episodes.values()).map(ep => {
      const ageScore = 1 - (Date.now() - ep.endTime) / (1000 * 60 * 60 * 24 * 365); // 1 year decay
      const successScore = ep.success ? 0.3 : 0;
      const retrievalScore = Math.min(ep.retrievalCount * 0.05, 0.2);
      return { id: ep.id, score: ageScore + successScore + retrievalScore };
    });

    scored.sort((a, b) => b.score - a.score);

    // Keep top episodes
    const toKeep = new Set(scored.slice(0, this.config.maxEpisodes).map(s => s.id));

    for (const id of this.episodes.keys()) {
      if (!toKeep.has(id)) {
        this.episodes.delete(id);
      }
    }
  }

  private pruneApproaches(): void {
    if (this.approaches.size <= this.config.maxApproaches) return;

    // Score approaches by usefulness
    const scored = Array.from(this.approaches.entries()).map(([key, ap]) => {
      const recencyScore = 1 - (Date.now() - ap.updatedAt) / (1000 * 60 * 60 * 24 * 180); // 6 month decay
      const useScore = Math.min(ap.useCount * 0.1, 0.3);
      const successScore = ap.successRate * 0.4;
      return { key, score: recencyScore + useScore + successScore };
    });

    scored.sort((a, b) => b.score - a.score);

    // Keep top approaches
    const toKeep = new Set(scored.slice(0, this.config.maxApproaches).map(s => s.key));

    for (const key of this.approaches.keys()) {
      if (!toKeep.has(key)) {
        this.approaches.delete(key);
      }
    }
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  private load(): void {
    try {
      if (!existsSync(this.config.storageDir)) {
        mkdirSync(this.config.storageDir, { recursive: true });
        return;
      }

      const episodesPath = join(this.config.storageDir, 'episodes.json');
      const approachesPath = join(this.config.storageDir, 'approaches.json');

      if (existsSync(episodesPath)) {
        const data = JSON.parse(readFileSync(episodesPath, 'utf-8'));
        for (const ep of data.episodes || []) {
          this.episodes.set(ep.id, ep);
        }
      }

      if (existsSync(approachesPath)) {
        const data = JSON.parse(readFileSync(approachesPath, 'utf-8'));
        for (const [key, ap] of Object.entries(data.approaches || {})) {
          this.approaches.set(key, ap as LearnedApproach);
        }
      }
    } catch (error) {
      console.error('Failed to load episodic memory:', error);
    }
  }

  save(): void {
    if (!this.dirty) return;

    try {
      mkdirSync(this.config.storageDir, { recursive: true });

      const episodesPath = join(this.config.storageDir, 'episodes.json');
      const approachesPath = join(this.config.storageDir, 'approaches.json');

      writeFileSync(episodesPath, JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        episodes: Array.from(this.episodes.values()),
      }, null, 2));

      writeFileSync(approachesPath, JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        approaches: Object.fromEntries(this.approaches),
      }, null, 2));

      this.dirty = false;
    } catch (error) {
      console.error('Failed to save episodic memory:', error);
    }
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  getStats(): {
    totalEpisodes: number;
    successfulEpisodes: number;
    totalApproaches: number;
    categoryCounts: Record<string, number>;
    topTags: string[];
  } {
    const categoryCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    let successCount = 0;

    for (const episode of this.episodes.values()) {
      categoryCounts[episode.category] = (categoryCounts[episode.category] || 0) + 1;
      if (episode.success) successCount++;
      for (const tag of episode.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    return {
      totalEpisodes: this.episodes.size,
      successfulEpisodes: successCount,
      totalApproaches: this.approaches.size,
      categoryCounts,
      topTags,
    };
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

let defaultInstance: EpisodicMemory | null = null;

/**
 * Get or create the default episodic memory instance
 */
export function getEpisodicMemory(config?: Partial<EpisodicMemoryConfig>): EpisodicMemory {
  if (!defaultInstance) {
    defaultInstance = new EpisodicMemory(config);
  }
  return defaultInstance;
}

/**
 * Create a new episodic memory instance with custom config
 */
export function createEpisodicMemory(config: Partial<EpisodicMemoryConfig> = {}): EpisodicMemory {
  return new EpisodicMemory(config);
}
