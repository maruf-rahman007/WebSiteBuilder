import { normalizeProjectPath, type ActionKind } from '@wb/shared';

/**
 * Streaming parser for the model's tagged output format:
 *
 *   Some prose for the user.
 *   <artifact title="Todo app">
 *     <action type="file" path="src/App.tsx">...full file contents...</action>
 *     <action type="delete" path="src/Old.tsx" />
 *   </artifact>
 *   More prose.
 *
 * Text arrives in arbitrary chunks (a tag can be split across many chunks), so
 * the parser keeps a small buffer and only emits what it can prove is not the
 * beginning of a tag. Output is identical no matter how the input is chunked.
 */

export type ParserEvent =
  | { type: 'text'; text: string }
  | { type: 'artifactOpen'; title: string }
  | { type: 'actionOpen'; id: string; kind: ActionKind; path: string }
  | { type: 'actionDelta'; id: string; text: string }
  | { type: 'actionClose'; id: string; kind: ActionKind; path: string; content: string }
  | { type: 'actionInvalid'; id: string | null; path: string; reason: string }
  | { type: 'artifactClose' }
  | { type: 'warning'; message: string };

const ARTIFACT_OPEN = '<artifact';
const ARTIFACT_CLOSE = '</artifact>';
const ACTION_OPEN = '<action';
const ACTION_CLOSE = '</action>';
/** An opening tag longer than this is treated as garbage, not a tag. */
const MAX_TAG_LENGTH = 1024;
const FENCE_LINE = /^\s*```[\w.+-]*\s*$/;

type State =
  | { kind: 'prose' }
  | { kind: 'artifact' }
  | {
      kind: 'action';
      id: string;
      action: ActionKind;
      path: string;
      content: string;
      /** Content not yet emitted as a delta (held back while ambiguous). */
      pending: string;
      started: boolean;
      strippedFence: boolean;
    }
  | { kind: 'skip-action' };

export class ArtifactParser {
  private buffer = '';
  private state: State = { kind: 'prose' };
  private actionCount = 0;
  private readonly prose = new ProseFilter();

  push(chunk: string): ParserEvent[] {
    this.buffer += chunk;
    const events: ParserEvent[] = [];
    while (this.step(events)) {
      // keep consuming while progress is made
    }
    return events;
  }

  /** Call once when the upstream stream ends. Flushes and closes open tags. */
  end(): ParserEvent[] {
    const events: ParserEvent[] = [];
    while (this.step(events)) {
      // drain
    }
    switch (this.state.kind) {
      case 'prose': {
        const text = this.prose.push(this.buffer) + this.prose.end();
        if (text) events.push({ type: 'text', text });
        break;
      }
      case 'action':
        events.push({
          type: 'actionInvalid',
          id: this.state.id,
          path: this.state.path,
          reason: 'The model stopped before finishing this file',
        });
        events.push({ type: 'artifactClose' });
        events.push({ type: 'warning', message: 'Response ended in the middle of a file' });
        break;
      case 'artifact':
      case 'skip-action':
        events.push({ type: 'artifactClose' });
        break;
    }
    this.buffer = '';
    this.state = { kind: 'prose' };
    return events;
  }

  /** Processes as much of the buffer as possible. Returns true if it made progress. */
  private step(events: ParserEvent[]): boolean {
    switch (this.state.kind) {
      case 'prose':
        return this.stepProse(events);
      case 'artifact':
        return this.stepArtifact(events);
      case 'action':
        return this.stepAction(events, this.state);
      case 'skip-action':
        return this.stepSkipAction();
    }
  }

  private stepProse(events: ParserEvent[]): boolean {
    const start = this.buffer.indexOf(ARTIFACT_OPEN);
    if (start === -1) {
      const safe = this.buffer.length - partialSuffixLength(this.buffer, ARTIFACT_OPEN);
      if (safe > 0) {
        this.emitText(events, this.prose.push(this.buffer.slice(0, safe)));
        this.buffer = this.buffer.slice(safe);
      }
      return false;
    }

    const tagEnd = findTagEnd(this.buffer, start);
    if (tagEnd === -1) {
      if (this.buffer.length - start > MAX_TAG_LENGTH) return this.treatAsText(events, start);
      // Emit what precedes the tag, wait for the rest of the tag.
      if (start > 0) {
        this.emitText(events, this.prose.push(this.buffer.slice(0, start)));
        this.buffer = this.buffer.slice(start);
        return true;
      }
      return false;
    }

    const tag = this.buffer.slice(start, tagEnd + 1);
    if (!isTagBoundary(tag, ARTIFACT_OPEN)) return this.treatAsText(events, start);

    this.emitText(
      events,
      this.prose.push(this.buffer.slice(0, start)) + this.prose.beforeArtifact(),
    );
    this.buffer = this.buffer.slice(tagEnd + 1);
    const attrs = parseAttributes(tag);
    events.push({ type: 'artifactOpen', title: attrs.title?.trim() || 'Project' });
    this.state = tag.endsWith('/>') ? { kind: 'prose' } : { kind: 'artifact' };
    if (tag.endsWith('/>')) events.push({ type: 'artifactClose' });
    return true;
  }

  private stepArtifact(events: ParserEvent[]): boolean {
    const actionStart = this.buffer.indexOf(ACTION_OPEN);
    const closeStart = this.buffer.indexOf(ARTIFACT_CLOSE);

    if (closeStart !== -1 && (actionStart === -1 || closeStart < actionStart)) {
      this.buffer = this.buffer.slice(closeStart + ARTIFACT_CLOSE.length);
      events.push({ type: 'artifactClose' });
      this.prose.afterArtifact();
      this.state = { kind: 'prose' };
      return true;
    }

    if (actionStart === -1) {
      // Only whitespace is expected between actions; drop it but keep a
      // possible partial tag at the end.
      const lastLt = this.buffer.lastIndexOf('<');
      this.buffer = lastLt === -1 ? '' : this.buffer.slice(lastLt);
      return false;
    }

    const tagEnd = findTagEnd(this.buffer, actionStart);
    if (tagEnd === -1) {
      if (this.buffer.length - actionStart > MAX_TAG_LENGTH) {
        events.push({ type: 'warning', message: 'Ignored a malformed action tag' });
        this.buffer = this.buffer.slice(actionStart + ACTION_OPEN.length);
        return true;
      }
      return false;
    }

    const tag = this.buffer.slice(actionStart, tagEnd + 1);
    this.buffer = this.buffer.slice(tagEnd + 1);
    if (!isTagBoundary(tag, ACTION_OPEN)) return true;

    const selfClosing = tag.endsWith('/>');
    const attrs = parseAttributes(tag);
    const type = attrs.type ?? 'file';
    const rawPath = attrs.path ?? attrs.filePath ?? '';

    if (type !== 'file' && type !== 'delete') {
      events.push({ type: 'warning', message: `Ignored unsupported action type "${type}"` });
      this.state = selfClosing ? { kind: 'artifact' } : { kind: 'skip-action' };
      return true;
    }

    const path = normalizeProjectPath(rawPath);
    if (!path) {
      events.push({
        type: 'actionInvalid',
        id: null,
        path: rawPath,
        reason: 'Invalid or unsafe file path',
      });
      this.state = selfClosing ? { kind: 'artifact' } : { kind: 'skip-action' };
      return true;
    }

    const id = `action-${++this.actionCount}`;
    events.push({ type: 'actionOpen', id, kind: type, path });

    if (type === 'delete') {
      events.push({ type: 'actionClose', id, kind: 'delete', path, content: '' });
      this.state = selfClosing ? { kind: 'artifact' } : { kind: 'skip-action' };
      return true;
    }
    if (selfClosing) {
      events.push({ type: 'actionInvalid', id, path, reason: 'File action had no content' });
      return true;
    }

    this.state = {
      kind: 'action',
      id,
      action: 'file',
      path,
      content: '',
      pending: '',
      started: false,
      strippedFence: false,
    };
    return true;
  }

  private stepAction(events: ParserEvent[], action: Extract<State, { kind: 'action' }>): boolean {
    const close = this.buffer.indexOf(ACTION_CLOSE);
    const available =
      close === -1 ? this.buffer.length - partialSuffixLength(this.buffer, ACTION_CLOSE) : close;

    action.pending += this.buffer.slice(0, available);
    this.buffer = this.buffer.slice(available);

    if (!action.started) {
      const decided = startActionContent(action, close !== -1);
      if (!decided) return false;
    }

    if (action.pending) {
      action.content += action.pending;
      events.push({ type: 'actionDelta', id: action.id, text: action.pending });
      action.pending = '';
    }

    if (close === -1) return false;

    this.buffer = this.buffer.slice(ACTION_CLOSE.length);
    events.push({
      type: 'actionClose',
      id: action.id,
      kind: 'file',
      path: action.path,
      content: finalizeContent(action.content, action.strippedFence),
    });
    this.state = { kind: 'artifact' };
    return true;
  }

  private stepSkipAction(): boolean {
    const close = this.buffer.indexOf(ACTION_CLOSE);
    if (close === -1) {
      this.buffer = this.buffer.slice(
        this.buffer.length - partialSuffixLength(this.buffer, ACTION_CLOSE),
      );
      return false;
    }
    this.buffer = this.buffer.slice(close + ACTION_CLOSE.length);
    this.state = { kind: 'artifact' };
    return true;
  }

  /** The `<artifact` we found was not a real tag; emit it as plain text. */
  private treatAsText(events: ParserEvent[], start: number): boolean {
    const end = start + ARTIFACT_OPEN.length;
    this.emitText(events, this.prose.push(this.buffer.slice(0, end)));
    this.buffer = this.buffer.slice(end);
    return true;
  }

  private emitText(events: ParserEvent[], text: string): void {
    if (text) events.push({ type: 'text', text });
  }
}

/**
 * Decides whether the start of a file's content is known well enough to begin
 * streaming it: drops one leading newline and an optional Markdown fence line
 * (free models often wrap file contents in ```tsx ... ```).
 */
function startActionContent(action: Extract<State, { kind: 'action' }>, closed: boolean): boolean {
  let text = action.pending;
  if (text.startsWith('\r\n')) text = text.slice(2);
  else if (text.startsWith('\n')) text = text.slice(1);
  else if (text === '\r' && !closed) return false;

  const trimmed = text.trimStart();
  if (trimmed.startsWith('`') || (trimmed === '' && !closed)) {
    const newline = text.indexOf('\n');
    if (newline === -1 && !closed) return false; // wait for the full first line
    const firstLine = newline === -1 ? text : text.slice(0, newline);
    if (FENCE_LINE.test(firstLine)) {
      text = newline === -1 ? '' : text.slice(newline + 1);
      action.strippedFence = true;
    }
  }
  action.pending = text;
  action.started = true;
  return true;
}

function finalizeContent(content: string, strippedFence: boolean): string {
  let result = content;
  if (strippedFence) result = result.replace(/\n?[ \t]*```[ \t]*\s*$/, '');
  result = result.replace(/\s+$/, '');
  return result ? `${result}\n` : '';
}

/** Length of the longest suffix of `text` that is a proper prefix of `marker`. */
export function partialSuffixLength(text: string, marker: string): number {
  const max = Math.min(marker.length - 1, text.length);
  for (let len = max; len > 0; len--) {
    if (marker.startsWith(text.slice(text.length - len))) return len;
  }
  return 0;
}

/** Finds the `>` closing a tag that starts at `start`, ignoring `>` inside quotes. */
function findTagEnd(text: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/** `<artifact>` / `<artifact title=..>` but not `<artifacts>`. */
function isTagBoundary(tag: string, open: string): boolean {
  const next = tag[open.length];
  return next === undefined || next === '>' || next === '/' || /\s/.test(next);
}

export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of tag.matchAll(pattern)) {
    attrs[match[1]!] = decodeEntities(match[2] ?? match[3] ?? '');
  }
  return attrs;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Line-aware filter for prose. Models frequently wrap the whole artifact in a
 * Markdown code fence (```xml ... ```). The filter holds fence-only lines back
 * until it knows whether they hug an artifact, and drops them if so, so the chat
 * never shows dangling fences. Other text streams through immediately.
 */
class ProseFilter {
  private line = '';
  private lineEmitted = false;
  /** A fence line (plus trailing blank lines) awaiting a decision. */
  private pendingFence: string | null = null;
  private dropNextFence = false;

  push(text: string): string {
    let out = '';
    let rest = text;
    let newline: number;
    while ((newline = rest.indexOf('\n')) !== -1) {
      out += this.completeLine(rest.slice(0, newline));
      rest = rest.slice(newline + 1);
    }
    if (!rest) return out;

    this.line += rest;
    const trimmed = this.line.trim();
    if (!this.lineEmitted && (trimmed === '' || trimmed.startsWith('`'))) return out; // maybe a fence

    if (this.pendingFence !== null) {
      out += this.pendingFence;
      this.pendingFence = null;
    }
    this.dropNextFence = false;
    out += this.lineEmitted ? rest : this.line;
    this.lineEmitted = true;
    return out;
  }

  beforeArtifact(): string {
    let out = '';
    this.pendingFence = null;
    if (!this.lineEmitted && !FENCE_LINE.test(this.line) && this.line.trim() !== '')
      out = this.line;
    this.line = '';
    this.lineEmitted = false;
    return out;
  }

  afterArtifact(): void {
    this.dropNextFence = true;
  }

  end(): string {
    let out = this.pendingFence ?? '';
    const isDroppable = this.dropNextFence && FENCE_LINE.test(this.line);
    if (!this.lineEmitted && !isDroppable) out += this.line;
    this.pendingFence = null;
    this.line = '';
    this.lineEmitted = false;
    return out;
  }

  private completeLine(segment: string): string {
    const full = this.line + segment;
    const alreadyEmitted = this.lineEmitted;
    this.line = '';
    this.lineEmitted = false;

    if (!alreadyEmitted && FENCE_LINE.test(full)) {
      if (this.dropNextFence) {
        this.dropNextFence = false;
        return '';
      }
      const out = this.pendingFence ?? '';
      this.pendingFence = `${full}\n`;
      return out;
    }
    if (!alreadyEmitted && full.trim() === '') {
      if (this.pendingFence !== null) {
        this.pendingFence += `${full}\n`;
        return '';
      }
      return `${full}\n`;
    }

    let out = '';
    if (this.pendingFence !== null) {
      out += this.pendingFence;
      this.pendingFence = null;
    }
    this.dropNextFence = false;
    return out + (alreadyEmitted ? segment : full) + '\n';
  }
}
