export interface DiagnosticRequest<T> {
  id: string;
  priority: number;
  timeoutMs: number;
  retries: number;
  run: () => Promise<T>;
}

export class DiagnosticScheduler {
  private queue: DiagnosticRequest<unknown>[] = [];
  private active = false;
  private stopped = false;

  enqueue<T>(request: DiagnosticRequest<T>): Promise<T> {
    if (this.stopped) return Promise.reject(new Error("HARDWARE COMMUNICATION UNAVAILABLE"));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        ...request,
        run: async () => {
          try {
            const value = await this.withRetry(request);
            resolve(value);
            return value;
          } catch (error) {
            reject(error);
            throw error;
          }
        },
      });
      this.queue.sort((a, b) => b.priority - a.priority);
      void this.drain();
    });
  }

  stop() {
    this.stopped = true;
    this.queue = [];
  }

  private async drain() {
    if (this.active) return;
    this.active = true;
    while (!this.stopped && this.queue.length) {
      const next = this.queue.shift();
      if (!next) break;
      await next.run().catch(() => undefined);
    }
    this.active = false;
  }

  private async withRetry<T>(request: DiagnosticRequest<T>) {
    let failure: unknown;
    for (let attempt = 0; attempt <= request.retries; attempt += 1) {
      try {
        return await Promise.race([
          request.run(),
          new Promise<never>((_, reject) => {
            globalThis.setTimeout(() => reject(new Error("TIMEOUT")), request.timeoutMs);
          }),
        ]);
      } catch (error) {
        failure = error;
        if (attempt < request.retries) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, 100 * 2 ** attempt));
        }
      }
    }
    throw failure;
  }
}