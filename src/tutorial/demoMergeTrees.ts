import type { DemoCommit, DemoRepository } from './demoRepository';
import { getDemoBlob, sameDemoBlob, setDemoBlob, readDemoBlob, demoBlob, type DemoBlob, type DemoFiles } from './demoBlob';
import { reachableDemoCommits } from './demoBranchRefs';
import { validDemoTreePath } from './demoDirectories';
import { mergeDemoText } from './demoMergeText';

export type DemoMergeConflict = { base?: DemoBlob; ours?: DemoBlob; theirs?: DemoBlob; code: 'UU' | 'AA' | 'UD' | 'DU' };
export type DemoMergeTree = { files: DemoFiles; conflicts: Map<string, DemoMergeConflict> };
function mergeBase(repo: DemoRepository, ours: DemoCommit, theirs: DemoCommit) {
  const incoming = new Set(reachableDemoCommits(repo, [theirs.hash]).map((entry) => entry.hash));
  const common = reachableDemoCommits(repo, [ours.hash]).filter((entry) => incoming.has(entry.hash));
  const older = new Set<string>();
  for (const entry of common) for (const ancestor of reachableDemoCommits(repo, [entry.hash])) if (ancestor.hash !== entry.hash) older.add(ancestor.hash);
  const bases = common.filter((entry) => !older.has(entry.hash));
  if (bases.length !== 1) throw new Error('The practice branches need one unambiguous common merge base.');
  return bases[0].files || {};
}
function validateTree(files: DemoFiles) {
  const paths = Object.keys(files),
    found = new Set(paths.map((path) => path.toLowerCase()));
  if (found.size !== paths.length) throw new Error('The merged practice paths would collide.');
  for (const path of paths) {
    const normalized = path.toLowerCase();
    if (!validDemoTreePath(path)) throw new Error('Choose a valid merged practice path.');
    for (let parent = normalized.lastIndexOf('/'); parent >= 0; parent = normalized.lastIndexOf('/', parent - 1))
      if (found.has(normalized.slice(0, parent))) throw new Error('A merged practice file would collide with a directory.');
  }
}
/** Merge saved trees against their actual common ancestor, before writing. */
export function mergeDemoTrees(repo: DemoRepository, ours: DemoCommit, theirs: DemoCommit, source: string): DemoMergeTree {
  return mergeDemoFileTrees(mergeBase(repo, ours, theirs), ours.files || {}, theirs.files || {}, source);
}
/** Replay also needs an explicit base: the selected commit's own parent. */
export function mergeDemoFileTrees(base: DemoFiles, left: DemoFiles, right: DemoFiles, source: string): DemoMergeTree {
  const files: DemoFiles = {},
    conflicts = new Map<string, DemoMergeConflict>();
  for (const path of new Set([...Object.keys(base), ...Object.keys(left), ...Object.keys(right)])) {
    const before = getDemoBlob(base, path),
      current = getDemoBlob(left, path),
      incoming = getDemoBlob(right, path);
    let result: DemoBlob | undefined;
    if (sameDemoBlob(current, incoming)) result = current;
    else if (sameDemoBlob(before, current)) result = incoming;
    else if (sameDemoBlob(before, incoming)) result = current;
    else {
      const conflict: DemoMergeConflict = {
        base: before,
        ours: current,
        theirs: incoming,
        code: before === undefined ? 'AA' : current === undefined ? 'DU' : incoming === undefined ? 'UD' : 'UU',
      };
      if (current === undefined || incoming === undefined) {
        result = current ?? incoming;
        conflicts.set(path, conflict);
      } else {
        const original = before === undefined ? undefined : readDemoBlob(before);
        const currentText = readDemoBlob(current),
          incomingText = readDemoBlob(incoming),
          encoding = currentText.encoding;
        if (encoding === 'binary' || [original, incomingText].some((entry) => entry && entry.encoding !== encoding))
          throw new Error('This binary or mixed-encoding conflict is not available in the exercise.');
        const merged = mergeDemoText(original?.text || '', currentText.text!, incomingText.text!, source);
        result = demoBlob(merged.text, encoding);
        if (merged.conflicted) conflicts.set(path, conflict);
      }
    }
    if (result !== undefined) setDemoBlob(files, path, structuredClone(result));
  }
  validateTree(files);
  return { files, conflicts };
}
