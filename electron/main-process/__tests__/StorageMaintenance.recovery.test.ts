import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { maintenanceFixture } from './maintenanceFixture';
import { StorageMaintenanceService } from '../StorageMaintenanceService';
import { inventoryRecovery } from '../storageRecoveryInventory';
import { repositoryPathKey } from '../activeRepositoryAuthorization';
import { writeJournal, journalDirectory, backupReference, type EditJournal } from '../../git/commitMessageEditJournal';

// Real inventories and fsync-backed state writes need headroom on shared CI disks.
describe('recovery ownership across missing worktrees and restarts', { timeout: 30_000 }, () => {
  let fixture: ReturnType<typeof maintenanceFixture>;
  let common: string;
  let journal: EditJournal;
  let service: StorageMaintenanceService;
  beforeEach(() => {
    fixture = maintenanceFixture();
    common = path.join(fixture.directory, 'main-repository', '.git');
    fs.mkdirSync(common, { recursive: true });
    journal = {
      version: 1,
      id: randomUUID(),
      repoPath: fixture.repo,
      commonDir: common,
      gitDir: path.join(common, 'worktrees', 'linked'),
      oldHead: 'a'.repeat(40),
      branch: 'refs/heads/main',
      createdAt: fixture.now,
      state: 'preparing',
    };
    service = new StorageMaintenanceService({
      ...fixture.deps,
      writeRepos: (next) => {
        fixture.data = next;
      },
      commonDirectory: () => common,
      recoveryInventory: inventoryRecovery,
    });
  });
  afterEach(() => {
    service.dispose();
    fixture.dispose();
  });
  it('keeps pending journals and their missing repository associations after 90 days', async () => {
    writeJournal(journal);
    fixture.health('available');
    await service.inspect();
    service.dispose();
    service = new StorageMaintenanceService({ ...fixture.deps, recoveryInventory: inventoryRecovery });
    fixture.health('missing');
    await service.inspect();
    fixture.advance(1);
    await service.inspect();
    fixture.advance(90);
    const result = await service.run({ mode: 'eligible' });
    expect(fixture.data.repos).toHaveLength(1);
    expect(result.issues.some((issue) => issue.reason === 'open-recovery-operation')).toBe(true);
    expect(result.groups.find((group) => group.category === 'recovery')?.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(journalDirectory(common), `${journal.id}.json`))).toBe(true);
  });
  it('keeps removed metadata while a recovery operation still refers to its owner', async () => {
    const key = repositoryPathKey(fixture.repo);
    const metadata = fixture.file('repository-remotes.json', { version: 2, repositories: { [key]: {} } });
    writeJournal(journal);
    fixture.health('available');
    await service.inspect();
    service.beforeRegistryChange(fixture.data, { ...fixture.data, repos: [] });
    fixture.data = { ...fixture.data, repos: [] };
    fixture.advance(31);
    await service.run({ mode: 'eligible' });
    expect(JSON.parse(fs.readFileSync(metadata, 'utf8')).repositories[key]).toEqual({});
  });
  it('protects corrupt and future journals, redirected folders and unreachable common directories', async () => {
    writeJournal({ ...journal, state: 'cleaned' });
    const file = path.join(journalDirectory(common), `${journal.id}.json`);
    for (const content of ['{partial', JSON.stringify({ ...journal, version: 99 })]) {
      fs.writeFileSync(file, content);
      const result = await inventoryRecovery({ [fixture.repo]: common });
      expect(result.protectedPaths.has(repositoryPathKey(fixture.repo))).toBe(true);
      expect(fs.readFileSync(file, 'utf8')).toBe(content);
    }
    expect((await inventoryRecovery({ [fixture.repo]: path.join(fixture.directory, 'missing-git') })).protectedPaths.size).toBe(0);
    fs.rmSync(journalDirectory(common), { recursive: true });
    const outside = path.join(fixture.directory, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel'), 'preserve');
    fs.symlinkSync(outside, journalDirectory(common), process.platform === 'win32' ? 'junction' : 'dir');
    expect((await inventoryRecovery({ [fixture.repo]: common })).protectedPaths.size).toBe(1);
    expect(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8')).toBe('preserve');
  });
  it('allows ninety-day removal when the previously observed Git directory was confirmed deleted', async () => {
    fixture.health('available');
    await service.inspect();
    fs.rmdirSync(common);
    fixture.health('missing');
    await service.inspect();
    fixture.advance(1);
    await service.inspect();
    fixture.advance(89);
    await service.run({ mode: 'eligible' });
    expect(fixture.data.repos).toEqual([]);
  });
  it('keeps completed recovery ownership visible after metadata expiry and drops it after explicit cleanup', async () => {
    const key = repositoryPathKey(fixture.repo);
    const metadata = fixture.file('repository-remotes.json', { version: 2, repositories: { [key]: {} } });
    writeJournal({ ...journal, state: 'cleaned' });
    fixture.health('available');
    await service.inspect();
    service.beforeRegistryChange(fixture.data, { ...fixture.data, repos: [] });
    fixture.data = { ...fixture.data, repos: [] };
    fixture.advance(31);
    await service.run({ mode: 'eligible' });
    expect(JSON.parse(fs.readFileSync(metadata, 'utf8')).repositories[key]).toBeUndefined();
    expect(service.recoveryDirectories()).toEqual([common]);
    service.dispose();
    service = new StorageMaintenanceService({ ...fixture.deps, recoveryInventory: inventoryRecovery });
    const overview = await service.inspect();
    expect(overview.groups.find((group) => group.category === 'recovery')?.bytes).toBeGreaterThan(0);
    fs.unlinkSync(path.join(journalDirectory(common), `${journal.id}.json`));
    await service.inspect();
    expect(service.recoveryDirectories()).toEqual([]);
  });
  it('retains common directories with packed backups and protects unknown reference ownership', async () => {
    writeJournal({ ...journal, state: 'cleaned' });
    fs.writeFileSync(path.join(common, 'packed-refs'), `${journal.oldHead} ${backupReference(journal)}\n`);
    expect((await inventoryRecovery({ [fixture.repo]: common })).retainedPaths?.has(repositoryPathKey(fixture.repo))).toBe(true);
    fs.unlinkSync(path.join(journalDirectory(common), `${journal.id}.json`));
    expect((await inventoryRecovery({ [fixture.repo]: common })).protectedPaths.has(repositoryPathKey(fixture.repo))).toBe(true);
  });
});
