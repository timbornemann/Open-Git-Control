import { ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { CommitStatsPriority, CommitStatsService } from '../../CommitStatsService';
import type { GitService, RepositoryFileSource } from '../../GitService';
import type { SecretScanService } from '../../SecretScanService';
import type { WorkingTreeService } from '../../WorkingTreeService';
import type { AppSettings } from '../../settings';
import { IpcChannel } from '../../../src/types/ipcContract';
import { createJobId } from '../gitCommandPolicy';
import { normalizeDiffPreviewArgs } from '../diffPreviewPolicy';
import { parseFileBlame, parseFileHistory, parseStashList } from '../parsing';
import { handleGitCommand } from './gitCommandRouter';
import { emitJobEvent } from './jobEvents';

type RegisterGitHandlersDeps = {
  gitService: GitService;
  secretScanService: SecretScanService;
  commitStatsService: CommitStatsService;
  workingTreeService: WorkingTreeService;
  readSettingsWithMigration: () => AppSettings;
};

const REPOSITORY_FILE_SOURCES = new Set<RepositoryFileSource>(['unstaged', 'staged', 'commit']);

const normalizeRepositoryFileSource = (value: unknown): RepositoryFileSource => {
  const source = String(value || '').trim();
  if (!REPOSITORY_FILE_SOURCES.has(source as RepositoryFileSource)) {
    throw new Error('Invalid repository file source.');
  }
  return source as RepositoryFileSource;
};

export function registerGitHandlers({
  gitService,
  secretScanService,
  commitStatsService,
  workingTreeService,
  readSettingsWithMigration,
}: RegisterGitHandlersDeps): void {
  const commitStatsSubscribers = new Set<any>();
  let activeSecretScanController: AbortController | null = null;
  commitStatsService.onUpdate((update) => {
    for (const webContents of commitStatsSubscribers) {
      if (webContents.isDestroyed?.()) {
        commitStatsSubscribers.delete(webContents);
        continue;
      }
      webContents.send(IpcChannel.GitCommitStats, update);
    }
  });

  ipcMain.handle(IpcChannel.GitSetRepo, async (_event: any, repoPath: string) => {
    commitStatsService.interruptBackgroundWork();
    gitService.setRepoPath(repoPath);
    commitStatsService.setActiveRepo(gitService.getRepoPath() || repoPath);
    return true;
  });

  ipcMain.handle(IpcChannel.GitClearRepo, async () => {
    commitStatsService.interruptBackgroundWork();
    gitService.clearRepoPath();
    commitStatsService.setActiveRepo('');
    return true;
  });

  ipcMain.handle(IpcChannel.GitCommand, async (event: any, commandName: unknown, ...rawArgs: unknown[]) =>
    handleGitCommand(event, gitService, commandName, ...rawArgs),
  );

  ipcMain.handle(IpcChannel.GitCommitLogPage, async (_event: any, params: { limit?: unknown; offset?: unknown; scope?: unknown } = {}) => {
    try {
      const limit = Math.max(1, Math.min(500, Math.floor(Number(params.limit) || 100)));
      const offset = Math.max(0, Math.floor(Number(params.offset) || 0));
      const scope = params.scope === 'head' ? 'head' : 'all';
      const repoPath = gitService.getRepoPath();
      if (!repoPath) throw new Error('No repository path set.');

      try {
        await gitService.runCommand(['rev-parse', '--verify', 'HEAD']);
      } catch (error: any) {
        if (/\[REPO_UNAVAILABLE\]|not a git repository|no repository path set/i.test(String(error?.message || ''))) {
          throw error;
        }
        return {
          success: true,
          data: {
            raw: '',
            hasMore: false,
            stats: {},
            repoPath,
          },
        };
      }

      const raw = await gitService.history.getLog(limit + 1, scope === 'all', offset);
      // eslint-disable-next-line no-control-regex -- Git log records are NUL/unit-separator delimited.
      const hashes = [...raw.matchAll(/(?:^|\x00)([0-9a-f]{7,64})\x1f/gi)].map((match) => match[1]);
      const hasMore = hashes.length > limit;
      const visibleHashes = hashes.slice(0, limit);
      const stats = await commitStatsService.getCachedStats(visibleHashes);
      return {
        success: true,
        data: {
          raw,
          hasMore,
          stats,
          repoPath,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitRequestCommitStats, async (event: any, hashes: unknown, requestedPriority: unknown) => {
    try {
      commitStatsSubscribers.add(event.sender);
      const normalizedHashes = Array.isArray(hashes) ? hashes.map((hash) => String(hash || '')).slice(0, 500) : [];
      const priority: CommitStatsPriority =
        requestedPriority === 'selected' || requestedPriority === 'visible' || requestedPriority === 'background' ? requestedPriority : 'background';
      const data = await commitStatsService.requestStats(normalizedHashes, priority);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitWorkingTreeSnapshot, async () => {
    try {
      return { success: true, data: await workingTreeService.getSnapshot() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitWorkingTreeStats, async (_event: any, snapshotId: unknown) => {
    try {
      const normalizedId = String(snapshotId || '').trim();
      if (!normalizedId) throw new Error('Snapshot ID is required.');
      return { success: true, data: await workingTreeService.getStats(normalizedId) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    IpcChannel.GitCreateCommit,
    async (
      event: any,
      params: {
        title?: unknown;
        description?: unknown;
        amend?: unknown;
        signoff?: unknown;
        allowEmpty?: unknown;
      } = {},
    ) => {
      const jobId = createJobId('git-commit');
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:commit',
        status: 'start',
        timestamp: Date.now(),
      });

      try {
        const data = await gitService.commits.commitWithMessageAtPath(gitService.requireActiveRepoPath(), {
          title: String(params.title || ''),
          description: String(params.description || ''),
          amend: params.amend === true,
          signoff: params.signoff === true,
          allowEmpty: params.allowEmpty === true,
        });
        emitJobEvent(event.sender, {
          id: jobId,
          operation: 'git:commit',
          status: 'done',
          timestamp: Date.now(),
        });
        return { success: true, data };
      } catch (error: any) {
        emitJobEvent(event.sender, {
          id: jobId,
          operation: 'git:commit',
          status: 'failed',
          message: error.message,
          timestamp: Date.now(),
        });
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle(IpcChannel.GitStagePaths, async (event: any, paths: unknown) => {
    const jobId = createJobId('git-stage-paths');
    emitJobEvent(event.sender, {
      id: jobId,
      operation: 'git:add',
      status: 'start',
      timestamp: Date.now(),
    });
    try {
      commitStatsService.interruptBackgroundWork();
      const normalizedPaths = Array.isArray(paths) ? paths.map((filePath) => String(filePath || '')).slice(0, 100_000) : [];
      const data = await gitService.commits.stagePathsAtPath(gitService.requireActiveRepoPath(), normalizedPaths);
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:add',
        status: 'done',
        details: { pathCount: normalizedPaths.length },
        timestamp: Date.now(),
      });
      return { success: true, data };
    } catch (error: any) {
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:add',
        status: 'failed',
        message: error.message,
        timestamp: Date.now(),
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitDiffPreview, async (_event: any, args: unknown, limits: { maxBytes?: unknown; maxLines?: unknown } = {}) => {
    try {
      commitStatsService.interruptBackgroundWork();
      const normalizedArgs = normalizeDiffPreviewArgs(args);
      const data = await gitService.runner.getDiffPreview(gitService.requireActiveRepoPath(), normalizedArgs, {
        maxBytes: Number(limits.maxBytes) || undefined,
        maxLines: Number(limits.maxLines) || undefined,
      });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitFileBlameRange, async (_event: any, filePath: unknown, commitHash: unknown, startLine: unknown, lineCount: unknown) => {
    try {
      commitStatsService.interruptBackgroundWork();
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) throw new Error('File path is required.');
      const raw = await gitService.history.getFileBlameRange(
        normalizedPath,
        String(commitHash || '').trim() || undefined,
        Number(startLine),
        Number(lineCount),
      );
      return { success: true, data: parseFileBlame(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitScanPushSecrets, async (event: any, params: { includeTags?: unknown } = {}) => {
    activeSecretScanController?.abort();
    const controller = new AbortController();
    activeSecretScanController = controller;
    const jobId = createJobId('security-secret-scan');
    const operation = 'security:secret-scan';
    emitJobEvent(event.sender, {
      id: jobId,
      operation,
      status: 'start',
      message: 'Secret scan started.',
      timestamp: Date.now(),
    });

    try {
      const settings = readSettingsWithMigration();
      const result = await secretScanService.scanPushDiffs({
        strictness: settings.secretScanStrictness,
        allowlistText: settings.secretScanAllowlist,
        includeTags: params?.includeTags === true,
        signal: controller.signal,
        onProgress: (checkedLines) => {
          emitJobEvent(event.sender, {
            id: jobId,
            operation,
            status: 'progress',
            message: `Secret scan checked ${checkedLines} added line(s).`,
            details: { checkedLines },
            timestamp: Date.now(),
          });
        },
      });

      const findingCount = result.findings.length;
      const filesWithFindings = new Set(result.findings.map((item) => item.filePath)).size;
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: 'done',
        message: findingCount > 0 ? `Secret scan found ${findingCount} hit(s) in ${filesWithFindings} file(s).` : 'Secret scan finished with no hits.',
        details: {
          strictness: result.strictness,
          findingCount,
          filesWithFindings,
          checkedLines: result.stats.checkedLines,
          stagedLines: result.stats.stagedLines,
          toPushLines: result.stats.toPushLines,
          tagLines: result.stats.tagLines,
          notes: result.notes,
        },
        timestamp: Date.now(),
      });

      return { success: true, data: result };
    } catch (error: any) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      emitJobEvent(event.sender, {
        id: jobId,
        operation,
        status: cancelled ? 'cancelled' : 'failed',
        message: cancelled ? 'Secret scan cancelled.' : error?.message || 'Secret scan failed.',
        timestamp: Date.now(),
      });
      return { success: false, error: cancelled ? 'Secret scan cancelled.' : error?.message || 'Secret scan failed.' };
    } finally {
      if (activeSecretScanController === controller) activeSecretScanController = null;
    }
  });

  ipcMain.handle(IpcChannel.GitCancelSecretScan, async () => {
    const cancelled = Boolean(activeSecretScanController);
    activeSecretScanController?.abort();
    return { success: true, cancelled };
  });

  ipcMain.handle(IpcChannel.GitInteractiveRebase, async (_event: any, baseHash: unknown, todoLines: unknown) => {
    try {
      const normalizedBase = String(baseHash || '').trim();
      if (!/^[0-9a-f]{7,40}$/i.test(normalizedBase)) {
        return { success: false, error: 'Invalid base commit hash.' };
      }

      if (!Array.isArray(todoLines) || todoLines.length === 0) {
        return { success: false, error: 'Rebase todo list is empty.' };
      }

      const normalizedTodo = todoLines
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .slice(0, 500);

      if (normalizedTodo.length === 0) {
        return { success: false, error: 'Rebase todo list is empty.' };
      }

      const data = await gitService.startInteractiveRebase(normalizedBase, normalizedTodo);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitApplyPatch, async (_event: any, patch: unknown, options: { cached?: unknown; reverse?: unknown } = {}) => {
    try {
      const normalizedPatch = String(patch || '');
      if (!normalizedPatch.trim()) {
        return { success: false, error: 'Patch is empty.' };
      }
      if (normalizedPatch.length > 2_000_000) {
        return { success: false, error: 'Patch is too large.' };
      }

      const data = await gitService.applyPatch(normalizedPatch, {
        cached: Boolean(options.cached),
        reverse: Boolean(options.reverse),
      });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitStashes, async () => {
    try {
      const raw = await gitService.getStashes(200);
      return { success: true, data: parseStashList(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitStashBranch, async (event: any, params: { stashName?: unknown; branchName?: unknown } = {}) => {
    const jobId = createJobId('git-stash-branch');
    emitJobEvent(event.sender, {
      id: jobId,
      operation: 'git:stash-branch',
      status: 'start',
      timestamp: Date.now(),
    });

    try {
      const data = await gitService.createBranchFromStash(String(params.stashName || ''), String(params.branchName || ''));
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:stash-branch',
        status: 'done',
        timestamp: Date.now(),
      });
      return { success: true, data };
    } catch (error: any) {
      emitJobEvent(event.sender, {
        id: jobId,
        operation: 'git:stash-branch',
        status: 'failed',
        message: error.message,
        timestamp: Date.now(),
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitRepoOriginUrl, async (_event: any, repoPath: string) => {
    try {
      const normalizedPath = String(repoPath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'Repository path is required.' };
      }

      const url = await gitService.getRepoOriginUrl(normalizedPath);
      return { success: true, data: url };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitFileHistory, async (_event: any, filePath: string, commitHash?: string, limit: number = 100) => {
    try {
      const normalizedPath = (filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const raw = await gitService.history.getFileHistory(normalizedPath, limit, commitHash);
      return { success: true, data: parseFileHistory(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitFileBlame, async (_event: any, filePath: string, commitHash?: string) => {
    try {
      const normalizedPath = (filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const raw = await gitService.history.getFileBlame(normalizedPath, commitHash);
      return { success: true, data: parseFileBlame(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitReadRepoFile, async (_event: any, filePath: unknown) => {
    try {
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const data = await gitService.files.readRepoFile(normalizedPath);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitMarkdownPreviewFile, async (_event: any, params: { source?: unknown; path?: unknown; commitHash?: unknown } = {}) => {
    try {
      const source = normalizeRepositoryFileSource(params.source);
      const filePath = String(params.path || '').trim();
      if (!filePath) {
        return { success: false, error: 'File path is required' };
      }

      const text = await gitService.files.readRepositoryFileTextAtSource(
        source,
        filePath,
        typeof params.commitHash === 'string' ? params.commitHash : undefined,
      );
      return { success: true, data: { text } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitRepoFileDataUrl, async (_event: any, params: { source?: unknown; path?: unknown; commitHash?: unknown } = {}) => {
    try {
      const source = normalizeRepositoryFileSource(params.source);
      const filePath = String(params.path || '').trim();
      if (!filePath) {
        return { success: false, error: 'File path is required' };
      }

      const data = await gitService.files.readRepositoryImageDataUrlAtSource(
        source,
        filePath,
        typeof params.commitHash === 'string' ? params.commitHash : undefined,
      );
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitWriteRepoFile, async (_event: any, filePath: unknown, content: unknown) => {
    try {
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      await gitService.files.writeRepoFile(normalizedPath, typeof content === 'string' ? content : String(content ?? ''));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitOpenSubmodule, async (_event: any, submodulePath: unknown) => {
    try {
      const relativePath = String(submodulePath || '').trim();
      if (!relativePath) {
        return { success: false, error: 'Submodule path is required.' };
      }

      const repoPath = gitService.getRepoPath();
      if (!repoPath) {
        return { success: false, error: 'No repository path set.' };
      }

      const resolvedPath = path.resolve(repoPath, relativePath);
      const relativeFromRepo = path.relative(repoPath, resolvedPath);
      if (relativeFromRepo.startsWith('..') || path.isAbsolute(relativeFromRepo)) {
        return { success: false, error: 'Submodule path is outside the current repository.' };
      }

      const openError = await shell.openPath(resolvedPath);
      if (openError) {
        return { success: false, error: openError };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitAddIgnoreRule, async (_event: any, pattern: string) => {
    try {
      const normalizedPattern = String(pattern || '')
        .trim()
        .replace(/\\/g, '/');
      if (!normalizedPattern) {
        return { success: false, error: 'Pattern is required' };
      }
      if (normalizedPattern.length > 400) {
        return { success: false, error: 'Pattern is too long' };
      }
      if (/\r|\n/.test(normalizedPattern)) {
        return { success: false, error: 'Pattern must be a single line' };
      }

      const selectedRepo = gitService.getRepoPath();
      if (!selectedRepo) {
        return { success: false, error: 'No repository selected' };
      }

      const repoRoot = await gitService.runCommand(['rev-parse', '--show-toplevel']);
      const gitignorePath = path.join(repoRoot, '.gitignore');
      const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
      const existingRules = new Set(
        existing
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      );

      if (existingRules.has(normalizedPattern)) {
        return { success: true, added: false, pattern: normalizedPattern };
      }

      const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n') && !existing.endsWith('\r\n');
      const nextContent = `${needsLeadingNewline ? '\n' : ''}${normalizedPattern}\n`;
      fs.appendFileSync(gitignorePath, nextContent, 'utf-8');
      return { success: true, added: true, pattern: normalizedPattern };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitClone, async (event, cloneUrl: string, targetDir: string, targetName?: string) => {
    const webContents = event.sender;
    const jobId = createJobId('git-clone');

    emitJobEvent(webContents, {
      id: jobId,
      operation: IpcChannel.GitClone,
      status: 'start',
      timestamp: Date.now(),
    });

    const result = await gitService.clone.cloneRepo(
      cloneUrl,
      targetDir,
      (line: string) => {
        webContents.send(IpcChannel.CloneProgress, line);
        emitJobEvent(webContents, {
          id: jobId,
          operation: IpcChannel.GitClone,
          status: 'progress',
          message: line,
          timestamp: Date.now(),
        });
      },
      targetName,
    );

    emitJobEvent(webContents, {
      id: jobId,
      operation: IpcChannel.GitClone,
      status: result.success ? 'done' : 'failed',
      message: result.error,
      timestamp: Date.now(),
    });

    return result;
  });

  ipcMain.handle(IpcChannel.GitInit, async (_event: any, repoPath: string) => {
    try {
      gitService.setRepoPath(repoPath);
      const out = await gitService.runCommand(['init']);
      return { success: true, data: out };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IpcChannel.GitGetFileTimelineData, async (_event: any, limit?: number) => {
    try {
      const commits = await gitService.history.getFileTimelineData(limit);
      return { success: true, data: commits };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
