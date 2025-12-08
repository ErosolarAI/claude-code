import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ToolExecutionIO } from './toolRuntimeTypes.js';

export const defaultToolIO: ToolExecutionIO = {
  root: '',
  ensureDir(path) {
    mkdirSync(path, { recursive: true });
  },
  readFile(path) {
    return readFileSync(path, 'utf-8');
  },
  writeFile(path, content) {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    return writeFileSync(path, content, 'utf-8');
  },
  deleteFile(path) {
    return rmSync(path, { force: true });
  },
  exists(path) {
    return existsSync(path);
  },
};
