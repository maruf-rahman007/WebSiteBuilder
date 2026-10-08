export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

/**
 * Incremental Server-Sent Events decoder (WHATWG spec subset). Feed it text
 * chunks as they arrive; it returns every message completed by that chunk.
 * Used by the browser for our own stream and by the server for OpenRouter's.
 */
export class SseDecoder {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName = '';
  private lastId: string | undefined;

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const messages: SseMessage[] = [];

    let newline: number;
    while ((newline = this.findLineEnd()) !== -1) {
      let line = this.buffer.slice(0, newline);
      const skip = this.buffer[newline] === '\r' && this.buffer[newline + 1] === '\n' ? 2 : 1;
      this.buffer = this.buffer.slice(newline + skip);
      if (line.endsWith('\r')) line = line.slice(0, -1);

      const message = this.processLine(line);
      if (message) messages.push(message);
    }
    return messages;
  }

  /** Flushes a trailing message that was not terminated by a blank line. */
  flush(): SseMessage[] {
    const messages: SseMessage[] = [];
    if (this.buffer) {
      const message = this.processLine(this.buffer);
      this.buffer = '';
      if (message) messages.push(message);
    }
    const last = this.processLine('');
    if (last) messages.push(last);
    return messages;
  }

  private findLineEnd(): number {
    const lf = this.buffer.indexOf('\n');
    const cr = this.buffer.indexOf('\r');
    if (cr === -1) return lf;
    if (lf === -1) {
      // A lone trailing CR may be the first half of CRLF; wait for more input.
      return cr === this.buffer.length - 1 ? -1 : cr;
    }
    return Math.min(lf, cr);
  }

  private processLine(line: string): SseMessage | null {
    if (line === '') {
      if (this.dataLines.length === 0) {
        this.eventName = '';
        return null;
      }
      const message: SseMessage = {
        event: this.eventName || 'message',
        data: this.dataLines.join('\n'),
        ...(this.lastId !== undefined ? { id: this.lastId } : {}),
      };
      this.dataLines = [];
      this.eventName = '';
      return message;
    }
    if (line.startsWith(':')) return null; // comment / heartbeat

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'data':
        this.dataLines.push(value);
        break;
      case 'event':
        this.eventName = value;
        break;
      case 'id':
        this.lastId = value;
        break;
      default:
        break; // `retry` and unknown fields are ignored
    }
    return null;
  }
}

export function encodeSseData(payload: unknown, id?: string | number): string {
  const lines = JSON.stringify(payload)
    .split('\n')
    .map((l) => `data: ${l}`)
    .join('\n');
  return `${id !== undefined ? `id: ${id}\n` : ''}${lines}\n\n`;
}
