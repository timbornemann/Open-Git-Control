// Synthetic IPC boundary for the production-renderer navigation benchmark.
// No real repositories, account credentials or application settings are used.
const { contextBridge } = require('electron');
const { createElectronApi } = require('../../dist-electron/electron/preload/createElectronApi.js');
const { DEFAULT_SETTINGS } = require('../../dist-electron/electron/settings.js');

const scenario = process.env.OGC_NAV_SCENARIO || 'cached';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = Date.now();
const repositories =
  scenario === 'local'
    ? {
        repos: Array.from({ length: 24 }, (_, index) => ({
          path: index === 0 ? 'C:/Work/open-git-control' : index === 1 ? 'D:/Clients/Design-System' : `C:/Work/Project-${index + 1}`,
          lastOpened: now - index * 3_600_000,
          createdAt: now - (index + 1) * 90_000_000,
          pinned: index % 5 === 0,
        })),
        activeRepo: 'C:/Work/open-git-control',
        sortBy: 'lastOpenedDesc',
      }
    : { repos: [], activeRepo: null, sortBy: 'lastOpenedDesc' };
const settings = { ...DEFAULT_SETTINGS, language: 'en', autoUpdateEnabled: false };
const planner = {
  version: 1,
  projects: [{ id: 'prepared-project', name: 'Prepared project', description: '', kind: 'planned', repoPath: null, createdAt: now, updatedAt: now }],
  items: [
    {
      id: 'prepared-todo',
      projectId: 'prepared-project',
      title: 'Prepared todo',
      description: '',
      priority: 'medium',
      status: 'planned',
      tags: [],
      createdAt: now,
      updatedAt: now,
    },
  ],
};
const repo = {
  id: 1,
  name: 'prepared-repository',
  fullName: 'preview-user/prepared-repository',
  description: 'Prepared catalog entry',
  private: true,
  owner: { login: 'preview-user', avatarUrl: '' },
  htmlUrl: 'https://github.com/preview-user/prepared-repository',
  cloneUrl: 'https://github.com/preview-user/prepared-repository.git',
  sshUrl: 'git@github.com:preview-user/prepared-repository.git',
  defaultBranch: 'main',
  updatedAt: new Date(now).toISOString(),
  pushedAt: new Date(now).toISOString(),
  stargazersCount: 0,
  forksCount: 0,
  openIssuesCount: 0,
  language: 'TypeScript',
  archived: false,
  fork: false,
};
planner.items = Array.from({ length: 80 }, (_, index) => ({
  ...planner.items[0],
  id: `prepared-todo-${index}`,
  title: `Prepared todo ${index}`,
  status: ['planned', 'in-progress', 'done', 'idea'][index % 4],
}));
const repos = Array.from({ length: 100 }, (_, index) => ({
  ...repo,
  id: index + 1,
  name: `prepared-repository-${index}`,
  fullName: `preview-user/prepared-repository-${index}`,
}));
const catalog = { host: 'github.com', username: 'preview-user', savedAt: new Date(now - 600_000).toISOString(), repos };
const ok = (data) => ({ success: true, data });
const calls = [];
const invoke = async (channel, ...args) => {
  calls.push({ channel, at: performance.now() });
  switch (channel) {
    case 'app:bootstrap':
      await wait(40);
      return {
        settings,
        repositories,
        githubCatalog: scenario === 'cold' ? null : catalog,
        snapshots:
          scenario === 'cold'
            ? []
            : [
                {
                  version: 1,
                  key: ['resource', 'planner', 'application', 'getData'],
                  savedAt: now - 600_000,
                  sourceRevision: 'fixture',
                  complete: true,
                  data: ok(planner),
                },
              ],
      };
    case 'app:savePreviews':
    case 'app:cancelRead':
    case 'repositoryRun:watchConfig':
      return true;
    case 'app:getVersion':
      return '2.1.1';
    case 'settings:get':
      return settings;
    case 'settings:set':
      return { ...settings, ...args[0] };
    case 'repos:getStored':
      return repositories;
    case 'repos:setStored':
      return true;
    case 'git:clearRepo':
      return true;
    case 'git:setRepo':
    case 'git:resolveRepoPath':
      return args[0];
    case 'git:repoOriginUrl':
      return ok(args[0] === 'D:/Clients/Design-System' ? 'git@github.com:example/design-system.git' : 'https://github.com/example/open-git-control.git');
    case 'git:commandForRepo':
      return ok('');
    case 'git:commitLogPage':
      return ok({ raw: '', stats: {}, hasMore: false, repoPath: args[0].repoPath });
    case 'git:workingTreeSnapshot':
      return ok({ snapshotId: 'fixture-snapshot', repoPath: args[0], statusRaw: '', changeCount: 0, durationMs: 0, largeMode: false, isBare: false });
    case 'git:workingTreeStats':
      return ok({ snapshotId: 'fixture-snapshot', staged: { files: 0, additions: 0, deletions: 0 }, unstaged: { files: 0, additions: 0, deletions: 0 } });
    case 'git:listWorkingDirectory':
      return ok([]);
    case 'git:readRepoFile':
      return { success: false, error: 'ENOENT: not found' };
    case 'repositoryRun:getConfig':
      return { success: false, error: 'Preview fixture has no Git working tree.' };
    case 'github:getCatalogSnapshot':
      await wait(50);
      return ok(scenario === 'cold' ? null : catalog);
    case 'github:getSavedAuthStatus':
      return { hasSavedToken: true, authenticated: false, username: null, oauthConfigured: true };
    case 'github:loginWithSavedToken':
      await wait(3000);
      return scenario === 'offline'
        ? { success: false, authenticated: false, username: null, authenticationRequired: false, error: 'Fixture network is offline.' }
        : { success: true, authenticated: true, username: 'preview-user', tokenPersisted: true };
    case 'github:getRepos':
      await wait(3000);
      return ok({ repos, hasMore: false, nextPage: null });
    case 'github:saveCatalogSnapshot':
      return ok({ savedAt: new Date().toISOString() });
    case 'planner:getData':
      await wait(3000);
      return scenario === 'offline' ? { success: false, error: 'Fixture file read is unavailable.' } : ok(planner);
    case 'repositoryRun:getState':
    case 'git:getAiAutoCommitState':
      return ok(null);
    case 'updater:getStatus':
      return {
        isSupported: false,
        state: 'idle',
        currentVersion: '2.1.1',
        availableVersion: null,
        downloaded: false,
        downloadPercent: null,
        lastCheckedAt: null,
        releaseNotes: null,
        error: null,
      };
    case 'feedback:getCapability':
      return { available: false, reason: 'Benchmark' };
    case 'planning-api:getInfo':
      return { enabled: false, status: 'disabled', host: '127.0.0.1', port: null };
    default:
      throw new Error(`Unimplemented benchmark IPC: ${channel}`);
  }
};
contextBridge.exposeInMainWorld('electronAPI', createElectronApi({ invoke, on() {}, removeListener() {} }));
contextBridge.exposeInMainWorld('navigationBenchmark', { calls: () => calls });
