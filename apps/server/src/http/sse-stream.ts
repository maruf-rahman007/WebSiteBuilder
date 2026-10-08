import { once } from 'node:events';
import { encodeSseData, type StreamEvent } from '@wb/shared';
import type { Response } from 'express';

export interface SseStreamOptions {
  heartbeatMs?: number;
}

/**
 * Thin wrapper around an Express response that writes typed events as SSE,
 * respects socket backpressure and keeps intermediaries from buffering or
 * timing out the connection.
 */
export class SseStream {
  private seq = 0;
  private heartbeat: NodeJS.Timeout | undefined;
  private ended = false;

  constructor(
    private readonly res: Response,
    private readonly options: SseStreamOptions = {},
  ) {}

  open(): void {
    this.res.status(200);
    this.res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    this.res.setHeader('Cache-Control', 'no-cache, no-transform');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('X-Accel-Buffering', 'no'); // nginx: don't buffer
    this.res.flushHeaders();
    this.res.socket?.setNoDelay(true);

    const interval = this.options.heartbeatMs ?? 15_000;
    this.heartbeat = setInterval(() => this.writeRaw(': ping\n\n'), interval);
    this.heartbeat.unref();
  }

  get closed(): boolean {
    return this.ended || this.res.writableEnded || this.res.destroyed;
  }

  async send(event: StreamEvent): Promise<void> {
    if (this.closed) return;
    const ok = this.writeRaw(encodeSseData(event, ++this.seq));
    if (!ok && !this.closed) {
      await Promise.race([once(this.res, 'drain'), once(this.res, 'close')]);
    }
  }

  end(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.ended) return;
    this.ended = true;
    if (!this.res.writableEnded) this.res.end();
  }

  private writeRaw(chunk: string): boolean {
    if (this.closed) return true;
    return this.res.write(chunk);
  }
}
