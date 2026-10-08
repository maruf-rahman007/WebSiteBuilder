import { Download, LoaderCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { downloadCurrentProject, startNewProject } from '../../features/project/project-actions';
import { useChatStore } from '../../stores/chat-store';
import { useProjectStore } from '../../stores/project-store';
import { Button } from '../ui/button';
import { Logo } from '../ui/logo';

export function AppHeader() {
  const title = useProjectStore((s) => s.title);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadCurrentProject();
    } finally {
      setDownloading(false);
    }
  };

  const newProject = () => {
    if (
      window.confirm(
        'Start a new project? The current project will be discarded. Download it first if you want to keep it.',
      )
    ) {
      void startNewProject();
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-canvas px-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo />
        <span className="hidden text-sm font-semibold sm:inline">Website Builder</span>
        {title && (
          <>
            <span className="text-fg-subtle">/</span>
            <span className="truncate text-sm text-fg-muted">{title}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={newProject}>
          <Plus className="h-3.5 w-3.5" /> New
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void download()}
          disabled={isGenerating || downloading}
        >
          {downloading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download
        </Button>
      </div>
    </header>
  );
}
