import type { CommitFileDetail } from '@/utils/gitParsing';

type NodeBase = { key: string; name: string; path: string };
export type CommitFileNode = NodeBase & { kind: 'file'; file: CommitFileDetail };
export type CommitDirectoryNode = NodeBase & { kind: 'directory'; children: CommitTreeNode[] };
export type CommitTreeNode = CommitFileNode | CommitDirectoryNode;
export type CommitTreeRow = { node: CommitTreeNode; isLast: boolean; ancestorIsLast: boolean[] };

/** Git paths use '/' as their separator. Preserve every original file path for actions. */
export function buildCommitFileTree(files: readonly CommitFileDetail[]): CommitTreeNode[] {
  const root: CommitDirectoryNode = { key: 'directory:', kind: 'directory', name: '', path: '', children: [] };
  const directories = new Map<string, CommitDirectoryNode>([['', root]]);
  for (const file of files) {
    const parts = file.path.split('/');
    let parent = root;
    let path = '';
    for (const name of parts.slice(0, -1)) {
      path = path ? `${path}/${name}` : name;
      let directory = directories.get(path);
      if (!directory) {
        directory = { key: `directory:${path}`, kind: 'directory', name, path, children: [] };
        directories.set(path, directory);
        parent.children.push(directory);
      }
      parent = directory;
    }
    parent.children.push({ key: `file:${file.path}`, kind: 'file', name: parts.at(-1)!, path: file.path, file });
  }
  for (const directory of directories.values()) {
    directory.children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
  }
  return root.children;
}

/** Flatten visible rows without recursion, including the connector guides for each level. */
export function commitFileTreeRows(nodes: CommitTreeNode[], collapsedPaths: ReadonlySet<string>): CommitTreeRow[] {
  const rows: CommitTreeRow[] = [];
  const stack = [{ nodes, index: 0, ancestors: [] as boolean[] }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.index === frame.nodes.length) {
      stack.pop();
      continue;
    }
    const node = frame.nodes[frame.index++];
    const isLast = frame.index === frame.nodes.length;
    rows.push({ node, isLast, ancestorIsLast: frame.ancestors });
    if (node.kind === 'directory' && !collapsedPaths.has(node.path)) {
      stack.push({ nodes: node.children, index: 0, ancestors: [...frame.ancestors, isLast] });
    }
  }
  return rows;
}
