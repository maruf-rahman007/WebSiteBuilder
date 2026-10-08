import { ChevronRight, FileCode, FileText, Folder, FolderOpen, LoaderCircle } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { buildFileTree, type TreeNode } from '../../lib/file-tree';
import { cn } from '../../lib/utils';
import { useProjectStore } from '../../stores/project-store';

const CODE_EXTENSIONS = /\.(tsx?|jsx?|css|html|json)$/;

export function FileTree() {
  // Subscribe to the joined path list, not file contents, so typing doesn't re-render the tree.
  const pathKey = useProjectStore((s) => {
    const paths = new Set([...Object.keys(s.files), ...Object.keys(s.streaming)]);
    return [...paths].sort().join('\n');
  });
  const tree = useMemo(() => buildFileTree(pathKey ? pathKey.split('\n') : []), [pathKey]);

  return (
    <nav aria-label="Project files" className="h-full overflow-y-auto py-2 text-[13px]">
      <p className="px-3 pb-1.5 text-[11px] font-medium tracking-wider text-fg-subtle uppercase">
        Files
      </p>
      <ul role="tree">
        {tree.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} />
        ))}
      </ul>
    </nav>
  );
}

const TreeItem = memo(function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const selected = useProjectStore((s) => s.selectedPath === node.path);
  const streaming = useProjectStore((s) => node.path in s.streaming);
  const selectFile = useProjectStore((s) => s.selectFile);
  const indent = { paddingLeft: `${depth * 12 + 10}px` };

  if (node.type === 'folder') {
    const Icon = open ? FolderOpen : Folder;
    return (
      <li role="treeitem" aria-expanded={open}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={indent}
          className="flex w-full items-center gap-1.5 py-1 pr-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <ChevronRight
            className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')}
          />
          <Icon className="h-3.5 w-3.5 shrink-0 text-accent/80" />
          <span className="truncate">{node.name}</span>
        </button>
        {open && (
          <ul role="group">
            {node.children.map((child) => (
              <TreeItem key={child.path} node={child} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const Icon = CODE_EXTENSIONS.test(node.name) ? FileCode : FileText;
  return (
    <li role="treeitem" aria-selected={selected}>
      <button
        type="button"
        onClick={() => selectFile(node.path)}
        style={indent}
        className={cn(
          'flex w-full items-center gap-1.5 py-1 pr-2 transition-colors',
          selected ? 'bg-accent-soft text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        )}
      >
        <span className="w-3 shrink-0" />
        <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        <span className="truncate">{node.name}</span>
        {streaming && (
          <LoaderCircle
            className="ml-auto h-3 w-3 shrink-0 animate-spin text-accent"
            aria-label="Writing"
          />
        )}
      </button>
    </li>
  );
});
