import { randomUUID } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ConversationMessage, ProviderId } from './types.js';
import type { ProfileName } from '../config.js';
import { getSessionStorage } from './sessionStorage.js';

export interface SessionSummary {
  id: string;
  title: string;
  profile: ProfileName;
  provider: ProviderId;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceRoot?: string;
}

export interface StoredSession extends SessionSummary {
  messages: ConversationMessage[];
  scrollbackBuffer?: string[]; // Optional scrollback history
}

export interface SaveSessionOptions {
  id?: string | null;
  title?: string | null;
  profile: ProfileName;
  provider: ProviderId;
  model: string;
  workspaceRoot?: string | null;
  messages: ConversationMessage[];
  scrollbackBuffer?: string[]; // Optional scrollback history
}

interface SessionIndex {
  entries: Record<string, SessionSummary>;
}

export function listSessions(profile?: ProfileName): SessionSummary[] {
  const index = readIndex();
  const entries = Object.values(index.entries);
  const filtered = profile ? entries.filter((entry) => entry.profile === profile) : entries;
  return filtered.sort((a, b) => {
    const aTime = Date.parse(a.updatedAt ?? '') || 0;
    const bTime = Date.parse(b.updatedAt ?? '') || 0;
    return bTime - aTime;
  });
}

export function saveSessionSnapshot(options: SaveSessionOptions): SessionSummary {
  ensureDirectory();
  if (!Array.isArray(options.messages)) {
    throw new Error('Session snapshots must include the entire message history array.');
  }

  const index = readIndex();
  const now = new Date().toISOString();
  const existingId = options.id ?? null;
  const summaryId =
    existingId && index.entries[existingId] ? existingId : randomUUID();
  const previous = index.entries[summaryId];

  const summary: SessionSummary = {
    id: summaryId,
    title: sanitizeTitle(options.title) ?? previous?.title ?? buildDefaultTitle(options.messages),
    profile: options.profile,
    provider: options.provider,
    model: options.model,
    workspaceRoot: options.workspaceRoot ?? previous?.workspaceRoot ?? undefined,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    messageCount: options.messages.length,
  };

  const payload: StoredSession = {
    ...summary,
    messages: options.messages,
    ...(options.scrollbackBuffer && { scrollbackBuffer: options.scrollbackBuffer }),
  };

  writeFile(getSessionPath(summaryId), JSON.stringify(payload, null, 2));
  index.entries[summaryId] = summary;
  writeIndex(index);
  return summary;
}

export function loadSessionById(id: string): StoredSession | null {
  if (!id) {
    return null;
  }
  const raw = readFile(getSessionPath(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed;
  } catch {
    return null;
  }
}

export function deleteSession(id: string): boolean {
  if (!id) {
    return false;
  }
  const index = readIndex();
  if (!index.entries[id]) {
    return false;
  }
  getSessionStorage().deleteFile(getSessionPath(id));
  delete index.entries[id];
  writeIndex(index);
  return true;
}

export function saveAutosaveSnapshot(
  profile: ProfileName,
  options: Omit<SaveSessionOptions, 'profile'>
): void {
  ensureDirectory();
  const payload: StoredSession = {
    id: `autosave-${profile}`,
    profile,
    provider: options.provider,
    model: options.model,
    workspaceRoot: options.workspaceRoot ?? undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: sanitizeTitle(options.title) ?? buildDefaultTitle(options.messages),
    messageCount: options.messages.length,
    messages: options.messages,
  };
  writeFile(getAutosavePath(profile), JSON.stringify(payload, null, 2));
}

export function loadAutosaveSnapshot(profile: ProfileName): StoredSession | null {
  const raw = readFile(getAutosavePath(profile));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearAutosaveSnapshot(profile: ProfileName): void {
  getSessionStorage().deleteFile(getAutosavePath(profile));
}

function readIndex(): SessionIndex {
  ensureDirectory();
  try {
    const raw = readFile(getIndexPath());
    const parsed = JSON.parse(raw) as SessionIndex;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
      return { entries: {} };
    }
    return { entries: { ...parsed.entries } };
  } catch {
    return { entries: {} };
  }
}

function writeIndex(index: SessionIndex): void {
  ensureDirectory();
  writeFile(getIndexPath(), JSON.stringify(index, null, 2));
}

function ensureDirectory(): void {
  getSessionStorage().ensureDir(getSessionsDir());
}

function getSessionPath(id: string): string {
  return join(getSessionsDir(), `${id}.json`);
}

function getAutosavePath(profile: ProfileName): string {
  return join(getSessionsDir(), `${profile}-autosave.json`);
}

function getSessionsDir(): string {
  return join(getSessionStorage().root, 'sessions');
}

function getIndexPath(): string {
  return join(getSessionsDir(), 'index.json');
}

function readFile(path: string): string | null {
  return getSessionStorage().readFile(path);
}

function writeFile(path: string, content: string): void {
  return getSessionStorage().writeFile(path, content);
}

function sanitizeTitle(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 160);
}

function buildDefaultTitle(messages: ConversationMessage[]): string {
  for (const message of messages) {
    if (message.role !== 'user') {
      continue;
    }
    const condensed = message.content.trim().replace(/\s+/g, ' ');
    if (condensed) {
      return condensed.slice(0, 160);
    }
  }
  return `Session ${new Date().toLocaleString()}`;
}

function pruneOrphans(): void {
  try {
    ensureDirectory();
    const index = readIndex();
    const known = new Set(Object.keys(index.entries));
    const dir = getSessionsDir();
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) {
        continue;
      }
      if (file === 'index.json' || file.includes('-autosave')) {
        continue;
      }
      const id = file.slice(0, -5);
      if (!known.has(id)) {
        const candidate = join(dir, file);
        const stats = statSync(candidate);
        if (stats.isFile()) {
          getSessionStorage().deleteFile(candidate);
        }
      }
    }
  } catch {
    // best-effort cleanup
  }
}

pruneOrphans();
