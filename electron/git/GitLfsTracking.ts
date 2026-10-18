import type { TrackWithGitLfsRequest } from '../../src/shared/ipc/gitLfs';
import { inspectLfsFiles, type LfsInspection, type LfsReader } from './GitLfsInspection';

/** Select only this extension; preserve existing staged versions of other files. */
export async function inspectLfsTrackingTargets(request: TrackWithGitLfsRequest, selected: LfsInspection, git: LfsReader): Promise<LfsInspection[]> {
  if (request.staging !== 'matching') return [selected];
  const extension = selected.state.extension!;
  const matches = (file: string) => file.endsWith(extension);
  const [files, staged, conflicts] = await Promise.all([
    git.run(request.repoPath, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']),
    git.run(request.repoPath, ['diff', '--cached', '--name-only', '-z', '--no-renames']),
    // A working-tree diff may refresh the real index's stat cache even with
    // optional locks disabled. Read conflict entries without touching the index.
    git.run(request.repoPath, ['ls-files', '--unmerged', '-z']),
  ]);
  if (conflicts.split('\0').some((entry) => entry && matches(entry.slice(entry.indexOf('\t') + 1))))
    throw new Error('Resolve conflicts in matching files before staging this file type.');
  const stagedPaths = new Set(staged.split('\0'));
  const paths = [...new Set([...files.split('\0').filter((file) => file && matches(file)), selected.state.path])].sort();
  const targets = paths.map((file) =>
    file === selected.state.path
      ? { path: file, source: request.source }
      : { path: file, source: stagedPaths.has(file) ? ('staged' as const) : ('unstaged' as const) },
  );
  const inspected = await inspectLfsFiles(request.repoPath, targets, git);
  if (inspected.find((file) => file.state.path === selected.state.path)?.contentVersion !== selected.contentVersion)
    throw new Error('The selected content changed during preparation.');
  return inspected.filter((file) => file.state.eligible);
}
