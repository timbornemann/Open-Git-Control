import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { GitService } from '../GitService';

describe('GitService.getLog pagination', () => {
  it('adds --skip for incremental loading and supports head scope', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getLog(120, false, 40);

    expect(runCommandSpy).toHaveBeenCalledTimes(1);
    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      'log',
      '--topo-order',
      '-120',
      '--skip=40',
      '--numstat',
    ]));
    const args = runCommandSpy.mock.calls[0][0];
    expect(args).not.toContain('--all');
  });

  it('clamps invalid offset to 0', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getLog(50, true, -100);

    const args = runCommandSpy.mock.calls[0][0];
    expect(args).toContain('--skip=0');
    expect(args).toContain('--all');
  });
});


describe('GitService forensic history commands', () => {
  it('builds -S search command with path separator', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByString('needle', 'src/main.ts', 120);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      'log',
      '-S',
      'needle',
      '--',
      'src/main.ts',
      '-120',
    ]));
  });

  it('builds -G regex search command with path separator', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByRegex('foo.*bar', 'src/App.tsx', 80);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      'log',
      '-G',
      'foo.*bar',
      '--',
      'src/App.tsx',
      '-80',
    ]));
  });

  it('builds -L line range search command', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByLineRange('src/App.tsx', 10, 30, 60);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      'log',
      '-60',
      '-L10,30:src/App.tsx',
    ]));
  });
});

describe('GitService repo path normalization', () => {
  it('stores repository root when path is inside a git repo', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-git-root-'));
    const nestedDir = path.join(rootDir, 'src', 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
    const service = new GitService();

    service.setRepoPath(nestedDir);

    expect(path.resolve(service.getRepoPath() || '')).toBe(path.resolve(rootDir));

    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('keeps original path when root lookup fails', () => {
    const plainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-non-repo-'));
    const service = new GitService();

    service.setRepoPath(plainDir);

    expect(path.resolve(service.getRepoPath() || '')).toBe(path.resolve(plainDir));

    fs.rmSync(plainDir, { recursive: true, force: true });
  });
});

describe('GitService stale index.lock recovery', () => {
  it('removes stale lock files and retries git command once', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-index-lock-'));
    try {
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDir, 'README.md'), 'test\n', 'utf8');
      execFileSync('git', ['add', 'README.md'], { cwd: repoDir, stdio: 'ignore' });
      execFileSync(
        'git',
        ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'],
        { cwd: repoDir, stdio: 'ignore' },
      );
      fs.writeFileSync(path.join(repoDir, 'CHANGE.txt'), 'change\n', 'utf8');

      const lockPath = path.join(repoDir, '.git', 'index.lock');
      fs.writeFileSync(lockPath, 'stale lock', 'utf8');
      const staleDate = new Date(Date.now() - 120_000);
      fs.utimesSync(lockPath, staleDate, staleDate);

      const service = new GitService();
      service.setRepoPath(repoDir);

      await service.addFile('CHANGE.txt');
      const stagedFiles = await service.runCommand(['diff', '--cached', '--name-only']);
      expect(stagedFiles.split(/\r?\n/).filter(Boolean)).toContain('CHANGE.txt');
      expect(fs.existsSync(lockPath)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
