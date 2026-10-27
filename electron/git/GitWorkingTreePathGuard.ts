import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { assertOutsideGitMetadata, normalizeRepositoryRelativePath } from './RepositoryPathSafety';

type ReadGit = (args: string[]) => Promise<string>;
const WORKING_TREE_COMMANDS = new Set(['add', 'checkout', 'clean', 'diff', 'reset', 'stash', 'merge', 'cherry-pick', 'revert']);
const literalPath = (value: string): string => (value.startsWith(':(literal)') ? value.slice(10) : value);
const missing = (error: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '');

/** Check existing ancestors without requiring deleted or historical files to exist. */
export async function createGitPathChecker(repo: string): Promise<(file: string) => Promise<void>> {
  const root = await fs.realpath(repo);
  const checked = new Set<string>();
  return async (file) => {
    if (process.platform === 'win32' && /^[a-z]:/i.test(file)) throw new Error('Git path must be repository-relative.');
    const relative = normalizeRepositoryRelativePath(file, 'Git path');
    assertOutsideGitMetadata(relative, 'Git path');
    const parts = relative.split('/').filter((part) => part && part !== '.');
    let current = root;
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      if (checked.has(current)) continue;
      let entry;
      try {
        entry = await fs.lstat(current);
      } catch (error) {
        if (missing(error)) return;
        throw error;
      }
      // Git stores leaf symlinks as links. Windows junction directories, in
      // contrast, are traversed by Git and must remain inside the worktree.
      if (entry.isSymbolicLink() && index === parts.length - 1) {
        if (process.platform !== 'win32') continue;
        try {
          if (!(await fs.stat(current)).isDirectory()) continue;
        } catch (error) {
          if (missing(error)) continue;
          throw error;
        }
      }
      if (entry.isFile() && index === parts.length - 1 && !(process.platform === 'win32' && parts[index].includes('~'))) continue;
      const physical = await fs.realpath(current);
      const resolved = path.relative(root, physical);
      if (resolved === '..' || resolved.startsWith(`..${path.sep}`) || path.isAbsolute(resolved))
        throw new Error('Git path is outside the current repository.');
      assertOutsideGitMetadata(resolved, 'Git path');
      if (entry.isDirectory() || entry.isSymbolicLink()) checked.add(current);
    }
  };
}

async function optionalTree(read: ReadGit, revision: string): Promise<string | undefined> {
  const tree = await read(['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{tree}`]).catch(() => '');
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(tree.trim()) ? tree.trim() : undefined;
}

async function checkoutTree(read: ReadGit, revision: string): Promise<string | undefined> {
  const direct = await optionalTree(read, revision);
  if (direct) return direct;
  if (revision.includes('...')) {
    const [left, right] = revision.split('...');
    const base = await read(['merge-base', '--', left || 'HEAD', right || 'HEAD']).catch(() => '');
    return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(base.trim()) ? optionalTree(read, base.trim()) : undefined;
  }
  // Preserve checkout's normal remote-branch guessing while inspecting the
  // same prospective tree before Git can write through an existing junction.
  const remoteRefs = new Set((await read(['for-each-ref', '--format=%(refname)', 'refs/remotes'])).split(/\r?\n/));
  const remotes = (await read(['remote'])).split(/\r?\n/).filter(Boolean);
  const matches = remotes.map((remote) => `refs/remotes/${remote}/${revision}`).filter((ref) => remoteRefs.has(ref));
  if (matches.length === 1) return optionalTree(read, matches[0]);
  if (matches.length > 1) {
    const preferred = (await read(['config', '--get', 'checkout.defaultRemote']).catch(() => '')).trim();
    const selected = matches.find((ref) => ref === `refs/remotes/${preferred}/${revision}`);
    if (selected) return optionalTree(read, selected);
  }
  return undefined;
}

function checkoutRevision(before: string[]): string | undefined {
  if (['--ours', '--theirs'].includes(before[0])) return undefined;
  if (before[0] === '--track') return before[1];
  if (['-b', '-B'].includes(before[0])) return before[2] === '--track' ? before[3] : before[2] || 'HEAD';
  return before[0];
}

function indexPathArguments(command: string, before: string[], specs: string[]): string[] {
  const args = ['ls-files', '-z'];
  if (command !== 'clean') args.push('--cached');
  const untracked =
    command === 'add' ||
    command === 'clean' ||
    (command === 'stash' && before[0] === 'push' && before.some((arg) => ['-u', '--include-untracked'].includes(arg)));
  if (untracked) {
    args.push('--others');
    if (!before.includes('-x')) args.push('--exclude-standard');
    if (before.includes('-X')) args.push('--ignored');
  }
  return [...args, '--', ...specs];
}

function literalPathMatcher(specs: string[]): (file: string) => boolean {
  const key = (file: string) => {
    const normalized = path.posix.normalize(file).replace(/\/+$/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };
  const selected = new Set(specs.map((spec) => key(literalPath(spec))));
  if (selected.has('.')) return () => true;
  return (file) => {
    let candidate = key(file);
    while (candidate) {
      if (selected.has(candidate)) return true;
      const slash = candidate.lastIndexOf('/');
      if (slash < 0) return false;
      candidate = candidate.slice(0, slash);
    }
    return false;
  };
}

function usesWorkingTree(command: string, before: string[], revisions: string[]): boolean {
  if (command === 'reset') return before.includes('--hard'); // Index-only un-staging must still work for redirected paths.
  if (command === 'stash') return ['push', 'apply', 'pop'].includes(before[0]);
  if (command === 'diff') return !before.includes('--cached') && revisions.length < 2 && !revisions[0]?.includes('..');
  return true;
}

/** Inspect names first; never read or stage data through a path outside the repo. */
export async function assertGitWorkingTreePaths(repo: string, args: string[], read: ReadGit): Promise<void> {
  const [command, ...rest] = args;
  if (!WORKING_TREE_COMMANDS.has(command)) return;
  const separator = rest.indexOf('--');
  const before = separator < 0 ? rest : rest.slice(0, separator);
  const specs = separator < 0 ? [] : rest.slice(separator + 1);
  const revisions = before.filter((arg) => !arg.startsWith('-'));
  if (!usesWorkingTree(command, before, revisions)) return;

  const check = await createGitPathChecker(repo);
  for (const spec of specs) await check(literalPath(spec));
  // Batch staging uses a NUL-delimited file precisely to avoid OS argv limits.
  // Keep the inspection query bounded as well and select literal names locally.
  const largeSelection = specs.reduce((size, spec) => size + spec.length + 3, 0) > 8000;
  const matches = largeSelection ? literalPathMatcher(specs) : () => true;
  const files = (await read(indexPathArguments(command, before, largeSelection ? [] : specs))).split('\0').filter((file) => file && matches(file));
  for (const file of files) {
    if (command === 'clean' && !specs.length && !before.includes('-d') && file.includes('/')) continue;
    await check(file);
  }

  const targets: Array<string | undefined> = [];
  if (command === 'checkout') {
    const revision = checkoutRevision(before);
    if (revision) targets.push(await checkoutTree(read, revision));
  } else if (command === 'reset') {
    targets.push(await optionalTree(read, before[1]));
  } else if (command === 'merge' && revisions[0]) {
    targets.push(await optionalTree(read, revisions[0]));
  } else if (command === 'stash' && ['apply', 'pop'].includes(before[0])) {
    const ref = before[1] || 'stash@{0}';
    targets.push(await optionalTree(read, ref), await optionalTree(read, `${ref}^3`));
  } else if (command === 'cherry-pick' || command === 'revert') {
    const affected = await read(['diff-tree', '-m', '--root', '--no-commit-id', '--name-only', '-r', '-z', before.at(-1)!, '--']);
    for (const file of affected.split('\0').filter(Boolean)) await check(file);
  }
  for (const tree of targets) {
    if (!tree) continue;
    const paths = await read(['ls-tree', '-r', '-z', '--name-only', tree, '--', ...specs]);
    for (const file of paths.split('\0').filter(Boolean)) await check(file);
  }
}
