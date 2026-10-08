import { REQUEST_LIMITS } from '@wb/shared';
import { ArrowUp, Square } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { sendPrompt, stopGeneration } from '../../features/generation/controller';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chat-store';
import { Button } from '../ui/button';
import { ModelPicker } from './model-picker';

interface PromptComposerProps {
  variant?: 'hero' | 'docked';
  placeholder?: string;
  /** Lets parents (example chips) fill the composer. */
  value?: string;
  onValueChange?: (value: string) => void;
  autoFocus?: boolean;
}

export function PromptComposer({
  variant = 'docked',
  placeholder,
  value,
  onValueChange,
  autoFocus,
}: PromptComposerProps) {
  const [localValue, setLocalValue] = useState('');
  const text = value ?? localValue;
  const setText = onValueChange ?? setLocalValue;
  const isGenerating = useChatStore((s) => s.isGenerating);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hero = variant === 'hero';
  const tooLong = text.length > REQUEST_LIMITS.maxMessageChars;

  // Auto-grow up to a max height.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, hero ? 280 : 200)}px`;
  }, [text, hero]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (isGenerating || !text.trim() || tooLong) return;
    const prompt = text;
    setText('');
    void sendPrompt(prompt);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        'group relative rounded-2xl border border-line bg-surface-2/80 backdrop-blur transition-colors focus-within:border-line-strong',
        hero && 'shadow-[0_0_80px_-20px_rgb(139_92_246/0.45)]',
      )}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={hero ? 3 : 2}
        autoFocus={autoFocus}
        placeholder={placeholder ?? (isGenerating ? 'Generating…' : 'Describe a change…')}
        aria-label="Prompt"
        className={cn(
          'block w-full resize-none bg-transparent px-4 pt-3.5 text-fg placeholder:text-fg-subtle focus:outline-none',
          hero ? 'min-h-24 text-base' : 'min-h-14 text-sm',
        )}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <ModelPicker disabled={isGenerating} />
        <div className="flex items-center gap-2">
          {tooLong && <span className="text-xs text-danger">Prompt is too long</span>}
          {!hero && !isGenerating && (
            <span className="hidden text-[11px] text-fg-subtle sm:inline">⏎ send · ⇧⏎ newline</span>
          )}
          {isGenerating ? (
            <Button
              variant="secondary"
              size="icon"
              onClick={stopGeneration}
              aria-label="Stop generating"
              title="Stop"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="icon"
              disabled={!text.trim() || tooLong}
              aria-label="Send prompt"
              className="rounded-lg"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
