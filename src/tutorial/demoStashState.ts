import type { BranchChangeFile } from '@/shared/ipc/branchChange';
import { DEMO_TIME, ok, unavailable, type DemoRepository, type DemoCommit } from './demoRepository';
import { getDemoBlob, setDemoBlob, sameDemoBlob, demoGitText, type DemoFiles } from './demoBlob';
import { refreshDemoFiles } from './demoFiles';
import { demoDirectorySet, validDemoTreePath } from './demoDirectories';
import { demoTreeChanges } from './demoHistory';
import { demoTextDiff } from './demoDiff';

export type DemoStashSnapshot = {
  hash: string;
  baseHash: string;
  indexHash: string;
  untrackedHash: string;
  branch: string;
  baseFiles: DemoFiles;
  indexFiles: DemoFiles;
  workFiles: DemoFiles;
  untrackedFiles: DemoFiles;
  files: BranchChangeFile[];
};
const changed = (before: ReturnType<typeof getDemoBlob>, after: ReturnType<typeof getDemoBlob>) =>
  sameDemoBlob(before, after) ? ' ' : before === undefined ? 'A' : after === undefined ? 'D' : 'M';
export function describeDemoChanges(repo: DemoRepository): BranchChangeFile[] {
  const rows: BranchChangeFile[] = [];
  for (const path of new Set([...repo.staged, ...repo.modified, ...repo.untracked])) {
    const head = getDemoBlob(repo.headFiles, path),
      index = getDemoBlob(repo.indexFiles, path),
      work = getDemoBlob(repo.files, path);
    const text = demoGitText(work ?? index ?? head);
    const binary = text === undefined || text.includes('\0');
    if (repo.staged.has(path) || repo.modified.has(path))
      rows.push({ path, index: changed(head, index), worktree: index === undefined && repo.untracked.has(path) ? ' ' : changed(index, work), binary });
    if (repo.untracked.has(path)) rows.push({ path, index: '?', worktree: '?', binary });
  }
  return rows;
}
const copyPath = (into: DemoFiles, from: DemoFiles, path: string) => {
  const blob = getDemoBlob(from, path);
  if (blob === undefined) delete into[path];
  else setDemoBlob(into, path, structuredClone(blob));
};
const objectId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Saved objects are immutable and have unique IDs across fresh providers/caches. */
export function createDemoStash(repo: DemoRepository, subject: string, includeUntracked: boolean, paths?: readonly string[]): DemoStashSnapshot | undefined {
  if (!repo.commits[0] || repo.conflicted || repo.mergeState)
    throw Error('Create an initial commit and finish the pending merge before saving practice changes.');
  const files = describeDemoChanges(repo).filter(
    (file) =>
      (includeUntracked || file.index !== '?') &&
      (!paths?.length || paths.some((path) => path === '.' || path === file.path || file.path.startsWith(path + '/'))),
  );
  if (!files.length) return undefined;
  const baseFiles = structuredClone(repo.headFiles),
    indexFiles = structuredClone(baseFiles),
    workFiles = structuredClone(baseFiles),
    untrackedFiles: DemoFiles = {};
  const tracked = new Set(files.filter((file) => file.index !== '?').map((file) => file.path));
  const untracked = new Set(files.filter((file) => file.index === '?').map((file) => file.path));
  for (const path of tracked) {
    copyPath(indexFiles, repo.indexFiles, path);
    copyPath(workFiles, repo.files, path);
  }
  for (const path of untracked) {
    copyPath(untrackedFiles, repo.files, path);
    if (getDemoBlob(repo.indexFiles, path) === undefined) delete workFiles[path];
  }
  const snapshot: DemoStashSnapshot = {
    hash: objectId(),
    baseHash: repo.commits[0].hash,
    indexHash: objectId(),
    untrackedHash: objectId(),
    branch: repo.branch,
    baseFiles,
    indexFiles,
    workFiles,
    untrackedFiles,
    files: structuredClone(files),
  };
  const date = new Date(Math.max(DEMO_TIME, ...repo.commits.map((commit) => Date.parse(commit.date))) + 1000).toISOString();
  const object = (hash: string, parent: string, subject: string, files: DemoFiles): DemoCommit => ({
    hash,
    parent,
    subject,
    files: structuredClone(files),
    date,
    author: 'Alex Beispiel',
    email: 'alex@example.invalid',
  });
  repo.commits.push(
    object(snapshot.hash, [snapshot.baseHash, snapshot.indexHash, ...(includeUntracked ? [snapshot.untrackedHash] : [])].join(' '), subject, workFiles),
    object(snapshot.indexHash, snapshot.baseHash, 'index: ' + subject, indexFiles),
  );
  if (includeUntracked) repo.commits.push(object(snapshot.untrackedHash, '', 'untracked: ' + subject, untrackedFiles));
  repo.stashSnapshots.set(snapshot.hash, structuredClone(snapshot));
  repo.stashes.unshift({ index: 0, name: 'stash@{0}', hash: snapshot.hash, branch: repo.branch, subject });
  renumberDemoStashes(repo);
  for (const path of untracked) delete repo.files[path];
  for (const path of tracked) {
    copyPath(repo.indexFiles, baseFiles, path);
    copyPath(repo.files, baseFiles, path);
  }
  refreshDemoFiles(repo);
  repo.mark('stashed');
  repo.emitChannel('tree', repo.activeRepo);
  return snapshot;
}
export function renumberDemoStashes(repo: DemoRepository) {
  repo.stashes.forEach((stash, index) => {
    stash.index = index;
    stash.name = 'stash@{' + index + '}';
  });
}
export function dropDemoStash(repo: DemoRepository, hash: string) {
  repo.stashes = repo.stashes.filter((stash) => stash.hash !== hash);
  repo.stashSnapshots.delete(hash);
  repo.parkedChanges = repo.parkedChanges.filter((session) => session.stashOid !== hash);
  renumberDemoStashes(repo);
}
function collision(paths: readonly string[], selected: string) {
  const key = selected.toLocaleLowerCase();
  return paths.some((path) => {
    const next = path.toLocaleLowerCase();
    return key === next || key.startsWith(next + '/') || next.startsWith(key + '/');
  });
}
/** Prepare both trees completely before exposing a restored byte or staged flag. */
export function restoredDemoStashTrees(repo: DemoRepository, snapshot: DemoStashSnapshot, restoreIndex = true, requireClean = true) {
  if ((requireClean && repo.changeCount()) || repo.conflicted || repo.mergeState) throw Error('Commit or park the current changes before restoring.');
  const currentPaths = [...Object.keys(repo.files), ...Object.keys(repo.indexFiles)];
  for (const path of Object.keys(snapshot.untrackedFiles))
    if (collision(currentPaths, path)) throw Error('A saved new practice path would overwrite an existing file.');
  const files = structuredClone(repo.files),
    index = structuredClone(repo.indexFiles);
  for (const path of new Set([...Object.keys(snapshot.baseFiles), ...Object.keys(snapshot.indexFiles), ...Object.keys(snapshot.workFiles)])) {
    const base = getDemoBlob(snapshot.baseFiles, path),
      staged = getDemoBlob(snapshot.indexFiles, path),
      work = getDemoBlob(snapshot.workFiles, path);
    if (sameDemoBlob(base, staged) && sameDemoBlob(staged, work)) continue;
    if (!sameDemoBlob(getDemoBlob(repo.headFiles, path), base))
      throw Error('Diese Zieländerung wird in dieser Übung noch nicht unterstützt. / This target change is not supported in this exercise yet.');
    if (!sameDemoBlob(getDemoBlob(repo.indexFiles, path), base) || !sameDemoBlob(getDemoBlob(repo.files, path), base))
      throw Error('Die aktuelle Übungsdatei würde überschrieben. / The current practice file would be overwritten.');
    const added = base === undefined && work !== undefined;
    if (added && collision(currentPaths, path)) throw Error('A saved practice path would collide with an existing file or directory.');
    copyPath(files, snapshot.workFiles, path);
    if (restoreIndex) copyPath(index, snapshot.indexFiles, path);
    else if (added) copyPath(index, snapshot.workFiles, path);
  }
  for (const path of Object.keys(snapshot.untrackedFiles)) {
    if (collision([...Object.keys(files), ...Object.keys(index)], path)) throw Error('A saved new practice path would overwrite an existing file.');
    copyPath(files, snapshot.untrackedFiles, path);
  }
  return { files, index };
}
export function applyDemoStash(repo: DemoRepository, snapshot: DemoStashSnapshot, restoreIndex = true, requireClean = true) {
  const result = restoredDemoStashTrees(repo, snapshot, restoreIndex, requireClean);
  repo.files = result.files;
  repo.indexFiles = result.index;
  repo.directories = demoDirectorySet(Object.keys(repo.files), [...repo.directories]);
  refreshDemoFiles(repo);
  repo.mark('stash-restored');
  repo.emitChannel('tree', repo.activeRepo);
}
function parseStashPush(tokens: readonly string[]) {
  let subject = 'Übungsänderungen / Practice changes',
    named = false,
    includeUntracked = false;
  let paths: string[] | undefined;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '--') {
      paths = tokens.slice(index + 1);
      if (paths.some((path) => path !== '.' && !validDemoTreePath(path))) return;
      break;
    }
    if (token === '-m') {
      if (named || tokens[index + 1] === undefined) return;
      subject = tokens[++index];
      named = true;
    } else if (token === '-u' || token === '--include-untracked') includeUntracked = true;
    else return;
  }
  if (!subject.trim() || /[\0\r\n]/.test(subject)) return;
  return { subject, includeUntracked, paths };
}
export function demoStashCommand(repo: DemoRepository, args: readonly string[]) {
  try {
    const operation = args[0] || 'push';
    const tokens = args.slice(args.length ? 1 : 0);
    if (operation === 'list')
      return tokens.length ? unavailable() : ok(repo.stashes.map((stash) => `${stash.name}: On ${stash.branch}: ${stash.subject}`).join('\n'));
    if (['show', 'pop', 'apply', 'drop'].includes(operation)) {
      const flags = operation === 'show' ? ['-u', '--include-untracked', '--name-only', '-z', '-p', '--patch'] : operation === 'drop' ? [] : ['--index'];
      const references = tokens.filter((arg) => !arg.startsWith('-'));
      if (
        references.length > 1 ||
        references.some((arg) => !/^stash@\{(?:0|[1-9]\d*)\}$/.test(arg)) ||
        tokens.some((arg) => arg.startsWith('-') && !flags.includes(arg))
      )
        return unavailable();
      const reference = references[0] || 'stash@{0}';
      const entry = repo.stashes.find((stash) => stash.name === reference);
      const snapshot = entry && repo.stashSnapshots.get(entry.hash);
      if (!entry || !snapshot) return unavailable();
      if (operation === 'show') {
        const include = args.includes('-u') || args.includes('--include-untracked');
        const changes = demoTreeChanges(snapshot.baseFiles, snapshot.workFiles).map((change) => change.path);
        const paths = [...new Set([...changes, ...(include ? Object.keys(snapshot.untrackedFiles) : [])])].sort();
        if (args.includes('--name-only')) return ok(paths.join(args.includes('-z') ? '\0' : '\n') + (paths.length ? (args.includes('-z') ? '\0' : '\n') : ''));
        return ok(
          paths
            .map((path) =>
              demoTextDiff(path, getDemoBlob(snapshot.baseFiles, path), getDemoBlob(snapshot.untrackedFiles, path) ?? getDemoBlob(snapshot.workFiles, path)),
            )
            .join(''),
        );
      }
      if (operation !== 'drop') applyDemoStash(repo, snapshot, args.includes('--index'), false);
      if (operation !== 'apply') dropDemoStash(repo, snapshot.hash);
      if (operation === 'drop') repo.mark('stash-dropped');
      return ok('');
    }
    if (operation !== 'push') return unavailable();
    const request = parseStashPush(tokens);
    if (!request) return unavailable();
    createDemoStash(repo, request.subject, request.includeUntracked, request.paths);
    return ok('');
  } catch (cause) {
    return { success: false as const, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
