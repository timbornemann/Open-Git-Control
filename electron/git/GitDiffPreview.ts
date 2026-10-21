import type { GitProcessExecutor } from './GitProcessExecutor';
import type { GitSpawnOperations } from './GitSpawnOperations';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeRepositoryRelativePath, resolveExistingRepositoryPathWithoutSymlinks, toLiteralPathspec } from './RepositoryPathSafety';

export async function readGitDiffPreview(
  spawn: GitSpawnOperations,
  executor: GitProcessExecutor,
  repo: string,
  args: string[],
  limits: { maxBytes?: number; maxLines?: number },
  signal: AbortSignal,
) {
  const maxBytes = Math.max(64 * 1024, Math.min(limits.maxBytes || 2 * 1024 * 1024, 8 * 1024 * 1024));
  const maxLines = Math.max(100, Math.min(limits.maxLines || 5000, 20_000));
  const preview = await spawn.getDiffPreview(repo, args, maxBytes, maxLines, signal);
  const renamedArgs = await stagedRenamePreviewArgs(executor, repo, args, preview.text, signal);
  if (renamedArgs) return spawn.getDiffPreview(repo, renamedArgs, maxBytes, maxLines, signal);
  if (preview.text || args.length !== 3 || args[0] !== 'diff' || args[1] !== '--') return preview;
  // Preview untracked files against the empty file without changing the index.
  const requested = args[2].startsWith(':(literal)') ? args[2].slice(10) : args[2];
  const file = path.posix.normalize(normalizeRepositoryRelativePath(requested, 'Diff path'));
  const untracked = await executor.run(repo, ['ls-files', '--others', '--exclude-standard', '-z', '--', toLiteralPathspec(file)], {
    cwd: repo,
    maxBuffer: 64 * 1024,
    env: process.env,
    signal,
  });
  if (!untracked.split('\0').includes(file)) return preview;
  const resolved = resolveExistingRepositoryPathWithoutSymlinks(repo, file, 'Diff path');
  if (!fs.statSync(resolved).isFile()) return preview;
  signal.throwIfAborted();
  return spawn.getDiffPreview(repo, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', '/dev/null', file], maxBytes, maxLines, signal);
}

/** A new-path-only pathspec hides Git's rename source and turns replacements into additions. */
export async function stagedRenamePreviewArgs(
  executor: GitProcessExecutor,
  repo: string,
  args: string[],
  text: string,
  signal: AbortSignal,
): Promise<string[] | null> {
  if (args.length !== 4 || args[0] !== 'diff' || args[1] !== '--cached' || args[2] !== '--' || !/^new file mode /m.test(text)) return null;
  const target = args[3].startsWith(':(literal)') ? args[3].slice(10) : args[3];
  const names = (
    await executor.run(repo, ['diff', '--cached', '--name-status', '-z', '--find-renames'], { cwd: repo, maxBuffer: 8 * 1024 * 1024, env: process.env, signal })
  ).split('\0');
  for (let index = 0; index < names.length && names[index];) {
    const status = names[index++];
    const from = names[index++];
    if (!/^[RC]\d+$/.test(status)) continue;
    const to = names[index++];
    if (status.startsWith('R') && to === target) return ['diff', '--cached', '--find-renames', '--', toLiteralPathspec(from), toLiteralPathspec(to)];
  }
  return null;
}
