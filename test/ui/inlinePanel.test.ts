import { EventEmitter } from 'events';
import { UnifiedUIRenderer } from '../../src/ui/UnifiedUIRenderer.js';
import { Display } from '../../src/ui/display.js';

type WritableLike = NodeJS.WriteStream & { isTTY?: boolean; rows?: number; columns?: number };
type ReadableLike = NodeJS.ReadStream & { isTTY?: boolean };

const makeMockStream = (): WritableLike & ReadableLike => {
  const emitter = new EventEmitter();
  const stream: Partial<WritableLike & ReadableLike> = {
    isTTY: false,
    rows: 24,
    columns: 80,
    write: jest.fn(),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
    listenerCount: emitter.listenerCount.bind(emitter),
    setMaxListeners: emitter.setMaxListeners.bind(emitter),
    getMaxListeners: emitter.getMaxListeners.bind(emitter),
    resume: jest.fn(),
    pause: jest.fn(),
    setRawMode: jest.fn(),
  };
  return stream as WritableLike & ReadableLike;
};

const makeLines = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `line-${index + 1}`);

describe('inline panel clamping', () => {
  test('UnifiedUIRenderer.limitInlinePanel caps lines and prepends overflow indicator', () => {
    const renderer = new UnifiedUIRenderer(makeMockStream(), makeMockStream());
    // Simulate a taller terminal to make the math predictable
    (renderer as any).rows = 32;

    const input = makeLines(20);
    const result = (renderer as any).limitInlinePanel(input) as string[];

    const expectedMax = Math.max(4, Math.min((renderer as any).maxInlinePanelLines, Math.max(2, 32 - 8)));
    const expectedTailCount = Math.max(1, expectedMax - 1);

    expect(result[0]).toContain('more lines');
    expect(result.length).toBe(expectedTailCount + 1);
    expect(result.slice(1)).toEqual(input.slice(-expectedTailCount));
  });

  test('Display.clampInlinePanel trims and annotates overflow', () => {
    const display = new Display(makeMockStream(), makeMockStream());
    const input = makeLines(70);

    const result = (display as any).clampInlinePanel(input) as string[];
    const expectedTailCount = 63; // maxLines (64) minus the overflow indicator

    expect(result[0]).toContain('more lines');
    expect(result.length).toBe(expectedTailCount + 1);
    expect(result.slice(1)).toEqual(input.slice(-expectedTailCount));
  });
});
