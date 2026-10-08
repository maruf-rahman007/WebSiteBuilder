import { useEffect, useRef } from 'react';
import { useChatStore, type UserMessage } from '../../stores/chat-store';
import { AssistantMessage } from './assistant-message';
import { PromptComposer } from './prompt-composer';

/** Distance from the bottom (px) within which we keep auto-scrolling. */
const STICKY_THRESHOLD = 120;

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <section aria-label="Chat" className="flex h-full min-h-0 flex-col bg-canvas">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
        aria-live="polite"
      >
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.map((message) =>
            message.role === 'user' ? (
              <UserBubble key={message.id} message={message} />
            ) : (
              <AssistantMessage key={message.id} message={message} />
            ),
          )}
        </div>
      </div>
      <div className="border-t border-line p-3">
        <PromptComposer />
      </div>
    </section>
  );
}

function UserBubble({ message }: { message: UserMessage }) {
  return (
    <div className="flex animate-fade-in justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-surface-3 px-3.5 py-2 text-sm text-fg">
        {message.content}
      </p>
    </div>
  );
}
