import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositorySecretScanAllowlistService } from './RepositorySecretScanAllowlistService';
import { SecretScanAllowlistMigration } from './SecretScanAllowlistMigration';
import { SECRET_SCAN_ALLOWLIST_PATH } from '../../src/types/repositorySecretScanAllowlist';

let root: string;
let repoA: string;
let repoB: string;
let journal: string;
let migration: SecretScanAllowlistMigration;
const service = new RepositorySecretScanAllowlistService();
const indexPaths = vi.fn<(repo: string) => Promise<string[]>>();
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-allowlist-migrate-'));
  repoA = path.join(root, 'a');
  repoB = path.join(root, 'b');
  journal = path.join(root, 'journal.json');
  fs.mkdirSync(repoA);
  fs.mkdirSync(repoB);
  indexPaths.mockReset().mockResolvedValue([]);
  migration = new SecretScanAllowlistMigration(() => journal, service, indexPaths);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('legacy allowlist assignment', () => {
  it('copies matching paths into every matching known repository, dropping unassignable rules', async () => {
    fs.writeFileSync(path.join(repoA, 'sample.env'), 'dummy');
    fs.writeFileSync(path.join(repoB, 'sample.env'), 'dummy');
    fs.mkdirSync(path.join(repoA, 'fixtures'));
    migration.capture('# Shared\npath:sample.env\npath:fixtures\npath:missing.env\nregex:.*\nplain-rule', [repoA, repoB]);
    await Promise.all([migration.prepare(repoA), migration.prepare(repoB)]);
    expect(service.read(repoA).text).toBe('path:sample.env\npath:fixtures\n');
    expect(service.read(repoB).text).toBe('path:sample.env\n');
    expect(migration.consumeReport(repoA)).toMatchObject({ importedRules: 2, discardedRules: 3 });
    expect(migration.consumeReport(repoA)).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(journal, 'utf8')).rules).toEqual([]);
  });
  it('relativizes absolute paths and recognizes files still present in the index', async () => {
    fs.writeFileSync(path.join(repoA, 'sample.env'), 'dummy');
    indexPaths.mockResolvedValue(['deleted/sample.env']);
    migration.capture(`path:${path.join(repoA, 'sample.env')}\npath:deleted/sample.env\npath:../outside\npath:/outside`, [repoA, repoB]);
    await migration.prepare(repoA);
    await migration.prepare(repoB);
    expect(service.read(repoA).text).toContain('path:sample.env\npath:deleted/sample.env');
    expect(service.read(repoB).text).toBe('path:deleted/sample.env\n');
  });
  it('preserves existing policy, including invalid policy the user must repair', async () => {
    fs.writeFileSync(path.join(repoA, 'sample.env'), 'dummy');
    fs.mkdirSync(path.dirname(path.join(repoA, SECRET_SCAN_ALLOWLIST_PATH)));
    fs.writeFileSync(path.join(repoA, SECRET_SCAN_ALLOWLIST_PATH), 'regex:[');
    migration.capture('path:sample.env', [repoA]);
    await migration.prepare(repoA);
    expect(service.readForEditing(repoA).text).toBe('regex:[');
    expect(migration.consumeReport(repoA)).toEqual({ importedRules: 0, discardedRules: 0, preservedExisting: true });
    expect(indexPaths).not.toHaveBeenCalled();
  });
  it('does not create empty files, reimport after deletion or assign rules to newly registered repos', async () => {
    fs.writeFileSync(path.join(repoB, 'sample.env'), 'dummy');
    migration.capture('path:sample.env\nregex:dummy', [repoA]);
    await migration.prepare(repoA);
    await migration.prepare(repoB);
    expect(service.read(repoA).exists).toBe(false);
    expect(service.read(repoB).exists).toBe(false);
    fs.writeFileSync(path.join(repoA, 'sample.env'), 'dummy');
    await migration.prepare(repoA);
    expect(service.read(repoA).exists).toBe(false);
    migration.capture('path:sample.env', [repoB]);
    await migration.prepare(repoB);
    expect(service.read(repoB).exists).toBe(false);
  });
  it('retries an inaccessible known repository when it returns', async () => {
    const missing = path.join(root, 'offline');
    migration.capture('path:sample.env', [missing]);
    await expect(migration.prepare(missing)).rejects.toThrow();
    fs.mkdirSync(missing);
    fs.writeFileSync(path.join(missing, 'sample.env'), 'dummy');
    await migration.prepare(missing);
    expect(service.read(missing).text).toBe('path:sample.env\n');
  });
  it('retries safely if publication fails and serializes duplicate requests', async () => {
    fs.writeFileSync(path.join(repoA, 'sample.env'), 'dummy');
    migration.capture('path:sample.env', [repoA]);
    const save = vi.spyOn(service, 'addPaths').mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    await expect(migration.prepare(repoA)).rejects.toThrow('write failed');
    await Promise.all([migration.prepare(repoA), migration.prepare(repoA)]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(service.read(repoA).text).toBe('path:sample.env\n');
  });
  it('does not follow symlinks to files owned by another repository', async () => {
    fs.mkdirSync(path.join(repoB, 'fixtures'));
    fs.writeFileSync(path.join(repoB, 'fixtures', 'sample.env'), 'dummy');
    fs.symlinkSync(path.join(repoB, 'fixtures'), path.join(repoA, 'fixtures'), 'junction');
    migration.capture('path:fixtures/sample.env', [repoA]);
    await migration.prepare(repoA);
    expect(service.read(repoA).exists).toBe(false);
  });
});
