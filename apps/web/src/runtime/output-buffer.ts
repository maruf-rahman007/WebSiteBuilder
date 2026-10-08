type Listener = (chunk: string) => void;

/**
 * Bounded log of process output. Lets the terminal view replay history when it
 * mounts (or remounts) without keeping unbounded output in memory.
 */
export class OutputBuffer {
  private chunks: string[] = [];
  private size = 0;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly maxChars = 200_000) {}

  write(chunk: string): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.maxChars && this.chunks.length > 1) {
      this.size -= this.chunks.shift()!.length;
    }
    for (const listener of this.listeners) listener(chunk);
  }

  snapshot(): string {
    return this.chunks.join('');
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.chunks = [];
    this.size = 0;
  }
}
