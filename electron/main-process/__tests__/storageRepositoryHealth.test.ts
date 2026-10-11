import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeRepositoryHealth, probedCommonDirectory } from '../storageRepositoryHealth';
import * as runtime from '../../system-tools/toolRuntime';

describe('isolated bounded repository probes', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-probe-test-'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-probe-test-')) throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('distinguishes available Git, invalid structures and confirmed missing folders', async () => {
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    expect(await probeRepositoryHealth(repo)).toBe('invalid');
    execFileSync('git', ['-C', repo, 'init'], { windowsHide: true, stdio: 'ignore' });
    expect(await probeRepositoryHealth(repo)).toBe('available');
    expect(probedCommonDirectory(repo)).toBe(fs.realpathSync(path.join(repo, '.git')));
    fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'damaged');
    expect(await probeRepositoryHealth(repo)).toBe('invalid');
    expect(await probeRepositoryHealth(path.join(root, 'missing', 'repo'))).toBe('missing');
  });
  it('resolves repository path aliases to the same Git common directory', async () => {
    const repo = path.join(root, 'repo');
    const alias = path.join(root, 'repo-alias');
    fs.mkdirSync(repo);
    execFileSync('git', ['-C', repo, 'init'], { windowsHide: true, stdio: 'ignore' });
    fs.symlinkSync(repo, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const commonDirectory = fs.realpathSync(path.join(repo, '.git'));
    expect(commonDirectory).not.toBe(path.join(alias, '.git'));
    expect(await probeRepositoryHealth(repo)).toBe('available');
    expect(await probeRepositoryHealth(alias)).toBe('available');
    expect(probedCommonDirectory(repo)).toBe(commonDirectory);
    expect(probedCommonDirectory(alias)).toBe(commonDirectory);
  });
  it('distinguishes missing Git and preserves disconnected drives as ambiguous', async () => {
    vi.spyOn(runtime, 'toolExecutable').mockImplementation(() => {
      throw new Error('Git missing');
    });
    expect(await probeRepositoryHealth(root)).toBe('git-unavailable');
    vi.restoreAllMocks();
    if (process.platform === 'win32') expect(await probeRepositoryHealth('\\\\127.0.0.1\\ogc-no-such-share\\repository')).toBe('unreachable');
  }, 15000);
  it('does not count a broken junction or symbolic-link target as a missing repository', async () => {
    const link = path.join(root, 'relocated-drive');
    fs.symlinkSync(path.join(root, 'offline-target'), link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await probeRepositoryHealth(path.join(link, 'repo'))).toBe('unreachable');
    expect(await probeRepositoryHealth(link)).toBe('unreachable');
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    fs.symlinkSync(path.join(root, 'offline-git-directory'), path.join(repo, '.git'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await probeRepositoryHealth(repo)).toBe('unreachable');
  });
});
