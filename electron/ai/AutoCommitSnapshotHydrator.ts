import type { GitService } from '../GitService';
import { toLiteralPathspec } from '../git/RepositoryPathSafety';
import type { SnapshotFile } from './aiServiceTypes';
import { getExtension, getTopDirectory } from './gitStatusSnapshot';
import {
  buildFileSnippetContext,
  buildStructuredDiffContext,
  clipContextLine,
  deriveStatsFromDiff,
  parseNumstatLine,
  parseNumstatReport,
  readUntrackedSnippet,
} from './diffContext';

const MAX_PREVIEW_CHARS = 220;

type EnsureNotCancelled = () => void;

const toContextPreview = (keyChanges: string[]): string => {
  if (keyChanges.length === 0) return '(no preview available)';
  return keyChanges.join(' | ').slice(0, MAX_PREVIEW_CHARS);
};

export class AutoCommitSnapshotHydrator {
  constructor(
    private readonly gitService: GitService,
    private readonly repoPath: string,
    private readonly ensureNotCancelled: EnsureNotCancelled,
    private readonly privateIndexPath?: string,
  ) {}

  async hydrateSnapshotFile(file: SnapshotFile): Promise<void> {
    if (file.hydrated) return;
    this.ensureNotCancelled();

    let numstatRaw = '';
    try {
      numstatRaw = await this.runGitCommand(['diff', ...(this.privateIndexPath ? ['--cached'] : []), '--numstat', 'HEAD', '--', toLiteralPathspec(file.path)]);
    } catch {
      numstatRaw = '';
    }

    const numstat = parseNumstatLine(numstatRaw.split(/\r?\n/).find(Boolean) || '');

    let previewRaw = '';
    try {
      previewRaw = await this.runGitCommand([
        'diff',
        ...(this.privateIndexPath ? ['--cached'] : []),
        '--no-color',
        '--unified=3',
        'HEAD',
        '--',
        toLiteralPathspec(file.path),
      ]);
    } catch {
      previewRaw = '';
    }

    let additions = numstat.additions;
    let deletions = numstat.deletions;
    if (additions === 0 && deletions === 0 && previewRaw.trim()) {
      const derived = deriveStatsFromDiff(previewRaw);
      additions = derived.additions;
      deletions = derived.deletions;
    }

    let keyChanges = buildStructuredDiffContext(previewRaw);
    if (keyChanges.length === 0 && (file.changeType === 'untracked' || file.changeType === 'added')) {
      keyChanges = await this.readSnapshotSnippet(file.path);
    }
    if (keyChanges.length === 0) {
      keyChanges = [clipContextLine(`${file.changeType} file: ${file.path}`)];
    }

    file.additions = additions;
    file.deletions = deletions;
    file.isBinary = numstat.isBinary;
    file.keyChanges = keyChanges;
    file.preview = toContextPreview(keyChanges);
    file.hydrated = true;
    this.ensureNotCancelled();
  }

  async hydrateLargeBatchSignals(files: SnapshotFile[]): Promise<void> {
    this.ensureNotCancelled();
    let numstatReport = '';
    try {
      numstatReport = await this.runGitCommand(['diff', ...(this.privateIndexPath ? ['--cached'] : []), '--numstat', 'HEAD', '--']);
    } catch {
      numstatReport = '';
    }
    const statsByPath = parseNumstatReport(numstatReport);
    let contentPreviewBudget = 50;

    for (const file of files) {
      const stats = statsByPath.get(file.path);
      file.additions = stats?.additions ?? 0;
      file.deletions = stats?.deletions ?? 0;
      file.isBinary = stats?.isBinary ?? false;

      let keyChanges: string[] = [];
      if (contentPreviewBudget > 0 && !file.isBinary && (file.changeType === 'untracked' || file.changeType === 'added')) {
        keyChanges = await this.readSnapshotSnippet(file.path);
        contentPreviewBudget -= 1;
      }
      if (keyChanges.length === 0) {
        keyChanges = [
          clipContextLine(`${file.changeType} in ${getTopDirectory(file.path)} (${getExtension(file.path)}) +${file.additions}/-${file.deletions}`),
        ];
      }
      file.keyChanges = keyChanges;
      file.preview = toContextPreview(keyChanges);
    }
    this.ensureNotCancelled();
  }

  private async runGitCommand(args: string[]): Promise<string> {
    const gitCapabilities = this.gitService as GitService & {
      runCommandAtPath?: (repoPath: string, args: string[]) => Promise<string>;
      runCommandAtPathWithEnv?: (repoPath: string, args: string[], envOverrides: NodeJS.ProcessEnv) => Promise<string>;
      runCommand?: (args: string[]) => Promise<string>;
    };
    if (this.privateIndexPath && typeof gitCapabilities.runCommandAtPathWithEnv === 'function') {
      return gitCapabilities.runCommandAtPathWithEnv(this.repoPath, args, { GIT_INDEX_FILE: this.privateIndexPath, GIT_OPTIONAL_LOCKS: '0' });
    }
    if (typeof gitCapabilities.runCommandAtPath === 'function') {
      return gitCapabilities.runCommandAtPath(this.repoPath, args);
    }
    if (typeof gitCapabilities.runCommand === 'function') {
      return gitCapabilities.runCommand(args);
    }
    throw new Error('Git command execution is not available.');
  }

  private async readSnapshotSnippet(filePath: string): Promise<string[]> {
    if (!this.privateIndexPath) return readUntrackedSnippet(this.repoPath, filePath);
    try {
      const buffer = await this.gitService.readPrivateIndexFileBufferAtPath(this.repoPath, filePath, this.privateIndexPath, 64 * 1024);
      if (buffer.includes(0)) return [];
      return buildFileSnippetContext(buffer.toString('utf8'));
    } catch {
      return [];
    }
  }
}
