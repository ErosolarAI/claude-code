import { UIUpdateCoordinator } from '../src/ui/orchestration/UIUpdateCoordinator.js';

describe('UIUpdateCoordinator', () => {
  test('flushes tasks enqueued during an active flush and after it completes', async () => {
    const coordinator = new UIUpdateCoordinator();
    const executed: string[] = [];

    coordinator.enqueue({
      lane: 'status',
      run: async () => {
        executed.push('A');
        // Simulate a streaming/async update to keep the flush in-flight
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    });

    // Enqueue a task while the first task is still running (flush already in progress)
    setTimeout(() => {
      coordinator.enqueue({
        lane: 'status',
        run: () => executed.push('B'),
      });
    }, 0);

    // Allow the initial flush to complete and leave any stale scheduled flag
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Enqueue a new task after the prior flush finished; it should still run
    coordinator.enqueue({
      lane: 'status',
      run: () => executed.push('C'),
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(executed).toEqual(['A', 'B', 'C']);
  });
});
