import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SessionStorage {
  root: string;
  ensureDir(path: string): void;
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  deleteFile(path: string): void;
  listFiles(path: string): string[];
  exists(path: string): boolean;
}

class FsSessionStorage implements SessionStorage {
  root: string;

  constructor(root: string) {
    this.root = root;
  }

  ensureDir(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  readFile(path: string): string | null {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return null;
    }
  }

  writeFile(path: string, content: string): void {
    writeFileSync(path, content, 'utf-8');
  }

  deleteFile(path: string): void {
    try {
      rmSync(path, { force: true });
    } catch {
      // ignore
    }
  }

  listFiles(path: string): string[] {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  }

  exists(path: string): boolean {
    return existsSync(path);
  }
}

function resolveDataRoot(): string {
  return (
    process.env['AGI_DATA_DIR']?.trim() ||
    process.env['EROSOLAR_DATA_DIR']?.trim() ||
    join(homedir(), '.agi')
  );
}

let sessionStorage: SessionStorage | null = null;

export function getSessionStorage(): SessionStorage {
  if (!sessionStorage) {
    sessionStorage = new FsSessionStorage(resolveDataRoot());
  }
  return sessionStorage;
}

export function setSessionStorage(storage: SessionStorage): void {
  sessionStorage = storage;
}

export function createInMemorySessionStorage(root = '/mem'): SessionStorage {
  const files = new Map<string, string>();
  return {
    root,
    ensureDir: () => {},
    readFile: (path) => files.get(path) ?? null,
    writeFile: (path, content) => {
      files.set(path, content);
    },
    deleteFile: (path) => {
      files.delete(path);
    },
    listFiles: () => Array.from(files.keys()),
    exists: (path) => files.has(path),
  };
}
