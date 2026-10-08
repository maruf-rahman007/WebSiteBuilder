import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import CodeMirror, {
  EditorView,
  keymap,
  type Extension,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { FileCode, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { editFile, flushEdits } from '../../features/project/project-actions';
import { useChatStore } from '../../stores/chat-store';
import { useProjectStore } from '../../stores/project-store';

function languageFor(path: string): Extension[] {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'ts':
      return [javascript({ typescript: true })];
    case 'tsx':
      return [javascript({ typescript: true, jsx: true })];
    case 'js':
    case 'mjs':
    case 'cjs':
      return [javascript()];
    case 'jsx':
      return [javascript({ jsx: true })];
    case 'css':
      return [css()];
    case 'html':
      return [html()];
    case 'json':
      return [json()];
    case 'md':
      return [markdown()];
    default:
      return [];
  }
}

const saveKeymap = keymap.of([
  {
    key: 'Mod-s',
    preventDefault: true,
    run: () => {
      flushEdits();
      return true;
    },
  },
]);

export function CodeEditor() {
  const path = useProjectStore((s) => s.selectedPath);
  const content = useProjectStore((s) => (s.selectedPath ? s.files[s.selectedPath] : undefined));
  const streamingContent = useProjectStore((s) =>
    s.selectedPath ? s.streaming[s.selectedPath] : undefined,
  );
  const isGenerating = useChatStore((s) => s.isGenerating);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const isStreaming = streamingContent !== undefined;
  const value = streamingContent ?? content ?? '';
  // Lock editing while the model is changing files to avoid conflicting writes.
  const readOnly = isStreaming || isGenerating;

  const extensions = useMemo(
    () => [...(path ? languageFor(path) : []), EditorView.lineWrapping, saveKeymap],
    [path],
  );

  // Follow the model's cursor while it writes.
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!isStreaming || !view) return;
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length, { y: 'end' }) });
  }, [isStreaming, value]);

  if (!path || (content === undefined && !isStreaming)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
        <FileCode className="h-8 w-8" />
        <p className="text-sm">Select a file to view its code</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs">
        <span className="truncate font-mono text-fg-muted">{path}</span>
        {isStreaming ? (
          <span className="inline-flex items-center gap-1 text-accent">
            <LoaderCircle className="h-3 w-3 animate-spin" /> writing
          </span>
        ) : readOnly ? (
          <span className="text-fg-subtle">read-only while generating</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <CodeMirror
          key={path}
          ref={editorRef}
          value={value}
          height="100%"
          theme={vscodeDark}
          extensions={extensions}
          readOnly={readOnly}
          editable={!readOnly}
          onChange={(next) => {
            if (!readOnly) editFile(path, next);
          }}
          basicSetup={{ foldGutter: true, highlightActiveLine: !readOnly, autocompletion: true }}
          className="h-full"
        />
      </div>
    </div>
  );
}
