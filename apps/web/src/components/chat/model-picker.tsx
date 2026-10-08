import { ChevronDown, Cpu } from 'lucide-react';
import { useEffect } from 'react';
import { useModelsStore } from '../../stores/models-store';
import { useUiStore } from '../../stores/ui-store';
import { cn } from '../../lib/utils';

export function ModelPicker({ disabled, className }: { disabled?: boolean; className?: string }) {
  const { models, status, load } = useModelsStore();
  const model = useUiStore((s) => s.model);
  const setModel = useUiStore((s) => s.setModel);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === 'error') {
    return <span className="text-xs text-danger">Couldn't load models</span>;
  }

  return (
    <label
      className={cn(
        'relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <Cpu className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Model</span>
      <select
        value={model ?? ''}
        onChange={(e) => setModel(e.target.value)}
        disabled={disabled || models.length === 0}
        className="max-w-44 cursor-pointer appearance-none truncate bg-transparent pr-4 outline-none"
      >
        {models.length === 0 && <option value="">Loading models…</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id} className="bg-surface-2 text-fg">
            {m.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3" aria-hidden />
    </label>
  );
}
