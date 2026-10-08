import { describe, expect, it } from 'vitest';
import { SseDecoder, encodeSseData } from '../src/sse.js';

describe('SseDecoder', () => {
  it('decodes messages split across arbitrary chunk boundaries', () => {
    const payload = encodeSseData({ a: 1 }) + encodeSseData({ b: 'two' }, 7);
    for (let size = 1; size <= payload.length; size++) {
      const decoder = new SseDecoder();
      const out = [];
      for (let i = 0; i < payload.length; i += size)
        out.push(...decoder.push(payload.slice(i, i + size)));
      expect(out.map((m) => JSON.parse(m.data))).toEqual([{ a: 1 }, { b: 'two' }]);
      expect(out[1]?.id).toBe('7');
    }
  });

  it('ignores comments and joins multi-line data', () => {
    const decoder = new SseDecoder();
    const out = decoder.push(': ping\n\nevent: custom\ndata: line1\ndata: line2\n\n');
    expect(out).toEqual([{ event: 'custom', data: 'line1\nline2' }]);
  });

  it('handles CRLF line endings, including a CR at a chunk boundary', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: x\r')).toEqual([]);
    expect(decoder.push('\n\r\n')).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('flushes an unterminated trailing message', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: tail')).toEqual([]);
    expect(decoder.flush()).toEqual([{ event: 'message', data: 'tail' }]);
  });
});
