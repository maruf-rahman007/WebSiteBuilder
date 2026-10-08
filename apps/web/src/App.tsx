import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { Landing } from './components/landing/landing';
import { runtime } from './runtime/workbench-runtime';
import { useChatStore } from './stores/chat-store';

// The workspace carries the editor, terminal and markdown renderer; keep it
// out of the landing page bundle and prefetch it while the user types.
const loadWorkspace = () => import('./components/layout/workspace');
const Workspace = lazy(() => loadWorkspace().then((m) => ({ default: m.Workspace })));

export function App() {
  const hasMessages = useChatStore((s) => s.messages.length > 0);

  useEffect(() => {
    void loadWorkspace();
  }, []);

  // Warn before leaving: there's no persistence, so a reload loses the project.
  useEffect(() => {
    if (!hasMessages) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasMessages]);

  return (
    <div className="flex h-full flex-col">
      {!runtime.isSupported && <IsolationWarning />}
      <div className="min-h-0 flex-1">
        {hasMessages ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
              </div>
            }
          >
            <Workspace />
          </Suspense>
        ) : (
          <Landing />
        )}
      </div>
    </div>
  );
}

function IsolationWarning() {
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
      Live preview needs a cross-origin isolated page (COOP/COEP headers) and a Chromium-based
      browser, Firefox or Safari 16.4+.
    </div>
  );
}
