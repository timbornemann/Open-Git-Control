import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { CommitEditGit } from './CommitEditGit';
import type { UntrackBlockReason } from '../../src/shared/ipc/untrackFiles';
import { assertOutsideGitMetadata, normalizeRepositoryRelativePath, resolveRepositoryPathForCreateWithoutSymlinks } from './RepositoryPathSafety';

export const UNTRACK_OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type UntrackContext = { ownerId: number; generation: number; signal: AbortSignal; ensureActive(): void; progress(phase: string): void };
export type UntrackIndex = {
  entries: Map<string, string[]>;
  ignored: Set<string>;
  staged: Set<string>;
  added: Set<string>;
  dirty: Set<string>;
  flags: Map<string, string>;
};
export type UntrackFileSnapshot = { index: string[]; flag: string; working: string; ignored: boolean; blocked?: UntrackBlockReason };
const list = (value: Buffer) => {
  const text = value.toString('utf8');
  if (!Buffer.from(text).equals(value) || (text.length > 0 && !text.endsWith('\0'))) throw new Error('Incomplete or unsupported Git response.');
  return text.split('\0').filter(Boolean);
};
const read = (git: CommitEditGit, repo: string, args: string[]) => git.buffer(repo, ['--no-optional-locks', ...args]);

export async function readUntrackIndex(git: CommitEditGit, repo: string): Promise<UntrackIndex> {
  // Bounded, non-truncating reads: incomplete enumerations never form a plan.
  const records = list(await read(git, repo, ['ls-files', '--stage', '--full-name', '-z']));
  const entries = new Map<string, string[]>();
  for (const record of records) {
    const tab = record.indexOf('\t');
    if (tab < 0 || !/^\d{6} [0-9a-f]{40,64} [0-3]$/.test(record.slice(0, tab))) throw new Error('Incomplete Git index response.');
    const file = record.slice(tab + 1);
    entries.set(file, [...(entries.get(file) ?? []), record.slice(0, tab)]);
  }
  const ignored = new Set(list(await read(git, repo, ['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'])));
  const staged = new Set(list(await read(git, repo, ['diff', '--cached', '--name-only', '--no-renames', '--no-ext-diff', '-z'])));
  const added = new Set(list(await read(git, repo, ['diff', '--cached', '--name-only', '--diff-filter=A', '--no-renames', '--no-ext-diff', '-z'])));
  const dirty = new Set(list(await read(git, repo, ['diff-files', '--name-only', '--no-renames', '--no-ext-diff', '--ignore-submodules=none', '-z'])));
  const flags = new Map(list(await read(git, repo, ['ls-files', '-v', '-z'])).map((line) => [line.slice(2), line[0]]));
  return { entries, ignored, staged, added, dirty, flags };
}

export async function untrackRepositoryIdentity(git: CommitEditGit, repo: string): Promise<string> {
  const gitDir = await git.run(repo, ['rev-parse', '--absolute-git-dir']);
  const status = await read(git, repo, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=no']);
  const head = list(status).filter((line) => /^# branch\.(?:oid|head) /.test(line));
  if (head.length !== 2) throw new Error('Cannot determine the current branch and HEAD.');
  return JSON.stringify([gitDir, head]);
}

export type UntrackSnapshotBudget = { remaining: number };
export const untrackSnapshotBudget = (): UntrackSnapshotBudget => ({ remaining: 512 * 1024 * 1024 });
async function workingFingerprint(repo: string, file: string, signal: AbortSignal, budget: UntrackSnapshotBudget): Promise<string> {
  const normalized = normalizeRepositoryRelativePath(file);
  assertOutsideGitMetadata(normalized, 'File path');
  // Check all parent components, but read a tracked symlink itself, never its target.
  const directory = path.posix.dirname(normalized);
  const parent = directory === '.' ? fs.realpathSync.native(repo) : resolveRepositoryPathForCreateWithoutSymlinks(repo, directory);
  const target = path.join(parent, path.posix.basename(normalized));
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(target);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return 'missing';
    throw error;
  }
  if (stat.isSymbolicLink()) return `link:${await fs.promises.readlink(target)}`;
  if (!stat.isFile()) throw new Error('Unsupported working-tree entry.');
  if (stat.size > 256 * 1024 * 1024 || stat.size > budget.remaining) throw new RangeError('File is too large to inspect safely.');
  budget.remaining -= stat.size;
  const hash = createHash('sha256');
  // O_NOFOLLOW also rejects a symlink substituted after the parent checks on POSIX.
  const handle = await fs.promises.open(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stream = handle.createReadStream({ autoClose: false, signal });
    let bytes = 0;
    for await (const chunk of stream) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > stat.size) throw new Error('File changed while being read.');
      hash.update(chunk);
    }
    if (bytes !== stat.size) throw new Error('File changed while being read.');
  } finally {
    await handle.close();
  }
  return `file:${stat.mode & 0o777}:${hash.digest('hex')}`;
}

export async function snapshotUntrackFile(
  repo: string,
  file: string,
  state: UntrackIndex,
  signal: AbortSignal,
  budget: UntrackSnapshotBudget,
): Promise<UntrackFileSnapshot> {
  signal.throwIfAborted();
  const index = state.entries.get(file) ?? [];
  const flag = state.flags.get(file) ?? '';
  let blocked: UntrackBlockReason | undefined;
  if (index.some((entry) => !entry.endsWith(' 0'))) blocked = 'conflict';
  else if (index.some((entry) => entry.startsWith('160000 '))) blocked = 'submodule';
  else if (index.some((entry) => !/^(?:100644|100755|120000) /.test(entry)) || flag !== 'H') blocked = 'unsupported';
  else if (state.staged.has(file) && state.dirty.has(file)) blocked = 'indexOnly';
  let working = '';
  if (!blocked) {
    try {
      working = await workingFingerprint(repo, file, signal, budget);
    } catch (error) {
      signal.throwIfAborted();
      blocked = error instanceof RangeError ? 'tooLarge' : 'unreadable';
    }
  }
  return { index, flag, working, ignored: state.ignored.has(file), blocked };
}
