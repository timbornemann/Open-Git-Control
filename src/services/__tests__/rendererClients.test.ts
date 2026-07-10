import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiClient } from '@/services/aiClient';
import { appClient } from '@/services/appClient';
import {
  getElectronApi,
  requireElectronAiApi,
  requireElectronApi,
  requireElectronAppApi,
  requireElectronGitApi,
  requireElectronGithubApi,
  requireElectronPlannerApi,
  requireElectronReposApi,
  requireElectronSettingsApi,
} from '@/services/electronApi';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import { plannerClient } from '@/services/plannerClient';

type ApiBucket = Record<string, ReturnType<typeof vi.fn>>;

type TestElectronApi = {
  ai: ApiBucket;
  app: ApiBucket;
  git: ApiBucket;
  github: ApiBucket;
  planner: ApiBucket;
  repos: ApiBucket;
  settings: ApiBucket;
};

const createBucket = (): ApiBucket =>
  new Proxy(
    {},
    {
      get(target, property: string) {
        if (!target[property]) {
          target[property] = vi.fn().mockResolvedValue({ success: true, data: property });
        }
        return target[property];
      },
    },
  );

const createElectronApi = (): TestElectronApi => ({
  ai: createBucket(),
  app: createBucket(),
  git: createBucket(),
  github: createBucket(),
  planner: createBucket(),
  repos: createBucket(),
  settings: createBucket(),
});

let api: TestElectronApi;

const installApi = () => {
  api = createElectronApi();
  vi.stubGlobal('window', { electronAPI: api });
  return api;
};

const expectDelegation = async (call: () => unknown | Promise<unknown>, fn: ReturnType<typeof vi.fn>, args: unknown[]) => {
  await call();
  expect(fn).toHaveBeenCalledWith(...args);
};

beforeEach(() => {
  vi.useRealTimers();
  installApi();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('electronApi accessors', () => {
  it('returns null without a window and throws on required access', () => {
    vi.unstubAllGlobals();

    expect(getElectronApi()).toBeNull();
    expect(() => requireElectronApi()).toThrow('Electron API is not available.');
  });

  it('returns typed domain APIs from the preload contract', () => {
    expect(getElectronApi()).toBe(api);
    expect(requireElectronApi()).toBe(api);
    expect(requireElectronGitApi()).toBe(api.git);
    expect(requireElectronGithubApi()).toBe(api.github);
    expect(requireElectronPlannerApi()).toBe(api.planner);
    expect(requireElectronSettingsApi()).toBe(api.settings);
    expect(requireElectronAppApi()).toBe(api.app);
    expect(requireElectronAiApi()).toBe(api.ai);
    expect(requireElectronReposApi()).toBe(api.repos);
  });
});

describe('renderer service clients', () => {
  it('reports availability from the preload API', () => {
    expect(aiClient.isAvailable()).toBe(true);
    expect(appClient.isAvailable()).toBe(true);
    expect(gitClient.isAvailable()).toBe(true);
    expect(githubClient.isAvailable()).toBe(true);
    expect(plannerClient.isAvailable()).toBe(true);

    vi.unstubAllGlobals();
    expect(aiClient.isAvailable()).toBe(false);
    expect(appClient.isAvailable()).toBe(false);
    expect(gitClient.isAvailable()).toBe(false);
    expect(githubClient.isAvailable()).toBe(false);
    expect(plannerClient.isAvailable()).toBe(false);
  });

  it('delegates app, settings and repo operations to their Electron domains', async () => {
    await expectDelegation(() => appClient.openDirectory('C:/repo'), api.app.openDirectory, ['C:/repo']);
    await expectDelegation(() => appClient.selectDirectory(), api.app.selectDirectory, []);
    await expectDelegation(() => appClient.selectFiles(), api.app.selectFiles, []);
    await expectDelegation(() => appClient.selectProjectParentDirectory('C:/projects'), api.app.selectProjectParentDirectory, ['C:/projects']);
    await expectDelegation(() => appClient.openExternalUrl('https://example.test'), api.app.openExternalUrl, ['https://example.test']);
    await expectDelegation(() => appClient.getPlanningApiInfo(), api.app.getPlanningApiInfo, []);
    await expectDelegation(() => appClient.generatePlanningApiToken(), api.app.generatePlanningApiToken, []);
    await expectDelegation(() => appClient.clearPlanningApiToken(), api.app.clearPlanningApiToken, []);
    await expectDelegation(() => appClient.getAppVersion(), api.app.getAppVersion, []);
    await expectDelegation(() => appClient.getUpdaterStatus(), api.app.getUpdaterStatus, []);
    await expectDelegation(() => appClient.runOneClickAppUpdate(), api.app.runOneClickAppUpdate, []);
    await expectDelegation(() => appClient.installAppUpdate(), api.app.installAppUpdate, []);
    await expectDelegation(() => appClient.getDiagnosticsReport(), api.app.getDiagnosticsReport, []);
    await expectDelegation(() => appClient.onUpdaterEvent(vi.fn()), api.app.onUpdaterEvent, [expect.any(Function)]);

    await expectDelegation(() => appClient.getSettings(), api.settings.getSettings, []);
    await expectDelegation(() => appClient.setSettings({ language: 'de' } as any), api.settings.setSettings, [{ language: 'de' }]);
    await expectDelegation(() => appClient.setGeminiApiKey('secret'), api.settings.setGeminiApiKey, ['secret']);
    await expectDelegation(() => appClient.clearGeminiApiKey(), api.settings.clearGeminiApiKey, []);
    await expectDelegation(() => appClient.setOpenAiApiKey('sk-test'), api.settings.setOpenAiApiKey, ['sk-test']);
    await expectDelegation(() => appClient.clearOpenAiApiKey(), api.settings.clearOpenAiApiKey, []);

    await expectDelegation(() => appClient.getStoredRepos(), api.repos.getStoredRepos, []);
    await expectDelegation(() => appClient.setStoredRepos({ repos: [] } as any), api.repos.setStoredRepos, [{ repos: [] }]);
    await expectDelegation(() => appClient.setRepoPath('C:/repo'), api.repos.setRepoPath, ['C:/repo']);
    await expectDelegation(() => appClient.clearRepoPath(), api.repos.clearRepoPath, []);
  });

  it('delegates AI operations to the AI Electron domain', async () => {
    await expectDelegation(() => aiClient.testConnection('key'), api.ai.aiTestConnection, ['key']);
    await expectDelegation(() => aiClient.listModels('key'), api.ai.aiListModels, ['key']);
    await expectDelegation(() => aiClient.runAutoCommit({} as any), api.ai.runAiAutoCommit, [{}]);
    await expectDelegation(() => aiClient.cancelAutoCommit(), api.ai.cancelAiAutoCommit, []);
    await expectDelegation(() => aiClient.getAutoCommitState(), api.ai.getAiAutoCommitState, []);
    await expectDelegation(() => aiClient.generateCommitMessage({ diff: 'x' } as any), api.ai.aiGenerateCommitMessage, [{ diff: 'x' }]);
    await expectDelegation(() => aiClient.onJobEvent(vi.fn()), api.ai.onJobEvent, [expect.any(Function)]);
  });

  it('delegates planner operations to the planner Electron domain', async () => {
    await expectDelegation(() => plannerClient.getData(), api.planner.plannerGetData, []);
    await expectDelegation(() => plannerClient.ensureRepositoryProject('C:/repo'), api.planner.plannerEnsureRepositoryProject, ['C:/repo']);
    await expectDelegation(() => plannerClient.createProject({ name: 'Project' } as any), api.planner.plannerCreateProject, [{ name: 'Project' }]);
    await expectDelegation(() => plannerClient.updateProject('p1', { name: 'Next' } as any), api.planner.plannerUpdateProject, ['p1', { name: 'Next' }]);
    await expectDelegation(() => plannerClient.deleteProject('p1'), api.planner.plannerDeleteProject, ['p1']);
    await expectDelegation(() => plannerClient.deleteRepositoryProjectByPath('C:/repo'), api.planner.plannerDeleteRepositoryProjectByPath, ['C:/repo']);
    await expectDelegation(() => plannerClient.createItem('p1', { title: 'Task' } as any), api.planner.plannerCreateItem, ['p1', { title: 'Task' }]);
    await expectDelegation(() => plannerClient.updateItem('i1', { title: 'Next' } as any), api.planner.plannerUpdateItem, ['i1', { title: 'Next' }]);
    await expectDelegation(() => plannerClient.deleteItem('i1'), api.planner.plannerDeleteItem, ['i1']);
    await expectDelegation(() => plannerClient.materializeProject('p1'), api.planner.plannerMaterializeProject, ['p1']);
  });

  it('delegates GitHub operations across app, GitHub and AI domains', async () => {
    await expectDelegation(() => githubClient.openExternalUrl('https://github.com'), api.app.openExternalUrl, ['https://github.com']);
    await expectDelegation(() => githubClient.checkAuthStatus(), api.github.githubCheckAuthStatus, []);
    await expectDelegation(() => githubClient.auth('token', 'github.test'), api.github.githubAuth, ['token', 'github.test']);
    await expectDelegation(() => githubClient.cancelAuth(), api.github.githubCancelAuth, []);
    await expectDelegation(() => githubClient.deviceStart(), api.github.githubDeviceStart, []);
    await expectDelegation(() => githubClient.devicePoll('device-code'), api.github.githubDevicePoll, ['device-code']);
    await expectDelegation(() => githubClient.webLogin(), api.github.githubWebLogin, []);
    await expectDelegation(() => githubClient.getRepositories({ page: 2 }), api.github.githubGetRepos, [{ page: 2 }]);
    await expectDelegation(() => githubClient.getSavedAuthStatus(), api.github.githubGetSavedAuthStatus, []);
    await expectDelegation(() => githubClient.loginWithSavedToken(), api.github.githubLoginWithSavedToken, []);
    await expectDelegation(() => githubClient.logout(), api.github.githubLogout, []);
    await expectDelegation(() => githubClient.createRepository('repo', 'desc', true), api.github.githubCreateRepo, ['repo', 'desc', true]);
    await expectDelegation(() => githubClient.forkRepository({ owner: 'octo', repo: 'hello' } as any), api.github.githubForkRepo, [
      { owner: 'octo', repo: 'hello' },
    ]);
    await expectDelegation(() => githubClient.getPullRequests('octo', 'hello', 'open'), api.github.githubGetPRs, ['octo', 'hello', 'open']);
    await expectDelegation(() => githubClient.createPullRequest({ owner: 'octo' } as any), api.github.githubCreatePR, [{ owner: 'octo' }]);
    await expectDelegation(() => githubClient.getWorkflowRuns({ owner: 'octo', repo: 'hello' }), api.github.githubGetWorkflowRuns, [
      { owner: 'octo', repo: 'hello' },
    ]);
    await expectDelegation(() => githubClient.getStatusChecks({ owner: 'octo', repo: 'hello', ref: 'main' }), api.github.githubGetStatusChecks, [
      { owner: 'octo', repo: 'hello', ref: 'main' },
    ]);
    await expectDelegation(
      () => githubClient.mergePullRequest({ owner: 'octo', repo: 'hello', pullNumber: 1, mergeMethod: 'squash' }),
      api.github.githubMergePR,
      [{ owner: 'octo', repo: 'hello', pullNumber: 1, mergeMethod: 'squash' }],
    );
    await expectDelegation(() => githubClient.getReleaseContext({ owner: 'octo', repo: 'hello' }), api.github.githubGetReleaseContext, [
      { owner: 'octo', repo: 'hello' },
    ]);
    await expectDelegation(() => githubClient.createRelease({ owner: 'octo', repo: 'hello' } as any), api.github.githubCreateRelease, [
      { owner: 'octo', repo: 'hello' },
    ]);
    await expectDelegation(
      () => githubClient.uploadReleaseAsset({ owner: 'octo', repo: 'hello', releaseId: 1, filePath: 'C:/a.zip' }),
      api.github.githubUploadReleaseAsset,
      [{ owner: 'octo', repo: 'hello', releaseId: 1, filePath: 'C:/a.zip' }],
    );
    await expectDelegation(() => githubClient.getRepository('octo', 'hello'), api.github.githubGetRepository, ['octo', 'hello']);
    await expectDelegation(
      () => githubClient.generateReleaseNotes({ tagName: 'v1', releaseName: 'v1', commits: [], language: 'de', versionBump: 'patch' }),
      api.ai.aiGenerateReleaseNotes,
      [{ tagName: 'v1', releaseName: 'v1', commits: [], language: 'de', versionBump: 'patch' }],
    );
  });

  it('builds common git command argument lists without touching Electron', () => {
    expect(gitClient.buildPushCurrentBranchArgs()).toEqual(['push', '-u', 'origin', 'HEAD']);
    expect(gitClient.buildPushArgs(['--force-with-lease'])).toEqual(['push', '--force-with-lease']);
    expect(gitClient.buildPushCurrentBranchArgs({ remote: 'upstream', ref: 'feature', setUpstream: false, extraArgs: ['--force-with-lease'] })).toEqual([
      'push',
      '--force-with-lease',
      'upstream',
      'feature',
    ]);
    expect(gitClient.buildCheckoutBranchArgs('main')).toEqual(['checkout', 'main']);
    expect(gitClient.buildCheckoutRefArgs('abc123')).toEqual(['checkout', 'abc123']);
    expect(gitClient.buildCheckoutRemoteBranchArgs('origin/main')).toEqual(['checkout', '--track', 'origin/main']);
    expect(gitClient.buildCheckoutRemoteBranchArgs('origin/main', 'main')).toEqual(['checkout', '-b', 'main', '--track', 'origin/main']);
    expect(gitClient.buildCreateBranchArgs('feature')).toEqual(['checkout', '-b', 'feature']);
    expect(gitClient.buildCreateBranchArgs('feature', 'abc123')).toEqual(['checkout', '-b', 'feature', 'abc123']);
    expect(gitClient.buildDeleteBranchArgs('feature')).toEqual(['branch', '-d', 'feature']);
    expect(gitClient.buildDeleteBranchArgs('feature', { force: true })).toEqual(['branch', '-D', 'feature']);
    expect(gitClient.buildRenameBranchArgs('old', 'new')).toEqual(['branch', '-m', 'old', 'new']);
    expect(gitClient.buildMergeBranchArgs('feature', ['--no-ff'])).toEqual(['merge', '--no-ff', 'feature']);
    expect(gitClient.buildCherryPickCommitArgs('abc123')).toEqual(['cherry-pick', 'abc123']);
    expect(gitClient.buildRevertCommitArgs('abc123', { noEdit: true })).toEqual(['revert', '--no-edit', 'abc123']);
    expect(gitClient.buildRevertCommitArgs('abc123', { mainline: 1, noEdit: true })).toEqual(['revert', '-m', '1', '--no-edit', 'abc123']);
    expect(gitClient.buildResetToCommitArgs('--hard', 'abc123')).toEqual(['reset', '--hard', 'abc123']);
    expect(gitClient.getPullRequestBranchName(42, 'feature/new thing')).toBe('pr-42-feature-new-thing');
    expect(gitClient.buildFetchPullRequestBranchArgs(42, 'upstream')).toEqual(['fetch', 'upstream', 'pull/42/head']);
    expect(gitClient.buildCheckoutPullRequestBranchArgs('pr-42-feature')).toEqual(['checkout', '-B', 'pr-42-feature', 'FETCH_HEAD']);
    expect(gitClient.buildSetUpstreamBranchArgs('main')).toEqual(['branch', '--set-upstream-to', 'origin/main', 'main']);
    expect(gitClient.buildPullArgs(['--ff-only'])).toEqual(['pull', '--ff-only']);
    expect(gitClient.buildPullRebaseArgs()).toEqual(['pull', '--rebase']);
    expect(gitClient.buildStashPushArgs('saving work')).toEqual(['stash', 'push', '-u', '-m', 'saving work']);
    expect(gitClient.buildStashPushArgs('tracked only', { includeUntracked: false })).toEqual(['stash', 'push', '-m', 'tracked only']);
    expect(gitClient.buildStashPopArgs()).toEqual(['stash', 'pop']);
    expect(gitClient.buildMergeContinueArgs()).toEqual(['mergeContinue']);
    expect(gitClient.buildMergeAbortArgs()).toEqual(['mergeAbort']);
    expect(gitClient.buildRebaseContinueArgs()).toEqual(['rebaseContinue']);
    expect(gitClient.buildRebaseAbortArgs()).toEqual(['rebaseAbort']);
    expect(gitClient.buildCherryPickContinueArgs()).toEqual(['cherryPickContinue']);
    expect(gitClient.buildCherryPickAbortArgs()).toEqual(['cherryPickAbort']);
    expect(gitClient.buildCreateTagArgs('v1', { message: 'release', target: 'abc123' })).toEqual(['tag', '-a', 'v1', '-m', 'release', 'abc123']);
    expect(gitClient.buildCreateTagArgs('v1', { target: 'abc123' })).toEqual(['tag', 'v1', 'abc123']);
    expect(gitClient.buildDeleteTagArgs('v1')).toEqual(['tag', '-d', 'v1']);
    expect(gitClient.buildPushTagsArgs()).toEqual(['push', '--tags']);
    expect(gitClient.buildAddRemoteArgs('upstream', 'url')).toEqual(['remote', 'add', 'upstream', 'url']);
    expect(gitClient.buildRemoveRemoteArgs('upstream')).toEqual(['remote', 'remove', 'upstream']);
    expect(gitClient.buildRenameRemoteArgs('origin', 'upstream')).toEqual(['remote', 'rename', 'origin', 'upstream']);
    expect(gitClient.buildSetRemoteUrlArgs('origin', 'url')).toEqual(['remote', 'set-url', 'origin', 'url']);
    expect(gitClient.buildSubmoduleUpdateInitRecursiveArgs()).toEqual(['submoduleUpdateInitRecursive']);
    expect(gitClient.buildSubmoduleSyncRecursiveArgs()).toEqual(['submoduleSyncRecursive']);
  });

  it('delegates git commands and notifies repo-unavailable listeners once per debounce window', async () => {
    const listener = vi.fn();
    const unsubscribe = gitClient.onRepoUnavailable(listener);
    api.git.runGitCommand.mockResolvedValue({ success: false, error: '[REPO_UNAVAILABLE] missing repo' });
    vi.spyOn(Date, 'now').mockReturnValue(10_000);

    await gitClient.runGitCommand('status' as any);
    await gitClient.runGitCommandForRepo('C:/repo', 'status' as any);
    await gitClient.runGitArgs(['pull' as any, '--rebase']);

    expect(api.git.runGitCommand).toHaveBeenNthCalledWith(1, 'status');
    expect(api.git.runGitCommandForRepo).toHaveBeenCalledWith('C:/repo', 'status');
    expect(api.git.runGitCommand).toHaveBeenNthCalledWith(2, 'pull', '--rebase');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ command: 'status', error: '[REPO_UNAVAILABLE] missing repo' });

    unsubscribe();
  });

  it('delegates high-level git helpers to the git Electron domain', async () => {
    await expectDelegation(() => gitClient.getStatusPorcelain(), api.git.runGitCommand, ['statusPorcelain']);
    await expectDelegation(() => gitClient.getBranchStatusPorcelainV2(), api.git.runGitCommand, ['status', '--porcelain=v2', '--branch']);
    await expectDelegation(() => gitClient.listRemotes(), api.git.runGitCommand, ['remote']);
    await expectDelegation(() => gitClient.getRemoteUrl('upstream'), api.git.runGitCommand, ['remote', 'get-url', 'upstream']);
    await expectDelegation(() => gitClient.addRemote('upstream', 'url'), api.git.runGitCommand, ['remote', 'add', 'upstream', 'url']);
    await expectDelegation(() => gitClient.removeRemote('upstream'), api.git.runGitCommand, ['remote', 'remove', 'upstream']);
    await expectDelegation(() => gitClient.setRemoteUrl('upstream', 'url'), api.git.runGitCommand, ['remote', 'set-url', 'upstream', 'url']);
    await expectDelegation(() => gitClient.pushCurrentBranch({ remote: 'origin', ref: 'main' }), api.git.runGitCommand, ['push', '-u', 'origin', 'main']);
    await expectDelegation(() => gitClient.setUpstreamBranch('main'), api.git.runGitCommand, ['branch', '--set-upstream-to', 'origin/main', 'main']);
    await expectDelegation(() => gitClient.checkoutBranch('main'), api.git.runGitCommand, ['checkout', 'main']);
    await expectDelegation(() => gitClient.checkoutRemoteBranch('origin/main', 'main'), api.git.runGitCommand, [
      'checkout',
      '-b',
      'main',
      '--track',
      'origin/main',
    ]);
    await expectDelegation(() => gitClient.fetchPullRequestBranch(4), api.git.runGitCommand, ['fetch', 'origin', 'pull/4/head']);
    await expectDelegation(() => gitClient.pullRebase(), api.git.runGitCommand, ['pull', '--rebase']);
    await expectDelegation(() => gitClient.stashPush('saving work'), api.git.runGitCommand, ['stash', 'push', '-u', '-m', 'saving work']);
    await expectDelegation(() => gitClient.stashPop(), api.git.runGitCommand, ['stash', 'pop']);
    await expectDelegation(() => gitClient.stageAll(), api.git.runGitCommand, ['add', '-A']);
    await expectDelegation(() => gitClient.commitMessage('Title', ' Body '), api.git.runGitCommand, ['commit', '-m', 'Title', '-m', 'Body']);
    await expectDelegation(() => gitClient.commitMessage('Title'), api.git.runGitCommand, ['commit', '-m', 'Title']);
    await expectDelegation(() => gitClient.commitAllowEmpty('msg'), api.git.runGitCommand, ['commit', '--allow-empty', '-m', 'msg']);
  });

  it('delegates rich git APIs and repo-unavailable guarded methods', async () => {
    await expectDelegation(() => gitClient.scanPushSecrets({ includeTags: true }), api.git.scanPushSecrets, [{ includeTags: true }]);
    await expectDelegation(() => gitClient.approveSecretScanPush(['origin', 'HEAD']), api.git.approveSecretScanPush, [['origin', 'HEAD']]);
    await expectDelegation(() => gitClient.cancelSecretScan(), api.git.cancelSecretScan, []);
    await expectDelegation(() => gitClient.createCommit({ message: 'm' } as any), api.git.createCommit, [{ message: 'm' }]);
    await expectDelegation(() => gitClient.getCommitLogPage({ limit: 10 } as any), api.git.getCommitLogPage, [{ limit: 10 }]);
    await expectDelegation(() => gitClient.requestCommitStats(['a'] as any), api.git.requestCommitStats, [['a']]);
    await expectDelegation(() => gitClient.onCommitStats(vi.fn()), api.git.onCommitStats, [expect.any(Function)]);
    await expectDelegation(() => gitClient.getWorkingTreeSnapshot(), api.git.getWorkingTreeSnapshot, []);
    await expectDelegation(() => gitClient.getWorkingTreeStats(), api.git.getWorkingTreeStats, []);
    await expectDelegation(() => gitClient.stagePaths(['a.ts'], 'C:/repo'), api.git.stagePaths, [['a.ts'], 'C:/repo']);
    await expectDelegation(() => gitClient.getDiffPreview({ path: 'a.ts' } as any), api.git.getDiffPreview, [{ path: 'a.ts' }]);
    await expectDelegation(() => gitClient.getFileBlameRange({ path: 'a.ts' } as any), api.git.getFileBlameRange, [{ path: 'a.ts' }]);
    await expectDelegation(() => gitClient.startInteractiveRebase({ base: 'main' } as any), api.git.startInteractiveRebase, [{ base: 'main' }]);
    await expectDelegation(() => gitClient.applyPatch({ patch: 'diff' } as any), api.git.applyPatch, [{ patch: 'diff' }]);
    await expectDelegation(() => gitClient.getStashes(), api.git.getStashes, []);
    await expectDelegation(() => gitClient.gitStashBranch({ stash: 'stash@{0}' } as any), api.git.gitStashBranch, [{ stash: 'stash@{0}' }]);
    await expectDelegation(() => gitClient.getRepoOriginUrl('C:/repo'), api.git.getRepoOriginUrl, ['C:/repo']);
    await expectDelegation(() => gitClient.addIgnoreRule('dist/'), api.git.addIgnoreRule, ['dist/']);
    await expectDelegation(() => gitClient.gitFetch(), api.git.gitFetch, []);
    await expectDelegation(() => gitClient.gitPull(), api.git.gitPull, []);
    await expectDelegation(() => gitClient.gitPush(), api.git.gitPush, []);
    await expectDelegation(() => gitClient.gitClone({ url: 'x' } as any), api.git.gitClone, [{ url: 'x' }]);
    await expectDelegation(() => gitClient.gitInit('C:/repo' as any), api.git.gitInit, ['C:/repo']);
    await expectDelegation(() => gitClient.getFileHistory('a.ts' as any), api.git.getFileHistory, ['a.ts']);
    await expectDelegation(() => gitClient.getFileBlame('a.ts' as any), api.git.getFileBlame, ['a.ts']);
    await expectDelegation(() => gitClient.getFileTimelineData('a.ts' as any), api.git.getFileTimelineData, ['a.ts']);
    await expectDelegation(() => gitClient.readRepoFile('a.ts' as any), api.git.readRepoFile, ['a.ts']);
    await expectDelegation(() => gitClient.getMarkdownPreviewFile('README.md' as any), api.git.getMarkdownPreviewFile, ['README.md']);
    await expectDelegation(() => gitClient.getRepoFileDataUrl('logo.png' as any), api.git.getRepoFileDataUrl, ['logo.png']);
    await expectDelegation(() => gitClient.writeRepoFile({ path: 'a.ts' } as any), api.git.writeRepoFile, [{ path: 'a.ts' }]);
    await expectDelegation(() => gitClient.openSubmodule('libs/a' as any), api.git.openSubmodule, ['libs/a']);
    await expectDelegation(() => gitClient.onCloneProgress(vi.fn()), api.git.onCloneProgress, [expect.any(Function)]);
  });
});
