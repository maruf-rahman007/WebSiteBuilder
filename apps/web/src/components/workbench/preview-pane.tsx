import {
  ExternalLink,
  LoaderCircle,
  Monitor,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tablet,
  TriangleAlert,
  X,
} from 'lucide-react';
import { sendPrompt } from '../../features/generation/controller';
import { cn } from '../../lib/utils';
import { runtime } from '../../runtime/workbench-runtime';
import { useChatStore } from '../../stores/chat-store';
import { useRuntimeStore, type PreviewIssue, type RuntimeStatus } from '../../stores/runtime-store';
import { useUiStore, type PreviewDevice } from '../../stores/ui-store';
import { Button } from '../ui/button';
import { SegmentedControl } from '../ui/tabs';

const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: '100%',
  tablet: '820px',
  mobile: '390px',
};

const STATUS_TEXT: Partial<Record<RuntimeStatus, string>> = {
  booting: 'Starting the in-browser runtime…',
  installing: 'Installing dependencies…',
  starting: 'Starting the dev server…',
};

export function PreviewPane() {
  const { previewUrl, previewNonce, status, error, issues } = useRuntimeStore();
  const reloadPreview = useRuntimeStore((s) => s.reloadPreview);
  const device = useUiStore((s) => s.previewDevice);
  const setDevice = useUiStore((s) => s.setPreviewDevice);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={reloadPreview}
          disabled={!previewUrl}
          aria-label="Reload preview"
          title="Reload"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-line bg-surface px-2.5 font-mono text-[11px] text-fg-subtle">
          <span className="truncate">{previewUrl ?? 'about:blank'}</span>
        </div>
        <SegmentedControl
          label="Preview device"
          value={device}
          onChange={setDevice}
          options={[
            { value: 'desktop', label: <Monitor className="h-3.5 w-3.5" />, title: 'Desktop' },
            { value: 'tablet', label: <Tablet className="h-3.5 w-3.5" />, title: 'Tablet' },
            { value: 'mobile', label: <Smartphone className="h-3.5 w-3.5" />, title: 'Mobile' },
          ]}
        />
        <Button
          variant="ghost"
          size="icon"
          disabled={!previewUrl}
          onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noopener,noreferrer')}
          aria-label="Open preview in a new tab"
          title="Open in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:16px_16px]">
        {previewUrl ? (
          <div
            className="mx-auto h-full transition-[width] duration-300"
            style={{ width: DEVICE_WIDTH[device], maxWidth: '100%' }}
          >
            <iframe
              key={previewNonce}
              src={previewUrl}
              title="App preview"
              className={cn(
                'h-full w-full bg-white',
                device !== 'desktop' && 'border-x border-line',
              )}
              allow="clipboard-read; clipboard-write; geolocation; microphone; camera"
            />
          </div>
        ) : (
          <PreviewPlaceholder status={status} error={error} />
        )}
        {issues.length > 0 && <IssuesBanner issues={issues} />}
      </div>
    </div>
  );
}

function PreviewPlaceholder({ status, error }: { status: RuntimeStatus; error: string | null }) {
  if (status === 'error' || status === 'stopped') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-xl border border-danger/30 bg-surface p-5 text-center">
          <TriangleAlert className="mx-auto mb-3 h-6 w-6 text-danger" />
          <p className="text-sm text-fg">{error ?? 'The preview stopped.'}</p>
          <p className="mt-1 text-xs text-fg-subtle">Open the terminal for details.</p>
          {runtime.isSupported && (
            <Button
              size="sm"
              className="mt-4"
              onClick={() => void runtime.restartDevServer().catch(() => undefined)}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Restart dev server
            </Button>
          )}
        </div>
      </div>
    );
  }

  const text = STATUS_TEXT[status];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-fg-subtle">
      {text ? (
        <>
          <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
          <p className="text-shimmer text-sm">{text}</p>
        </>
      ) : (
        <p className="text-sm">Your preview will appear here once the app is built.</p>
      )}
    </div>
  );
}

function IssuesBanner({ issues }: { issues: PreviewIssue[] }) {
  const clearIssues = useRuntimeStore((s) => s.clearIssues);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const latest = issues.at(-1)!;

  const fix = () => {
    const details = issues
      .slice(-3)
      .map((i) => `${i.message}${i.stack ? `\n${i.stack.split('\n').slice(0, 6).join('\n')}` : ''}`)
      .join('\n\n');
    clearIssues();
    void sendPrompt(
      `The preview is throwing this runtime error. Find the root cause and fix it:\n\n\`\`\`\n${details}\n\`\`\``,
    );
  };

  return (
    <div className="absolute inset-x-3 bottom-3 animate-fade-in rounded-xl border border-danger/30 bg-surface/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-fg">
            {issues.length === 1
              ? 'Runtime error in preview'
              : `${issues.length} runtime errors in preview`}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-fg-muted">{latest.message}</p>
        </div>
        <Button size="sm" variant="primary" onClick={fix} disabled={isGenerating}>
          <Sparkles className="h-3.5 w-3.5" /> Fix with AI
        </Button>
        <Button size="icon" variant="ghost" onClick={clearIssues} aria-label="Dismiss errors">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
