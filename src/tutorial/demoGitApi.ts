import type { ElectronGitAPI } from '@/shared/ipc/contracts/git';
import { DEMO_TIME, ok, unavailable, type DemoRepository } from './demoRepository';
import { writeDemoFile, ignoreDemoRule } from './demoFiles';
import { applyDemoPatch, applyDemoLineSelection } from './demoPatch';
import { parseDiff } from '@/shared/diff/parser';
import { createDemoFileApi } from './demoFileApi';
import { createDemoTreeApi } from './demoTreeApi';
import { createDemoSearchApi } from './demoSearchApi';
import { createDemoHistoryApi } from './demoHistoryApi';
import { demoHistoryCommand } from './demoHistoryCommands';
import { demoRegexHistory } from './demoRegexHistory';
import { demoBlob, demoBlobBytes, demoBlobText } from './demoBlob';
import { demoStashBranch } from './demoStashBranch';
import { createDemoSubmoduleApi } from './demoSubmodules';

export function createDemoGitApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  const command = (name: Parameters<DemoRepository['command']>[0], args: string[]) =>
    name === 'forensicHistory' && args[0] === 'regex' ? demoRegexHistory(repo, args) : repo.command(name, ...args);
  const diffStats = (staged: boolean) => {
    const files = staged ? repo.staged : repo.modified;
    const rows = [...files].flatMap((path) => parseDiff(repo.diff(path, staged)).hunks.flatMap((hunk) => hunk.rows));
    return { files: files.size, additions: rows.filter((row) => row.type === 'add').length, deletions: rows.filter((row) => row.type === 'del').length };
  };
  return {
    ...createDemoFileApi(repo),
    ...createDemoSubmoduleApi(repo),
    ...createDemoTreeApi(repo),
    ...createDemoSearchApi(repo),
    ...createDemoHistoryApi(repo),
    setRepoPath: async (path) => {
      repo.selectProject(path);
      return path;
    },
    clearRepoPath: async () => true,
    runGitCommand: async (name, ...args) => command(name, args),
    runGitCommandForRepo: async (path, name, ...args) => (path === repo.activeRepo ? command(name, args) : unavailable()),
    createCommit: async (input) => repo.commit(input.title, input),
    getWorkingTreeStatus: async () =>
      ok({
        repoPath: repo.activeRepo,
        statusRaw: repo.status(),
        changeCount: repo.changeCount(),
        checkedAt: DEMO_TIME,
      }),
    getWorkingTreeSnapshot: async () =>
      ok({
        snapshotId: `demo-${repo.revision}`,
        repoPath: repo.activeRepo,
        statusRaw: repo.status(),
        changeCount: repo.changeCount(),
        durationMs: 0,
        largeMode: false,
        isBare: false,
      }),
    getRepositoryChangeSummary: async (path) =>
      ok({
        repoPath: path,
        changeCount: repo.changeCount(path),
        checkedAt: DEMO_TIME,
        statusFingerprint: String(repo.revision),
      }),
    getWorkingTreeStats: async (snapshotId) =>
      ok({
        snapshotId,
        staged: diffStats(true),
        unstaged: diffStats(false),
      }),
    getSequencerState: async (path) =>
      path && path !== repo.activeRepo
        ? unavailable()
        : ok({
            operation: repo.rebaseState
              ? ('rebase' as const)
              : repo.mergeState && repo.mergeState.mode !== 'squash'
                ? repo.mergeState.operation || ('merge' as const)
                : null,
          }),
    stagePaths: async (paths) => repo.stage(paths),
    applyPatch: async (patch, options, path) => applyDemoPatch(repo, patch, options, path),
    applyDiffLineSelection: async (request) => applyDemoLineSelection(repo, request),
    getDiffPreview: async (args, _limits, repoPath) => {
      if (repoPath && repoPath !== repo.activeRepo) return unavailable();
      const result =
        args[0] === 'show'
          ? demoHistoryCommand(repo, 'show', args.slice(1))
          : args[0] === 'stash'
            ? repo.command('stash', ...args.slice(1))
            : ok(repo.diffCommand(args));
      if (!result.success) return result;
      const text = result.data;
      return ok({ text, truncated: false, bytes: new TextEncoder().encode(text).length, lines: text.split('\n').length });
    },
    getStashes: async (path) => (path && path !== repo.activeRepo ? unavailable() : ok(structuredClone(repo.stashes))),
    gitStashBranch: async (reference, branch, path) => (path && path !== repo.activeRepo ? unavailable() : demoStashBranch(repo, reference, branch)),
    getRepoOriginUrl: async (path) => ok(repo.originFor(path)),
    gitFetch: async () => repo.command('fetch'),
    gitPull: async () => repo.command('pull'),
    gitPush: async () => repo.command('push'),
    readRepoFile: async (file, path) =>
      path && path !== repo.activeRepo
        ? unavailable()
        : typeof demoBlobText(repo.fileAt('unstaged', file)) === 'string'
          ? ok(demoBlobText(repo.fileAt('unstaged', file))!)
          : { success: false, error: 'ENOENT: sample file not found.' },
    writeRepoFile: async (file, content, path, encoding = 'utf8') => {
      if (path && path !== repo.activeRepo) return unavailable();
      if ([...repo.submodules.keys()].some((entry) => file === entry || file.startsWith(entry + '/') || entry.startsWith(file + '/'))) return unavailable();
      const blob = demoBlob(content, encoding);
      try {
        demoBlobBytes(blob);
      } catch {
        return unavailable();
      }
      writeDemoFile(repo, file, blob);
      return { success: true };
    },
    addIgnoreRule: async (pattern, path) =>
      !path || path === repo.activeRepo ? ignoreDemoRule(repo, pattern) : { success: false, error: 'The practice repository changed.' },
    watchWorkingTree: async () => ok({ recursive: true }),
    onWorkingTreeChanged: (callback) => repo.subscribeChannel('tree', () => callback({ repoPath: repo.activeRepo })),
    getGitIdentity: async (request) => ok({ ...request, name: 'Alex Beispiel', email: 'alex@example.invalid', ready: true, missing: [], revision: 'demo' }),
    saveGitIdentity: async (request) => {
      repo.mark('setting-changed');
      return ok({ ...request, ready: Boolean(request.name.trim() && request.email.trim()), missing: [], revision: 'demo' });
    },
    scanCommitSecrets: async () =>
      ok({ scanned: true, strictness: 'medium', findings: [], notes: [], stats: { checkedLines: 3, stagedLines: 3, toPushLines: 0, tagLines: 0 } }),
    scanPushSecrets: async () =>
      ok({ scanned: true, strictness: 'medium', findings: [], notes: [], stats: { checkedLines: 3, stagedLines: 0, toPushLines: 3, tagLines: 0 } }),
    approveSecretScanCommit: async () => ({ success: true }),
    approveSecretScanPush: async () => ({ success: true }),
    cancelSecretScan: async () => ({ success: true, cancelled: true }),
  };
}
