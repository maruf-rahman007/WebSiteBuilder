import { Group, Panel, Separator } from 'react-resizable-panels';
import { ChatPanel } from '../chat/chat-panel';
import { Workbench } from '../workbench/workbench';
import { AppHeader } from './app-header';

export function Workspace() {
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel id="chat" defaultSize="32" minSize={320} maxSize="55">
          <ChatPanel />
        </Panel>
        <Separator className="w-px bg-line transition-colors hover:bg-accent data-[separator=active]:bg-accent" />
        <Panel id="workbench" minSize="40">
          <Workbench />
        </Panel>
      </Group>
    </div>
  );
}
