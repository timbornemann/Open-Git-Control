import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as FileSystem from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositorySecretScanAllowlistService } from './RepositorySecretScanAllowlistService';
import { SECRET_SCAN_ALLOWLIST_PATH, MAX_SECRET_SCAN_ALLOWLIST_BYTES } from '../../src/types/repositorySecretScanAllowlist';

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof FileSystem>();
  return { ...original };
});

let root: string;
let repo: string;
let other: string;
const service = new RepositorySecretScanAllowlistService();
const policyPath = () => path.join(repo, SECRET_SCAN_ALLOWLIST_PATH);
const write = (value: string | Buffer) => {
  fs.mkdirSync(path.dirname(policyPath()), { recursive: true });
  fs.writeFileSync(policyPath(), value);
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-repo-allowlist-'));
  repo = path.join(root, 'repo');
  other = path.join(root, 'other');
  fs.mkdirSync(repo);
  fs.mkdirSync(other);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('repository allowlist files', () => {
  it('treats a missing file as empty without creating files on read', () => {
    expect(service.read(repo)).toMatchObject({ text: '', exists: false, version: 'missing', relativePath: SECRET_SCAN_ALLOWLIST_PATH });
    expect(fs.readdirSync(repo)).toEqual([]);
  });
  it('saves UTF-8 with LF, preserves comments and isolates repositories', () => {
    const saved = service.save(repo, '# Shared\r\npath:docs/example.env\r\nregex:DUMMY_[A-Z]+\r\ndummy', 'missing');
    expect(saved.text).toBe('# Shared\npath:docs/example.env\nregex:DUMMY_[A-Z]+\ndummy');
    expect(saved.exists).toBe(true);
    expect(service.read(other).text).toBe('');
    expect(new RepositorySecretScanAllowlistService().read(repo)).toEqual(saved);
    expect(fs.readdirSync(path.dirname(policyPath())).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });
  it('appends only relative finding paths, deduplicating case and separators', () => {
    const saved = service.save(repo, '# shared\npath:docs/sample.env', 'missing');
    const next = service.addPaths(repo, ['docs\\sample.env', 'data/config.ini', 'data/config.ini'], saved.version);
    expect(next.text).toBe('# shared\npath:docs/sample.env\npath:data/config.ini\n');
    expect(service.addPaths(repo, ['data/config.ini'], next.version)).toEqual(next);
  });
  it.each(['../outside', '/outside', 'C:\\outside', './relative', 'data\nregex:.*', 'data\0file', ''])('rejects unsafe finding path %j', (value) => {
    expect(() => service.addPaths(repo, [value], 'missing')).toThrow();
    expect(fs.existsSync(policyPath())).toBe(false);
  });
  it('rejects bad requests and avoids silent truncation', () => {
    expect(() => service.addPaths(repo, null, 'missing')).toThrow();
    expect(() => service.save(repo, null, 'missing')).toThrow();
    expect(() => service.save(repo, '', null)).toThrow();
    expect(() => service.save(repo, 'a'.repeat(MAX_SECRET_SCAN_ALLOWLIST_BYTES + 1), 'missing')).toThrow('256 KiB');
  });
  it('rejects stale saves and stale appends after an external change or deletion', () => {
    const saved = service.save(repo, 'path:first.env', 'missing');
    write('path:external.env');
    expect(() => service.save(repo, 'path:mine.env', saved.version)).toThrow('changed');
    expect(() => service.addPaths(repo, ['mine.env'], saved.version)).toThrow('changed');
    expect(service.read(repo).text).toBe('path:external.env');
    const current = service.read(repo);
    fs.unlinkSync(policyPath());
    expect(() => service.assertVersion(repo, current.version)).toThrow('changed');
  });
  it('rechecks the file before publication and cleans up only its own temporary file', () => {
    const saved = service.save(repo, 'path:first.env', 'missing');
    const original = fs.fsyncSync;
    vi.spyOn(fs, 'fsyncSync').mockImplementation((descriptor) => {
      original(descriptor);
      write('path:concurrent.env');
    });
    expect(() => service.save(repo, 'path:mine.env', saved.version)).toThrow('changed');
    expect(service.read(repo).text).toBe('path:concurrent.env');
    expect(fs.readdirSync(path.dirname(policyPath())).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });
  it('retains the old file if publication fails', () => {
    const saved = service.save(repo, 'path:first.env', 'missing');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('publication failed');
    });
    expect(() => service.save(repo, 'path:mine.env', saved.version)).toThrow('publication failed');
    expect(service.read(repo).text).toBe(saved.text);
  });
  it.each(['regex:[secret-value', 'regex:', 'path:', 'text\0text'])('blocks an invalid policy but keeps it editable: %j', (value) => {
    write(value);
    const editable = service.readForEditing(repo);
    expect(editable.text).toBe(value);
    expect(editable.validationError).toBeTruthy();
    expect(editable.validationError).not.toContain('secret-value');
    expect(() => service.read(repo)).toThrow();
    expect(service.save(repo, 'path:fixed.env', editable.version).text).toBe('path:fixed.env');
  });
  it('rejects invalid encodings, oversized files and directory entries', () => {
    write(Buffer.from([0xc3, 0x28]));
    expect(() => service.read(repo)).toThrow('UTF-8');
    write(Buffer.alloc(MAX_SECRET_SCAN_ALLOWLIST_BYTES + 1));
    expect(() => service.read(repo)).toThrow('256 KiB');
    fs.unlinkSync(policyPath());
    fs.mkdirSync(policyPath());
    expect(() => service.read(repo)).toThrow('regular');
  });
  it('preserves custom documentation', () => {
    fs.mkdirSync(path.dirname(policyPath()));
    fs.writeFileSync(path.join(path.dirname(policyPath()), 'README.md'), '# Team rules');
    service.save(repo, '# allowed', 'missing');
    expect(fs.readFileSync(path.join(path.dirname(policyPath()), 'README.md'), 'utf8')).toBe('# Team rules');
  });
  it('rejects a configuration directory that points into another repository', () => {
    fs.symlinkSync(other, path.join(repo, '.Open-Git-Control'), 'junction');
    expect(() => service.read(repo)).toThrow('symbolic link');
    expect(() => service.save(repo, 'path:file.env', 'missing')).toThrow('symbolic link');
  });
});
