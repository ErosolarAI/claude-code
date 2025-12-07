export interface UIUpdateTask {
  lane: string;
  run: () => Promise<void> | void;
}

type Mode = 'idle' | 'flushing';

export class UIUpdateCoordinator {
  private readonly queue: UIUpdateTask[] = [];
  private flushing = false;
  private scheduled = false;
  private disposed = false;
  private mode: Mode = 'idle';

  enqueue(task: UIUpdateTask): void {
    if (this.disposed) return;
    this.queue.push(task);
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => void this.flush());
    }
  }

  getMode(): Mode {
    return this.mode;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  setMode(mode: Mode): void {
    this.mode = mode;
  }

  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.mode = 'idle';
  }

  private async flush(): Promise<void> {
    if (this.disposed || this.flushing) {
      this.scheduled = false;
      return;
    }
    this.flushing = true;
    this.scheduled = false;
    this.mode = 'flushing';

    while (this.queue.length && !this.disposed) {
      const task = this.queue.shift();
      if (!task) {
        continue;
      }
      try {
        await task.run();
      } catch {
        // Ignore individual task errors to keep UI updates flowing
      }
    }

    this.flushing = false;
    this.mode = 'idle';

    // In case more tasks were enqueued after the loop ended
    if (this.queue.length && !this.scheduled && !this.disposed) {
      this.scheduled = true;
      queueMicrotask(() => void this.flush());
    }
  }
}
