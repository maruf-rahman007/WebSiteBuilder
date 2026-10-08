import { Brain, ChevronRight, RotateCcw, TriangleAlert } from 'lucide-react';
import { memo, useState } from 'react';
import Markdown from 'react-markdown';
import { retryTurn } from '../../features/generation/controller';
import { cn } from '../../lib/utils';
import type { AssistantMessage as AssistantMessageModel } from '../../stores/chat-store';
import { useChatStore } from '../../stores/chat-store';
import { Logo } from '../ui/logo';
import { Button } from '../ui/button';
import { StepList } from './step-list';

export const AssistantMessage = memo(function AssistantMessage({
  message,
}: {
  message: AssistantMessageModel;
}) {
  const isGenerating = useChatStore((s) => s.isGenerating);
  const streaming = message.status === 'streaming';
  const content = message.content.trim();
  const waiting = streaming && !content && !message.reasoning && message.steps.length === 0;

  return (
    <div className="flex gap-3">
      <Logo className="mt-0.5 h-6 w-6 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        {message.reasoning && <Reasoning text={message.reasoning} active={streaming && !content} />}

        {waiting && <p className="text-shimmer text-sm">Thinking…</p>}

        {content && (
          <div className="prose-chat break-words">
            <Markdown>{content}</Markdown>
          </div>
        )}

        {message.steps.length > 0 && (
          <StepList title={message.artifactTitle} steps={message.steps} />
        )}

        {message.warnings.length > 0 && (
          <ul className="space-y-1">
            {message.warnings.map((warning, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-warning">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {warning}
              </li>
            ))}
          </ul>
        )}

        {message.status === 'cancelled' && <p className="text-xs text-fg-subtle">Stopped.</p>}

        {message.error && (
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{message.error.message}</p>
              {message.error.retryable && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  disabled={isGenerating}
                  onClick={() => void retryTurn(message.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

function Reasoning({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <Brain className="h-3.5 w-3.5" />
        <span className={cn(active && 'text-shimmer')}>{active ? 'Reasoning…' : 'Reasoning'}</span>
        <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap border-l-2 border-line pl-3 text-fg-subtle">
          {text}
        </p>
      )}
    </div>
  );
}
