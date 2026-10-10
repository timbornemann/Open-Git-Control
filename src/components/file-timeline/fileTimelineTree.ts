import type { FileTimelineCommit, FileTimelineNode, FileTimelineStatus } from './types';

/** Bounded checkpoints keep playback/scrubbing from replaying the entire history on every step. */
export class FileTimelineTreeReader {
  private files: Set<string>;
  private cursor = -1;
  private checkpoints = new Map<number, Set<string>>();
  private last: { index: number; path: string; tree: FileTimelineNode } | null = null;
  constructor(private readonly commits: FileTimelineCommit[]) {
    this.files = new Set(commits[0]?.baselineFiles ?? []);
    this.checkpoints.set(-1, new Set(this.files));
  }
  tree(index: number, path = ''): FileTimelineNode {
    if (this.last?.index === index && this.last.path === path) return this.last.tree;
    if (index < this.cursor) {
      const checkpoint = Math.max(...[...this.checkpoints.keys()].filter((value) => value <= index));
      this.files = new Set(this.checkpoints.get(checkpoint));
      this.cursor = checkpoint;
    }
    for (let current = this.cursor + 1; current <= index; current++) {
      for (const change of this.commits[current]?.changes ?? []) {
        if (change.status === 'deleted') this.files.delete(change.path);
        else {
          if (change.oldPath && change.status === 'renamed') this.files.delete(change.oldPath);
          this.files.add(change.path);
        }
      }
      if (current % 128 === 127) {
        this.checkpoints.set(current, new Set(this.files));
        while (this.checkpoints.size > 12) this.checkpoints.delete([...this.checkpoints.keys()].find((value) => value !== -1)!);
      }
    }
    this.cursor = index;
    const statuses = new Map((this.commits[index]?.changes ?? []).map((change) => [change.path, change.status]));
    const root: FileTimelineNode = { name: 'root', path: '', type: 'folder', status: 'unchanged', children: new Map() };
    const prefix = path.replace(/\/$/, '') + '/';
    for (const file of this.files) {
      if (path && file !== path && !file.startsWith(prefix)) continue;
      addFile(root, file, statuses.get(file) ?? 'unchanged');
    }
    this.last = { index, path, tree: root };
    return root;
  }
}
function addFile(root: FileTimelineNode, path: string, status: FileTimelineStatus) {
  const segments = path.split('/');
  let parent = root;
  let currentPath = '';
  for (let index = 0; index < segments.length; index++) {
    const name = segments[index];
    currentPath = currentPath ? `${currentPath}/${name}` : name;
    const file = index === segments.length - 1;
    const child: FileTimelineNode = parent.children!.get(name) ?? {
      name,
      path: currentPath,
      type: file ? 'file' : 'folder',
      status: file ? status : 'unchanged',
      children: file ? undefined : new Map(),
    };
    parent.children!.set(name, child);
    parent = child;
  }
}
