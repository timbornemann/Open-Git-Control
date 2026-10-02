import * as path from 'node:path';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { toLiteralPathspec } from '../git/RepositoryPathSafety';

type IndexRun = (index: string, args: string[]) => Promise<string>;
type PathspecWriter = (name: string, paths: string[]) => string;

export async function fingerprintIndex(run: IndexRun, index: string): Promise<string> {
  // Ignore harmless stat/cache-tree/fsmonitor refreshes while retaining all
  // staged entries and user-controlled index flags.
  const entries = await run(index, ['ls-files', '--stage', '-z']);
  const flags = await run(index, ['ls-files', '-v', '-z']);
  return createHash('sha256').update(entries).update('\0').update(flags).digest('hex');
}

export function acquireRealIndexLock(indexLockPath: string): void {
  fs.mkdirSync(path.dirname(indexLockPath), { recursive: true });
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(indexLockPath, 'wx', 0o600);
  } catch (error) {
    throw new Error(`Git index is busy. AI Auto-Commit did not modify it: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export async function restoreIndexPaths(
  run: IndexRun,
  writePaths: PathspecWriter,
  index: string,
  tree: string,
  paths: string[],
  pathspecFile: string,
): Promise<void> {
  // This compatibility path is used by individual transaction callers without
  // a captured change manifest. The global planner uses bulk index-info input.
  if (paths.length > 1 && paths.join('\0').length > 4000) {
    const count = Math.min(20, Math.ceil(paths.length / 2));
    for (let offset = 0; offset < paths.length; offset += count) {
      const batch = paths.slice(offset, offset + count);
      await restoreIndexPaths(run, writePaths, index, tree, batch, writePaths(`${path.basename(pathspecFile)}.${offset}`, batch));
    }
    return;
  }
  const raw = await run(index, ['ls-tree', '-r', '-z', '--name-only', tree, '--', ...paths.map((file) => toLiteralPathspec(file))]);
  const existing = raw.split('\0').filter(Boolean);
  const existingSet = new Set(existing);
  const absent = paths.filter((file) => !existingSet.has(file));
  if (existing.length) {
    const existingFile = writePaths(`${path.basename(pathspecFile)}.existing`, existing);
    await run(index, ['restore', `--source=${tree}`, '--staged', `--pathspec-from-file=${existingFile}`, '--pathspec-file-nul']);
  }
  if (absent.length) await run(index, ['rm', '--cached', '-f', '--ignore-unmatch', '--', ...absent.map((file) => toLiteralPathspec(file))]);
}
