import * as path from 'node:path';
import type { GitRunner } from './GitRunner';
import { normalizeRepositoryRelativePath, resolveRepositoryPathForCreateWithoutSymlinks, toLiteralPathspec } from './RepositoryPathSafety';
import { parseDiff } from '../../src/shared/diff/parser';
import { diffSelectionBlockReason } from '../../src/shared/diff/lineSelection';
import { buildSelectedDiffPatch, DiffLineEndingDependency } from '../../src/shared/diff/selectedPatch';
import {
  DIFF_SELECTION_MAX_BYTES,
  DIFF_SELECTION_MAX_LINES,
  type ApplyDiffLineSelectionRequest,
  type ApplyDiffLineSelectionResult,
} from '../../src/shared/ipc/diffLineSelection';

export class DiffLineStagingService {
  constructor(private readonly runner: GitRunner) {}

  async apply(request: ApplyDiffLineSelectionRequest, ensureActive: () => void): Promise<ApplyDiffLineSelectionResult> {
    if (
      !request ||
      typeof request.repoPath !== 'string' ||
      !['staged', 'unstaged'].includes(request.source) ||
      typeof request.expectedDiff !== 'string' ||
      Buffer.byteLength(request.expectedDiff, 'utf8') > DIFF_SELECTION_MAX_BYTES ||
      request.expectedDiff.split('\n').length > DIFF_SELECTION_MAX_LINES ||
      !Array.isArray(request.selectedUnitIds) ||
      !request.selectedUnitIds.length ||
      request.selectedUnitIds.length > DIFF_SELECTION_MAX_LINES ||
      request.selectedUnitIds.some((id) => typeof id !== 'string' || id.length > 48 || !/^hunk-\d+:\d+$/.test(id))
    )
      throw new Error('Invalid diff line selection request.');
    const filePath = path.posix.normalize(normalizeRepositoryRelativePath(request.path, 'Diff path'));
    return this.runner.withExclusiveWrite(request.repoPath, 'apply-diff-line-selection', async (git) => {
      ensureActive();
      resolveRepositoryPathForCreateWithoutSymlinks(request.repoPath, filePath, 'Diff path');
      const spec = toLiteralPathspec(filePath);
      const entries = (await git.run(request.repoPath, ['ls-files', '--stage', '-z', '--', spec])).split('\0').filter(Boolean);
      if (entries.some((entry) => !/^\d{6} [0-9a-f]+ 0\t/.test(entry))) return { status: 'unsupported', reason: 'conflict' };
      const mode = entries[0]?.slice(0, 6);
      if (mode && !['100644', '100755'].includes(mode)) return { status: 'unsupported', reason: 'unsupported' };
      const args = request.source === 'staged' ? ['diff', '--cached', '--', spec] : ['diff', '--', spec];
      const current = await this.runner.readDiffPreviewInsideWrite(
        request.repoPath,
        args,
        { maxBytes: DIFF_SELECTION_MAX_BYTES, maxLines: DIFF_SELECTION_MAX_LINES },
        git.signal!,
      );
      ensureActive();
      if (current.truncated || current.text !== request.expectedDiff) return { status: 'stale' };
      const parsed = parseDiff(current.text);
      const reason = diffSelectionBlockReason(parsed, current.text);
      if (reason) return { status: 'unsupported', reason };
      const inferredMode = parsed.fileHeader.map((line) => /^(?:new file|deleted file) mode (100644|100755)$/.exec(line)?.[1]).find(Boolean);
      let patch: string;
      try {
        patch = buildSelectedDiffPatch(parsed, request.selectedUnitIds, request.source, {
          path: filePath,
          mode: mode || inferredMode || '100644',
          exists: entries.length > 0,
        });
      } catch (error) {
        if (error instanceof DiffLineEndingDependency) return { status: 'unsupported', reason: 'lineEndingDependency' };
        throw error;
      }
      ensureActive();
      if ((await git.run(request.repoPath, ['ls-files', '--stage', '-z', '--', spec])) !== entries.join('\0') + (entries.length ? '\0' : ''))
        return { status: 'stale' };
      // One Git operation owns index.lock and publishes all selected hunks together.
      ensureActive();
      await git.input(request.repoPath, ['apply', '--cached', '--whitespace=nowarn', '-'], patch, true);
      return { status: 'applied' };
    });
  }
}
