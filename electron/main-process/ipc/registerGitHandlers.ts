import { ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { CommitStatsPriority, CommitStatsService } from '../../CommitStatsService';
import { GitService } from '../../GitService';
import { SecretScanService } from '../../SecretScanService';
import { WorkingTreeService } from '../../WorkingTreeService';
import { AppSettings } from '../../settings';
import {
  assertAllowedGitCommand,
  createJobId,
  normalizeArgs,
  validateCommandArgs,
} from '../gitCommandPolicy';
import { parseFileBlame, parseFileHistory, parseStashList } from '../parsing';
import { emitJobEvent } from './jobEvents';

type RegisterGitHandlersDeps = {
  gitService: GitService;
  secretScanService: SecretScanService;
  commitStatsService: CommitStatsService;
  workingTreeService: WorkingTreeService;
  readSettingsWithMigration: () => AppSettings;
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
      webContents.send('git:commitStats', update);
    }
  });

  ipcMain.handle('git:setRepo', async (_event: any, repoPath: string) => {
    commitStatsService.interruptBackgroundWork();
    gitService.setRepoPath(repoPath);
    commitStatsService.setActiveRepo(gitService.getRepoPath() || repoPath);
    return true;
  });

  ipcMain.handle('git:command', async (event: any, commandName: unknown, ...rawArgs: unknown[]) => {
    let jobId: string | null = null;
    try {
      assertAllowedGitCommand(commandName);
      const normalizedArgs = normalizeArgs(rawArgs);
      validateCommandArgs(commandName, normalizedArgs);

      const isLongRunning = ['fetch', 'pull', 'push', 'add', 'commit', 'reset'].includes(commandName);
      jobId = isLongRunning ? createJobId(`git-${commandName}`) : null;

      if (jobId) {
        emitJobEvent(event.sender, {
          id: jobId,
          operation: `git:${commandName}`,
          status: 'start',
          timestamp: Date.now(),
        });
      }

      let data: string;
      if (commandName === 'status') {
        data = normalizedArgs.length > 0
          ? await gitService.runCommand(['status', ...normalizedArgs])
          : await gitService.getStatus();
      } else if (commandName === 'statusPorcelain') {
        data = await gitService.getStatusPorcelain();
      } else if (commandName === 'log') {
        data = await gitService.getLog(
          Number(normalizedArgs[0]) || 50,
          normalizedArgs[1] !== 'head',
          Number(normalizedArgs[2]) || 0,
        );
      } else if (commandName === 'branches') {
        data = await gitService.getBranches();
      } else if (commandName === 'commitDetails') {
        data = await gitService.getCommitDetails(normalizedArgs[0]);
      } else if (commandName === 'conflictTakeOurs') {
        data = await gitService.checkoutConflictVersion(normalizedArgs[0], 'ours');
      } else if (commandName === 'conflictTakeTheirs') {
        data = await gitService.checkoutConflictVersion(normalizedArgs[0], 'theirs');
      } else if (commandName === 'conflictMarkResolved') {
        data = await gitService.addFile(normalizedArgs[0]);
      } else if (commandName === 'mergeContinue') {
        data = await gitService.continueMerge();
      } else if (commandName === 'mergeAbort') {
        data = await gitService.abortMerge();
      } else if (commandName === 'rebaseContinue') {
        data = await gitService.continueRebase();
      } else if (commandName === 'rebaseAbort') {
        data = await gitService.abortRebase();
      } else if (commandName === 'submoduleStatus') {
        data = await gitService.getSubmoduleStatus();
      } else if (commandName === 'submoduleUpdateInitRecursive') {
        data = await gitService.updateSubmodulesInitRecursive();
      } else if (commandName === 'submoduleSyncRecursive') {
        data = await gitService.syncSubmodulesRecursive();
      } else if (commandName === 'reflog') {
        data = await gitService.getReflog(Number(normalizedArgs[0]) || 300);
      } else if (commandName === 'forensicHistory') {
        const searchType = normalizedArgs[0];
        const targetPath = normalizedArgs[1];
        const searchTerm = normalizedArgs[2] || '';
        const startLine = Number(normalizedArgs[3]);
        const endLine = Number(normalizedArgs[4]);
        const limit = Number(normalizedArgs[5]) || 200;

        if (searchType === 'string') {
          data = await gitService.getForensicHistoryByString(searchTerm, targetPath, limit);
        } else if (searchType === 'regex') {
          data = await gitService.getForensicHistoryByRegex(searchTerm, targetPath, limit);
        } else {
          data = await gitService.getForensicHistoryByLineRange(targetPath, startLine, endLine, limit);
        }
      } else {
        data = await gitService.runCommand([commandName, ...normalizedArgs]);
      }

      if (jobId) {
        emitJobEvent(event.sender, {
          id: jobId,
          operation: `git:${commandName}`,
          status: 'done',
          timestamp: Date.now(),
        });
      }

      return { success: true, data };
    } catch (error: any) {
      if (jobId && typeof commandName === 'string') {
        emitJobEvent(event.sender, {
          id: jobId,
          operation: `git:${commandName}`,
          status: 'failed',
          message: error.message,
          timestamp: Date.now(),
        });
      }
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:commitLogPage', async (
    _event: any,
    params: { limit?: unknown; offset?: unknown; scope?: unknown } = {},
  ) => {
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

      const raw = await gitService.getLog(limit + 1, scope === 'all', offset);
      const hashes = [...raw.matchAll(/(?:^|\x00)([0-9a-f]{7,64})\x1f/gi)]
        .map((match) => match[1]);
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

  ipcMain.handle('git:requestCommitStats', async (
    event: any,
    hashes: unknown,
    requestedPriority: unknown,
  ) => {
    try {
      commitStatsSubscribers.add(event.sender);
      const normalizedHashes = Array.isArray(hashes)
        ? hashes.map((hash) => String(hash || '')).slice(0, 500)
        : [];
      const priority: CommitStatsPriority = (
        requestedPriority === 'selected'
        || requestedPriority === 'visible'
        || requestedPriority === 'background'
      ) ? requestedPriority : 'background';
      const data = await commitStatsService.requestStats(normalizedHashes, priority);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:workingTreeSnapshot', async () => {
    try {
      return { success: true, data: await workingTreeService.getSnapshot() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:workingTreeStats', async (_event: any, snapshotId: unknown) => {
    try {
      const normalizedId = String(snapshotId || '').trim();
      if (!normalizedId) throw new Error('Snapshot ID is required.');
      return { success: true, data: await workingTreeService.getStats(normalizedId) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:stagePaths', async (event: any, paths: unknown) => {
    const jobId = createJobId('git-stage-paths');
    emitJobEvent(event.sender, {
      id: jobId,
      operation: 'git:add',
      status: 'start',
      timestamp: Date.now(),
    });
    try {
      commitStatsService.interruptBackgroundWork();
      const normalizedPaths = Array.isArray(paths)
        ? paths.map((filePath) => String(filePath || '')).slice(0, 100_000)
        : [];
      const data = await gitService.stagePaths(normalizedPaths);
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

  ipcMain.handle('git:diffPreview', async (
    _event: any,
    args: unknown,
    limits: { maxBytes?: unknown; maxLines?: unknown } = {},
  ) => {
    try {
      commitStatsService.interruptBackgroundWork();
      if (!Array.isArray(args)) throw new Error('Diff arguments are required.');
      const normalizedArgs = args.map((arg) => String(arg || '')).slice(0, 100);
      if (!['diff', 'show'].includes(normalizedArgs[0])) {
        throw new Error('Unsupported diff preview command.');
      }
      const data = await gitService.getDiffPreview(normalizedArgs, {
        maxBytes: Number(limits.maxBytes) || undefined,
        maxLines: Number(limits.maxLines) || undefined,
      });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:fileBlameRange', async (
    _event: any,
    filePath: unknown,
    commitHash: unknown,
    startLine: unknown,
    lineCount: unknown,
  ) => {
    try {
      commitStatsService.interruptBackgroundWork();
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) throw new Error('File path is required.');
      const raw = await gitService.getFileBlameRange(
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

  ipcMain.handle('git:scanPushSecrets', async (event: any) => {
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
        message: findingCount > 0
          ? `Secret scan found ${findingCount} hit(s) in ${filesWithFindings} file(s).`
          : 'Secret scan finished with no hits.',
        details: {
          strictness: result.strictness,
          findingCount,
          filesWithFindings,
          checkedLines: result.stats.checkedLines,
          stagedLines: result.stats.stagedLines,
          toPushLines: result.stats.toPushLines,
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

  ipcMain.handle('git:cancelSecretScan', async () => {
    const cancelled = Boolean(activeSecretScanController);
    activeSecretScanController?.abort();
    return { success: true, cancelled };
  });

  ipcMain.handle('git:interactiveRebase', async (_event: any, baseHash: unknown, todoLines: unknown) => {
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

  ipcMain.handle('git:applyPatch', async (_event: any, patch: unknown, options: { cached?: unknown; reverse?: unknown } = {}) => {
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

  ipcMain.handle('git:stashes', async () => {
    try {
      const raw = await gitService.getStashes(200);
      return { success: true, data: parseStashList(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:repoOriginUrl', async (_event: any, repoPath: string) => {
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

  ipcMain.handle('git:fileHistory', async (_event: any, filePath: string, commitHash?: string, limit: number = 100) => {
    try {
      const normalizedPath = (filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const raw = await gitService.getFileHistory(normalizedPath, limit, commitHash);
      return { success: true, data: parseFileHistory(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:fileBlame', async (_event: any, filePath: string, commitHash?: string) => {
    try {
      const normalizedPath = (filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const raw = await gitService.getFileBlame(normalizedPath, commitHash);
      return { success: true, data: parseFileBlame(raw) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:readRepoFile', async (_event: any, filePath: unknown) => {
    try {
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      const data = await gitService.readRepoFile(normalizedPath);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:writeRepoFile', async (_event: any, filePath: unknown, content: unknown) => {
    try {
      const normalizedPath = String(filePath || '').trim();
      if (!normalizedPath) {
        return { success: false, error: 'File path is required' };
      }

      await gitService.writeRepoFile(normalizedPath, typeof content === 'string' ? content : String(content ?? ''));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git:openSubmodule', async (_event: any, submodulePath: unknown) => {
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

  ipcMain.handle('git:addIgnoreRule', async (_event: any, pattern: string) => {
    try {
      const normalizedPattern = String(pattern || '').trim().replace(/\\/g, '/');
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

  ipcMain.handle('git:clone', async (event, cloneUrl: string, targetDir: string, targetName?: string) => {
    const webContents = event.sender;
    const jobId = createJobId('git-clone');

    emitJobEvent(webContents, {
      id: jobId,
      operation: 'git:clone',
      status: 'start',
      timestamp: Date.now(),
    });

    const result = await gitService.cloneRepo(cloneUrl, targetDir, (line: string) => {
      webContents.send('clone:progress', line);
      emitJobEvent(webContents, {
        id: jobId,
        operation: 'git:clone',
        status: 'progress',
        message: line,
        timestamp: Date.now(),
      });
    }, targetName);

    emitJobEvent(webContents, {
      id: jobId,
      operation: 'git:clone',
      status: result.success ? 'done' : 'failed',
      message: result.error,
      timestamp: Date.now(),
    });

    return result;
  });

  ipcMain.handle('git:init', async (_event: any, repoPath: string) => {
    try {
      gitService.setRepoPath(repoPath);
      const out = await gitService.runCommand(['init']);
      return { success: true, data: out };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
