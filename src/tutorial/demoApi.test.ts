import { describe, expect, it } from 'vitest';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
import { parseGitLog, parseGitStatusDetailed } from '@/utils/gitParsing';
import { createDemoApi } from './demoApi';
import { DEMO_REPO } from './demoRepository';

const context: TutorialLaunchContext = {
  request: { chapterId: 'basics' },
  language: 'de',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const create = (id = 'stage') =>
  createDemoApi(
    context,
    TUTORIAL_CHAPTERS[0].steps.find((step) => step.id === id)!,
  );

describe('the isolated learning project', () => {
  it('returns coherent Git history, status, staging and commits', async () => {
    const { api, repo } = create();
    const log = await api.git.getCommitLogPage({ limit: 100, offset: 0, scope: 'all' });
    expect(log.success && parseGitLog(log.data.raw)).toHaveLength(4);
    expect(parseGitStatusDetailed(repo.status()).unstaged).toHaveLength(1);
    expect((await api.git.createCommit({ title: 'Empty index' })).success).toBe(false);
    await api.git.stagePaths(['README.md']);
    expect(parseGitStatusDetailed(repo.status()).staged).toHaveLength(1);
    expect(repo.events.has('staged')).toBe(true);
    expect((await api.git.createCommit({ title: '   ' })).success).toBe(false);
    expect((await api.git.createCommit({ title: 'docs: Practice commit' })).success).toBe(true);
    expect(repo.commits[0].subject).toBe('docs: Practice commit');
    expect(repo.status()).toBe('');
    expect(repo.events.has('committed')).toBe(true);
    expect(create().repo.commits).toHaveLength(4);
  });
  it('resets each checkpoint and changes only the simulated branch/remote state', async () => {
    const { api, repo } = create('branch');
    await api.git.runGitCommand('branch', 'feature/practice');
    await api.git.runGitCommand('checkout', 'feature/practice');
    expect(repo.branch).toBe('feature/practice');
    expect(repo.events.has('branch-created')).toBe(true);
    await api.transfers.remoteTransferRequest('fetch', { repoPath: DEMO_REPO, remote: 'origin', background: true });
    expect(repo.events.has('fetched')).toBe(false);
    await api.transfers.remoteTransferRequest('fetch', { repoPath: DEMO_REPO, remote: 'origin' });
    expect(repo.events.has('fetched')).toBe(true);
    expect(create('branch').repo.branches).not.toContain('feature/practice');
    expect(await api.git.runGitCommand('clean', '-fd')).toMatchObject({ success: false });
  });
  it('loads every checkpoint without a native bridge, credentials or real repositories', async () => {
    for (const chapter of TUTORIAL_CHAPTERS)
      for (const step of chapter.steps) {
        const { api, repo } = createDemoApi(context, step);
        const boot = await api.app.getBootstrap();
        expect(boot.snapshots).toEqual([]);
        expect(boot.settings.hasOpenAiApiKey).toBe(false);
        expect(boot.repositories.activeRepo).toBe(DEMO_REPO);
        expect(repo.conflicted).toBe(step.scenario === 'conflict');
        expect((await api.app.getTutorialProgress()).welcomeSeen).toBe(true);
      }
  });
  it('tracks planning and hosting changes in memory', async () => {
    const { api, repo } = create();
    const created = await api.planner.plannerCreateItem('learning', { title: 'Practice', description: '', priority: 'medium', status: 'planned', tags: [] });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error(created.error);
    await api.planner.plannerUpdateItem(created.data.id, { status: 'done' });
    const data = await api.planner.plannerGetData();
    expect(data.success && data.data.items.find((item) => item.id === created.data.id)?.status).toBe('done');
    expect(repo.events.has('task-updated')).toBe(true);
    const hosting = await api.hosting.hostingRequest('connections', undefined);
    expect(hosting.success && hosting.data[0].baseUrl).toBe('https://git.example.invalid');
    expect((await api.app.openExternalUrl('https://example.com')).success).toBe(false);
  });
  it('keeps settings and run commands inside the simulation', async () => {
    const { api, repo } = create();
    await api.settings.setSettings({ defaultBranch: 'practice' });
    expect((await api.settings.getSettings()).defaultBranch).toBe('practice');
    expect((await create().api.settings.getSettings()).defaultBranch).toBe('main');
    await api.runs.startRepositoryRun(DEMO_REPO, 'test');
    const run = await api.runs.getRepositoryRunState();
    expect(run.success && run.data?.status).toBe('succeeded');
    expect(repo.events.has('run-started')).toBe(true);
    const configured = await api.runs.getRepositoryRunConfig(DEMO_REPO);
    if (!configured.success || !configured.data.config) throw new Error('Missing practice run configuration.');
    const next = structuredClone(configured.data.config);
    next.actions.build.steps = [...next.actions.test.steps];
    await api.runs.saveRepositoryRunConfig(DEMO_REPO, next);
    const updated = await api.runs.getRepositoryRunConfig(DEMO_REPO);
    expect(updated.success && updated.data.availableActions.build).toBe(true);
  });
  it('notifies and cleans up simulated subscriptions', () => {
    const { repo } = create();
    let notifications = 0;
    const dispose = repo.subscribe(() => notifications++);
    repo.mark('staged');
    dispose();
    repo.mark('committed');
    expect(notifications).toBe(1);
  });
  it('simulates credential settings without retaining the entered keys', async () => {
    const { api } = create();
    expect((await api.settings.setGeminiApiKey('example-sensitive-value')).hasGeminiApiKey).toBe(true);
    expect((await api.settings.setOpenAiApiKey('example-sensitive-value')).hasOpenAiApiKey).toBe(true);
    expect(JSON.stringify(await api.app.getBootstrap())).not.toContain('example-sensitive-value');
    expect((await api.settings.clearGeminiApiKey()).hasGeminiApiKey).toBe(false);
    expect((await api.settings.clearOpenAiApiKey()).hasOpenAiApiKey).toBe(false);
  });
});
