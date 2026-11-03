import type { ElectronGitAPI } from '@/shared/ipc/contracts/git';
import { DEMO_REPO, DEMO_TIME, DEMO_URL, ok, type DemoRepository } from './demoRepository';

export function createDemoGitApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  const filePreview = (file: string) => ({
    kind: 'text' as const,
    text: repo.files[file] || '',
    bytes: (repo.files[file] || '').length,
    isMarkdown: file.endsWith('.md'),
    encoding: 'utf8' as const,
    version: String(repo.revision),
    editable: true,
    modifiedAt: new Date(DEMO_TIME).toISOString(),
  });
  return {
    setRepoPath: async (path) => {
      if (![DEMO_REPO, '/tutorial/Notizbuch'].includes(path)) throw new Error('Unknown practice repository.');
      repo.activeRepo = path;
      repo.mark('repo-selected');
      return path;
    },
    clearRepoPath: async () => true,
    runGitCommand: async (command, ...args) => repo.command(command, ...args),
    runGitCommandForRepo: async (_path, command, ...args) => repo.command(command, ...args),
    createCommit: async (input) => repo.commit(input.title),
    getCommitLogPage: async ({ limit, offset }) =>
      ok({
        raw: offset ? '' : repo.log(),
        hasMore: false,
        stats: Object.fromEntries(repo.commits.slice(offset, offset + limit).map((commit) => [commit.hash, { files: 1, additions: 3, deletions: 1 }])),
        repoPath: repo.activeRepo,
      }),
    requestCommitStats: async (hashes) =>
      ok(Object.fromEntries(hashes.map((hash) => [hash, { state: 'ready' as const, stats: { files: 1, additions: 3, deletions: 1 } }]))),
    getWorkingTreeStatus: async () =>
      ok({ repoPath: repo.activeRepo, statusRaw: repo.status(), changeCount: new Set([...repo.modified, ...repo.staged]).size, checkedAt: DEMO_TIME }),
    getWorkingTreeSnapshot: async () =>
      ok({
        snapshotId: `demo-${repo.revision}`,
        repoPath: repo.activeRepo,
        statusRaw: repo.status(),
        changeCount: new Set([...repo.modified, ...repo.staged]).size,
        durationMs: 0,
        largeMode: false,
        isBare: false,
      }),
    getRepositoryChangeSummary: async (path) =>
      ok({ repoPath: path, changeCount: repo.modified.size + repo.staged.size, checkedAt: DEMO_TIME, statusFingerprint: String(repo.revision) }),
    getWorkingTreeStats: async (snapshotId) =>
      ok({
        snapshotId,
        staged: { files: repo.staged.size, additions: repo.staged.size, deletions: repo.staged.size },
        unstaged: { files: repo.modified.size, additions: repo.modified.size, deletions: repo.modified.size },
      }),
    getSequencerState: async () => ok({ operation: repo.conflicted ? ('merge' as const) : null }),
    getCommitMessageEditBackups: async () => ok([]),
    stagePaths: async (paths) => repo.stage(paths),
    getDiffPreview: async () => {
      const text = repo.diff();
      return ok({ text, truncated: false, bytes: text.length, lines: text.split('\n').length });
    },
    getStashes: async () => ok(repo.stashes),
    getRepoOriginUrl: async () => ok(DEMO_URL),
    gitFetch: async () => repo.command('fetch'),
    gitPull: async () => repo.command('pull'),
    gitPush: async () => repo.command('push'),
    readRepoFile: async (file) =>
      Object.prototype.hasOwnProperty.call(repo.files, file) ? ok(repo.files[file]) : { success: false, error: 'ENOENT: sample file not found.' },
    writeRepoFile: async (file, content) => {
      repo.files[file] = content;
      repo.modified.add(file);
      repo.mark('file-saved');
      return { success: true };
    },
    getWorkingDirectoryPreview: async (file) => ok(filePreview(file)),
    getRepositoryFilePreview: async (request) => ok({ ...filePreview(request.path), editable: request.source === 'unstaged' }),
    getRepositoryFileInfo: async (request) => ok({ ...filePreview(request.path), path: request.path, hashes: null }),
    saveRepositoryFile: async (request) => {
      if (request.expectedVersion !== String(repo.revision)) return { success: false, error: 'The exercise changed. Reload the file.' };
      repo.files[request.path] = request.content;
      repo.modified.add(request.path);
      repo.mark('file-saved');
      return ok({ version: String(repo.revision), bytes: request.content.length });
    },
    getMarkdownPreviewFile: async (request) => ok({ text: repo.files[request.path] || '' }),
    listWorkingDirectory: async (_path, parent = '') => {
      const entries = new Map<string, { path: string; name: string; kind: 'file' | 'directory'; bytes?: number }>();
      for (const [file, text] of Object.entries(repo.files)) {
        if (parent && !file.startsWith(`${parent}/`)) continue;
        const relative = parent ? file.slice(parent.length + 1) : file;
        const name = relative.split('/')[0];
        entries.set(name, { path: parent ? `${parent}/${name}` : name, name, kind: relative.includes('/') ? 'directory' : 'file', bytes: text.length });
      }
      return ok([...entries.values()]);
    },
    getFileHistory: async () =>
      ok(
        repo.commits.map((commit) => ({
          hash: commit.hash,
          abbrevHash: commit.hash.slice(0, 7),
          author: 'Alex Beispiel',
          date: commit.date,
          subject: commit.subject,
        })),
      ),
    getFileBlame: async () => ok([]),
    getFileBlameRange: async () => ok([]),
    getFileTimelineData: async () =>
      ok(
        repo.commits.map((commit) => ({
          hash: commit.hash,
          author: 'Alex Beispiel',
          date: commit.date,
          subject: commit.subject,
          changes: [{ status: 'modified' as const, path: 'README.md' }],
          baselineFiles: Object.keys(repo.files),
        })),
      ),
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
    searchWorkingDirectory: async ({ query }) =>
      ok({
        files: Object.entries(repo.files)
          .filter(([file, text]) => file.includes(query) || text.includes(query))
          .map(([path]) => ({ path, name: path.split('/').at(-1) || path, matches: [] })),
        totalMatches: 1,
        scannedFiles: 3,
        truncated: false,
      }),
  };
}
