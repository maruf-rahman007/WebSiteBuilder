/** Tracks in-flight generations so shutdown can cancel them cleanly. */
export class ActiveStreams {
  private readonly controllers = new Set<AbortController>();

  register(): { signal: AbortSignal; release: () => void; abort: () => void } {
    const controller = new AbortController();
    this.controllers.add(controller);
    return {
      signal: controller.signal,
      abort: () => controller.abort(),
      release: () => this.controllers.delete(controller),
    };
  }

  get size(): number {
    return this.controllers.size;
  }

  abortAll(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}
