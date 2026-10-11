import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maintenanceFixture } from './maintenanceFixture';
import { repositoryPathKey } from '../activeRepositoryAuthorization';

describe('repository retention and return periods', () => {
  let fixture: ReturnType<typeof maintenanceFixture>;
  beforeEach(() => {
    fixture = maintenanceFixture();
  });
  afterEach(() => fixture.dispose());
  const eligible = () => fixture.service.run({ mode: 'eligible', categories: ['metadata'] });
  it('requires 90 days and three distinct days, persists observations across restarts, and probes again before removal', async () => {
    await eligible();
    await eligible();
    fixture.advance(90);
    await eligible();
    expect(fixture.data.repos).toHaveLength(1); // Only two different days.
    fixture.restart();
    fixture.advance(1);
    const result = await eligible();
    expect(fixture.probe).toHaveBeenCalledTimes(5);
    expect(fixture.data.repos).toEqual([]);
    expect(result.removedRepositories[0].entry).toEqual({ path: fixture.repo, pinned: true, createdAt: 11, lastOpened: 23 });
    expect(result.reports.at(-1)?.removedRepositories).toEqual([fixture.repo]);
  });
  it('never removes from an inspection-only pass', async () => {
    await fixture.service.inspect();
    fixture.advance(1);
    await fixture.service.inspect();
    fixture.advance(90);
    await fixture.service.inspect();
    expect(fixture.data.repos).toHaveLength(1);
  });
  it.each(['unreachable', 'invalid', 'git-unavailable', 'available'] as const)('resets the missing period on %s', async (health) => {
    await eligible();
    fixture.advance(60);
    fixture.health(health);
    const uncertain = await eligible();
    expect(uncertain.repositories[0].missingSince).toBeNull();
    fixture.advance(60);
    fixture.health('missing');
    await eligible();
    fixture.advance(1);
    await eligible();
    expect(fixture.data.repos).toHaveLength(1);
    expect((await fixture.service.inspect()).repositories[0].missingSince).toBe(fixture.now - 86_400_000);
  });
  it('preserves active repositories and ongoing jobs', async () => {
    await eligible();
    fixture.advance(1);
    await eligible();
    fixture.advance(89);
    fixture.data = { ...fixture.data, activeRepo: fixture.repo };
    await eligible();
    expect(fixture.data.repos).toHaveLength(1);
    fixture.data = { ...fixture.data, activeRepo: null };
    fixture.busy(true);
    expect((await eligible()).reports.at(-1)?.deferred[0].reason).toBe('in-use-or-recovery');
    expect(fixture.data.repos).toHaveLength(1);
  });
  it('retains repositories referenced by planning, incomplete publications, or migrations', async () => {
    const planner = fixture.file('project-planner.json', { version: 1, projects: [{ repoPath: fixture.repo }], items: [{ title: 'User content' }] });
    await eligible();
    fixture.advance(1);
    await eligible();
    fixture.advance(89);
    await eligible();
    expect(fixture.data.repos).toHaveLength(1);
    const original = fs.readFileSync(planner, 'utf8');
    fixture.remove();
    fixture.advance(30);
    await eligible();
    expect(fs.readFileSync(planner, 'utf8')).toBe(original);
    expect((await fixture.service.inspect()).removedRepositories).toHaveLength(1);
  });
  it('rechecks immediately before removal and lets a concurrent activation win', async () => {
    await eligible();
    fixture.advance(1);
    await eligible();
    fixture.advance(89);
    fixture.probe
      .mockImplementationOnce(async () => 'missing')
      .mockImplementationOnce(async () => {
        fixture.data = { ...fixture.data, activeRepo: fixture.repo };
        return 'missing';
      });
    await eligible();
    expect(fixture.data.repos).toHaveLength(1);
    fixture.data = { ...fixture.data, activeRepo: null };
    fixture.probe.mockImplementationOnce(async () => 'missing').mockImplementationOnce(async () => 'available');
    await eligible();
    expect(fixture.data.repos).toHaveLength(1);
    expect((await fixture.service.inspect()).repositories[0].checkedDays).toBe(1);
  });
  it('restores metadata during the return period and cancels deferred deletion', async () => {
    const key = repositoryPathKey(fixture.repo);
    const preferences = fixture.file('repository-remotes.json', { version: 2, repositories: { [key]: { fetch: true } } });
    await fixture.service.inspect();
    fixture.remove();
    fixture.advance(29);
    fixture.restart();
    fixture.health('available');
    const result = await fixture.service.restore(fixture.repo);
    expect(result.repos[0].pinned).toBe(true);
    expect(result.repos[0].createdAt).toBe(11);
    fixture.advance(40);
    await eligible();
    expect(JSON.parse(fs.readFileSync(preferences, 'utf8')).repositories[key]).toEqual({ fetch: true });
    expect((await fixture.service.inspect()).removedRepositories).toEqual([]);
  });
  it('rechecks the return ticket after a delayed availability probe', async () => {
    await fixture.service.inspect();
    fixture.remove();
    fixture.advance(29);
    fixture.probe.mockImplementationOnce(async () => {
      fixture.advance(2);
      return 'available';
    });
    await expect(fixture.service.restore(fixture.repo)).rejects.toThrow('expired');
    expect(fixture.data.repos).toEqual([]);
  });
  it('expires only disposable associations after 30 days and leaves user data unchanged', async () => {
    const key = repositoryPathKey(fixture.repo);
    const preferences = fixture.file('repository-remotes.json', { version: 2, repositories: { [key]: { fetch: true } } });
    const credentials = fixture.file('hosting-token.bin', 'private secret');
    await fixture.service.inspect();
    fixture.remove();
    fixture.advance(29);
    await eligible();
    expect(JSON.parse(fs.readFileSync(preferences, 'utf8')).repositories[key]).toBeDefined();
    fixture.advance(1);
    await eligible();
    expect(JSON.parse(fs.readFileSync(preferences, 'utf8')).repositories[key]).toBeUndefined();
    expect(fs.readFileSync(credentials, 'utf8')).toBe('private secret');
    await expect(fixture.service.restore(fixture.repo)).rejects.toThrow('expired');
  });
  it('starts new observation periods for legacy orphan metadata rather than using file dates', async () => {
    fixture.data = { ...fixture.data, repos: [] };
    const preferences = fixture.file('run-approvals.json', { version: 1, repositories: { [repositoryPathKey(fixture.repo)]: ['approval'] } });
    fs.utimesSync(preferences, new Date(0), new Date(0));
    await eligible();
    fixture.advance(29);
    await eligible();
    expect(JSON.parse(fs.readFileSync(preferences, 'utf8')).repositories).not.toEqual({});
    fixture.advance(1);
    await eligible();
    expect(JSON.parse(fs.readFileSync(preferences, 'utf8')).repositories).toEqual({});
  });
});
