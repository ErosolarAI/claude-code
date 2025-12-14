import { display } from '../src/ui/display.js';
import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';

type StubSpinner = {
  clear: () => void;
  stop: () => void;
  update: () => void;
};

describe('Display spinner handling', () => {
  let originalWrite: typeof process.stdout.write;
  let originalColumns: number | undefined;
  let writes: string[];

  const createSpinnerStub = () => {
    let cleared = 0;
    const spinner: StubSpinner = {
      clear: () => {
        cleared += 1;
      },
      stop: () => {
        cleared += 1;
      },
      update: () => {},
    };
    return { spinner, getCleared: () => cleared };
  };

  beforeEach(() => {
    writes = [];
    originalWrite = process.stdout.write;
    originalColumns = process.stdout.columns;
    process.stdout.columns = 80 as any;
    process.stdout.write = ((chunk: any, _encoding?: any, cb?: any) => {
      const text = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';
      writes.push(text);
      if (typeof cb === 'function') {
        cb();
      }
      return true;
    }) as any;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    process.stdout.columns = originalColumns as any;
    (display as any).activeSpinner = null;
  });

  it('shows assistant message content directly', () => {
    display.showAssistantMessage('hello world');

    const output = writes.join('');
    // Note: showAssistantMessage no longer adds a newline by default
    // The output should start directly with the message content
    expect(output.startsWith('\n')).toBe(false);
    expect(output.includes('hello world')).toBe(true);
  });

  it('stopThinking is a no-op that does not write output', () => {
    display.stopThinking(false);

    const output = writes.join('');
    expect(output).toBe('');
  });
});