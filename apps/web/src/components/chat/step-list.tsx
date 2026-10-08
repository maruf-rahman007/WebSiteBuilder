import { CircleCheck, CircleDashed, CircleMinus, CircleX, LoaderCircle } from 'lucide-react';
import { useProjectStore } from '../../stores/project-store';
import { useUiStore } from '../../stores/ui-store';
import type { Step, StepStatus } from '../../stores/chat-store';
import { cn } from '../../lib/utils';

const STATUS_ICON: Record<
  StepStatus,
  { icon: typeof CircleCheck; className: string; label: string }
> = {
  pending: { icon: CircleDashed, className: 'text-fg-subtle', label: 'Pending' },
  running: { icon: LoaderCircle, className: 'text-accent animate-spin', label: 'In progress' },
  done: { icon: CircleCheck, className: 'text-success', label: 'Done' },
  error: { icon: CircleX, className: 'text-danger', label: 'Failed' },
  skipped: { icon: CircleMinus, className: 'text-fg-subtle', label: 'Skipped' },
};

export function StepList({ title, steps }: { title: string | null; steps: Step[] }) {
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const progress = steps.length === 0 ? 0 : Math.round((done / steps.length) * 100);

  return (
    <div className="animate-fade-in overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <span className="truncate text-xs font-medium text-fg">{title ?? 'Working on it'}</span>
        <span className="shrink-0 font-mono text-[11px] text-fg-subtle tabular-nums">
          {done}/{steps.length}
        </span>
      </div>
      <div className="h-0.5 bg-surface-3">
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ol className="max-h-80 overflow-y-auto py-1">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ol>
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  const { icon: Icon, className, label } = STATUS_ICON[step.status];
  const selectFile = useProjectStore((s) => s.selectFile);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const openable = Boolean(step.path) && step.kind !== 'delete';

  const content = (
    <>
      <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', className)} aria-label={label} />
      <span className="min-w-0 flex-1">
        <span
          className={cn('text-xs', step.status === 'pending' ? 'text-fg-subtle' : 'text-fg-muted')}
        >
          {step.label}
        </span>
        {step.path && (
          <span
            className={cn(
              'ml-1.5 font-mono text-[11px]',
              step.kind === 'delete' ? 'text-danger/80 line-through' : 'text-fg',
            )}
          >
            {step.path}
          </span>
        )}
        {step.detail && (
          <span
            className={cn(
              'block text-[11px]',
              step.status === 'error' ? 'text-danger' : 'text-fg-subtle',
            )}
          >
            {step.detail}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li>
      {openable ? (
        <button
          type="button"
          onClick={() => {
            selectFile(step.path!);
            setActiveTab('code');
          }}
          className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-2"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-2 px-3 py-1.5">{content}</div>
      )}
    </li>
  );
}
