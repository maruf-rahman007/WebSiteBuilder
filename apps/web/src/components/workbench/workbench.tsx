import { Code, Eye, LoaderCircle, SquareTerminal } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { cn } from '../../lib/utils';
import { useRuntimeStore } from '../../stores/runtime-store';
import { useUiStore } from '../../stores/ui-store';
import { Button } from '../ui/button';
import { SegmentedControl } from '../ui/tabs';
import { CodeEditor } from './code-editor';
import { FileTree } from './file-tree';
import { PreviewPane } from './preview-pane';
import { TerminalPanel } from './terminal-panel';

export function Workbench() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);
  const runtimeBusy = useRuntimeStore((s) =>
    ['booting', 'installing', 'starting'].includes(s.status),
  );

  return (
    <section aria-label="Workbench" className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-2">
        <SegmentedControl
          label="Workbench view"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            {
              value: 'code',
              label: (
                <>
                  <Code className="h-3.5 w-3.5" /> Code
                </>
              ),
            },
            {
              value: 'preview',
              label: (
                <>
                  {runtimeBusy ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}{' '}
                  Preview
                </>
              ),
            },
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTerminal}
          aria-pressed={terminalOpen}
          className={cn(terminalOpen && 'bg-surface-2 text-fg')}
        >
          <SquareTerminal className="h-3.5 w-3.5" /> Terminal
        </Button>
      </div>

      <Group orientation="vertical" className="min-h-0 flex-1">
        <Panel id="main" minSize="20">
          {/* Both views stay mounted so the iframe and editor keep their state. */}
          <div className={cn('h-full', activeTab !== 'code' && 'hidden')}>
            <Group orientation="horizontal">
              <Panel
                id="tree"
                defaultSize="22"
                minSize={160}
                maxSize="40"
                className="border-r border-line bg-canvas/40"
              >
                <FileTree />
              </Panel>
              <Separator className="w-px bg-line transition-colors hover:bg-accent data-[separator=active]:bg-accent" />
              <Panel id="editor" minSize="30">
                <CodeEditor />
              </Panel>
            </Group>
          </div>
          <div className={cn('h-full', activeTab !== 'preview' && 'hidden')}>
            <PreviewPane />
          </div>
        </Panel>
        {terminalOpen && (
          <>
            <Separator className="h-px bg-line transition-colors hover:bg-accent" />
            <Panel id="terminal" defaultSize="30" minSize={80} className="bg-canvas">
              <TerminalPanel />
            </Panel>
          </>
        )}
      </Group>
    </section>
  );
}
