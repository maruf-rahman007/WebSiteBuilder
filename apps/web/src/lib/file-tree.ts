export interface TreeFile {
  type: 'file';
  name: string;
  path: string;
}

export interface TreeFolder {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeFolder;

/** Builds a sorted folder tree (folders first, then files, alphabetical) from flat paths. */
export function buildFileTree(paths: Iterable<string>): TreeNode[] {
  const root: TreeFolder = { type: 'folder', name: '', path: '', children: [] };

  for (const path of paths) {
    const segments = path.split('/');
    let folder = root;
    segments.forEach((segment, index) => {
      const nodePath = segments.slice(0, index + 1).join('/');
      if (index === segments.length - 1) {
        folder.children.push({ type: 'file', name: segment, path: nodePath });
        return;
      }
      let next = folder.children.find(
        (c): c is TreeFolder => c.type === 'folder' && c.name === segment,
      );
      if (!next) {
        next = { type: 'folder', name: segment, path: nodePath, children: [] };
        folder.children.push(next);
      }
      folder = next;
    });
  }

  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1,
      )
      .map((node) => (node.type === 'folder' ? { ...node, children: sort(node.children) } : node));

  return sort(root.children);
}
