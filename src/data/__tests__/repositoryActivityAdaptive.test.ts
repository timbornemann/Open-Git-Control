// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { hydratePreviews, queryClient } from '../queryClient';
import { RepositoryActivityCoordinator } from '../repositoryActivityCoordinator';
import { RepositoryActivityDemand } from '../repositoryActivityDemand';
import { publishRepositoryActivity, repositoryActivityKey, type RepositoryActivityResult } from '../repositoryActivityCache';

const summary = (repoPath: string, fingerprint = 'a'.repeat(64)): RepositoryActivityResult => ({
  success: true,
  data: { repoPath, changeCount: 1, checkedAt: Date.now(), statusFingerprint: fingerprint },
});
let coordinator: RepositoryActivityCoordinator, demand: RepositoryActivityDemand;
const pending: Array<() => void> = [];
const advance = (ms = 10) => vi.advanceTimersByTimeAsync(ms);
const advanceTo = (time: number) => advance(Math.max(0, time - Date.now()));
const calls = () => vi.mocked(gitClient.getRepositoryChangeSummary).mock.calls.map(([path]) => path);
const count = (path: string) => calls().filter((entry) => entry === path).length;
const read = (path: string) => queryClient.getQueryData<RepositoryActivityResult>(repositoryActivityKey(path));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getRepositoryChangeSummary').mockImplementation(async (path) => summary(path));
  demand = new RepositoryActivityDemand();
  coordinator = new RepositoryActivityCoordinator(demand);
  coordinator.start();
});
afterEach(async () => {
  coordinator.dispose();
  pending.splice(0).forEach((resolve) => resolve());
  await advance();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('adaptive repository activity checks', () => {
  it('backs off unchanged successful results through every interval and stays bounded at five minutes', async () => {
    let due = Date.now();
    coordinator.setRepositories(['/cold'], null, true);
    await advance();
    expect(calls()).toEqual(['/cold']);
    let completed = 1;
    for (const interval of [15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]) {
      due += interval;
      await advanceTo(due - 1);
      expect(count('/cold')).toBe(completed);
      await advanceTo(due);
      expect(count('/cold')).toBe(++completed);
    }
  });

  it('resets on a different status fingerprint even when the changed-file count stays the same', async () => {
    const start = Date.now();
    coordinator.setRepositories(['/cold'], null, true);
    await advance(45_010);
    expect(count('/cold')).toBe(3);
    vi.mocked(gitClient.getRepositoryChangeSummary).mockImplementation(async (path) => summary(path, 'b'.repeat(64)));
    await advanceTo(start + 105_000);
    expect(count('/cold')).toBe(4);
    expect(read('/cold')).toMatchObject({ data: { changeCount: 1, statusFingerprint: 'b'.repeat(64) } });
    await advance(14_999);
    expect(count('/cold')).toBe(4);
    await advance(1);
    expect(count('/cold')).toBe(5);
  });

  it('keeps the latest three inactive repositories fast and updates them from lastOpened metadata', async () => {
    const start = Date.now();
    const repos = ['/active', '/old', '/c', '/b', '/a'];
    const metadata = {
      '/active': { lastOpened: 100 },
      '/a': { lastOpened: 40 },
      '/b': { lastOpened: 30 },
      '/c': { lastOpened: 20 },
      '/old': { lastOpened: 10 },
    };
    coordinator.setRepositories(repos, '/active', true, metadata);
    await advanceTo(start + 30_010);
    expect(calls().slice(0, 4)).toEqual(['/a', '/b', '/c', '/old']);
    for (const path of ['/a', '/b', '/c']) expect(count(path)).toBe(3);
    expect(count('/old')).toBe(2);
    expect(count('/active')).toBe(0);
    coordinator.setRepositories(repos, '/active', true, { ...metadata, '/old': { lastOpened: 50 } });
    await advance();
    expect(count('/old')).toBe(3);
    await advanceTo(start + 45_030);
    expect(count('/old')).toBe(4);
    expect(count('/c')).toBe(3);
    coordinator.setRepositories(repos, '/a', true, { ...metadata, '/old': { lastOpened: 50 } });
    await advance();
    expect(count('/active')).toBe(1);
    expect(count('/c')).toBe(3);
    const before = count('/a');
    await advance(15_000);
    expect(count('/a')).toBe(before);
  });

  it('normalizes recent metadata without treating aliases, removed entries or invalid timestamps as extra favorites', async () => {
    coordinator.setRepositories(['c:/work/A', '/b', '/c', '/old'], null, true, {
      'C:\\Work\\a': { lastOpened: 90 },
      'c:/work/a': { lastOpened: 80 },
      '/removed': { lastOpened: 100 },
      '/b': { lastOpened: 50 },
      '/c': { lastOpened: 40 },
      '/old': { lastOpened: Number.NaN },
    });
    await advance(30_010);
    expect(count('c:/work/A')).toBe(3);
    expect(count('/b')).toBe(3);
    expect(count('/c')).toBe(3);
    expect(count('/old')).toBe(2);
  });

  it('promotes newly visible stale data without duplicate reads on repeated visibility changes', async () => {
    coordinator.setRepositories(['/cold'], null, true);
    await advance(45_010);
    expect(count('/cold')).toBe(3);
    await advance(20_000);
    const owner = Symbol();
    demand.setVisible(owner, ['/cold']);
    await advance();
    expect(count('/cold')).toBe(4);
    demand.remove(owner);
    demand.setVisible(owner, ['/cold']);
    await advance();
    expect(count('/cold')).toBe(4);
    await advance(15_000);
    expect(count('/cold')).toBe(5);
    demand.remove(owner);
    await advance(15_000);
    expect(count('/cold')).toBe(5);
  });

  it('gives an overdue ordinary repository a turn after at most three preferred checks', async () => {
    demand.setVisible(Symbol(), ['/p1', '/p2', '/p3', '/p4', '/p5', '/p6']);
    coordinator.setRepositories(['/cold', '/p1', '/p2', '/p3', '/p4', '/p5', '/p6'], null, true);
    await advance(20);
    expect(calls()).toEqual(['/p1', '/p2', '/p3', '/cold', '/p4', '/p5', '/p6']);
  });

  it('preserves failed data and its retry delay even after a visibility promotion', async () => {
    const start = Date.now();
    coordinator.setRepositories(['/cold'], null, true);
    await advance(45_010);
    vi.mocked(gitClient.getRepositoryChangeSummary).mockResolvedValueOnce({ success: false, error: 'drive unavailable' });
    await advanceTo(start + 105_000);
    expect(count('/cold')).toBe(4);
    expect(queryClient.getQueryState(repositoryActivityKey('/cold'))?.status).toBe('error');
    expect(read('/cold')).toMatchObject({ data: { changeCount: 1 } });
    demand.setVisible(Symbol(), ['/cold']);
    await advance(59_999);
    expect(count('/cold')).toBe(4);
    await advance(1);
    expect(count('/cold')).toBe(5);
  });

  it('resets a long delay for external status publications and explicit invalidations', async () => {
    coordinator.setRepositories(['/cold'], null, true);
    await advance(45_010);
    publishRepositoryActivity('/cold', 0);
    await advance(15_000);
    expect(count('/cold')).toBe(4);
    await queryClient.invalidateQueries({ queryKey: repositoryActivityKey('/cold'), exact: true, refetchType: 'none' });
    await advance();
    expect(count('/cold')).toBe(5);
    await advance(15_000);
    expect(count('/cold')).toBe(6);
  });

  it('does not treat a cancelled response as a new success after an external status publication', async () => {
    const start = Date.now();
    coordinator.setRepositories(['/cold'], null, true);
    await advance(45_010);
    let finish!: (result: RepositoryActivityResult) => void;
    const slow = new Promise<RepositoryActivityResult>((resolve) => {
      finish = resolve;
    });
    pending.push(() => finish(summary('/cold')));
    vi.mocked(gitClient.getRepositoryChangeSummary).mockReturnValueOnce(slow);
    await advanceTo(start + 105_000);
    publishRepositoryActivity('/cold', 7);
    finish(summary('/cold'));
    await advance();
    expect(read('/cold')).toMatchObject({ data: { changeCount: 7 } });
    await advanceTo(start + 120_000);
    expect(count('/cold')).toBe(5);
    await advanceTo(start + 135_000);
    expect(count('/cold')).toBe(6);
  });

  it('keeps one lane while visibility and recent-use priorities change during a pending check', async () => {
    let finish!: (result: RepositoryActivityResult) => void;
    vi.mocked(gitClient.getRepositoryChangeSummary).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    pending.push(() => finish(summary('/cold')));
    coordinator.setRepositories(['/cold', '/next'], null, true);
    await advance();
    demand.setVisible(Symbol(), ['/next']);
    coordinator.setRepositories(['/cold', '/next'], null, true, { '/next': { lastOpened: 1 } });
    await advance(5000);
    expect(calls()).toEqual(['/cold']);
    finish(summary('/cold'));
    await advance();
    expect(calls()).toEqual(['/cold', '/next']);
  });

  it('does not advance stability for an aborted check and does not persist it across restarts', async () => {
    coordinator.setRepositories(['/cold'], null, true);
    await advance();
    let finish!: (result: RepositoryActivityResult) => void;
    const slow = new Promise<RepositoryActivityResult>((resolve) => {
      finish = resolve;
    });
    pending.push(() => finish(summary('/cold')));
    vi.mocked(gitClient.getRepositoryChangeSummary).mockReturnValueOnce(slow);
    await advance(15_000);
    expect(count('/cold')).toBe(2);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    finish(summary('/cold'));
    await advance(45_000);
    expect(count('/cold')).toBe(2);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await advance();
    expect(count('/cold')).toBe(3);
    await advance(30_000);
    expect(count('/cold')).toBe(4);
    coordinator.dispose();
    coordinator.start();
    await advance(15_000);
    expect(count('/cold')).toBe(5);
  });

  it('requires fresh fingerprints before extending intervals for legacy data', async () => {
    vi.mocked(gitClient.getRepositoryChangeSummary).mockImplementation(async (repoPath) => ({
      success: true,
      data: { repoPath, changeCount: 1, checkedAt: Date.now() },
    }));
    coordinator.setRepositories(['/cold'], null, true);
    await advance(45_010);
    expect(count('/cold')).toBe(4);
  });

  it('refreshes a restored fingerprint immediately and starts with a new stability baseline', async () => {
    const start = Date.now();
    hydratePreviews(
      [{ version: 1, key: repositoryActivityKey('/cold'), savedAt: start, sourceRevision: 'old', complete: true, data: summary('/cold') }],
      start,
    );
    coordinator.setRepositories(['/cold'], null, true);
    await advance();
    expect(count('/cold')).toBe(1);
    await advanceTo(start + 15_000);
    expect(count('/cold')).toBe(2);
    await advanceTo(start + 45_000);
    expect(count('/cold')).toBe(3);
  });
});
