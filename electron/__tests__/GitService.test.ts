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
    ]));
    const args = runCommandSpy.mock.calls[0][0];
    expect(args).not.toContain('--all');
    expect(args).not.toContain('--numstat');
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

describe('GitService commit statistics', () => {
  it('diffs a root commit against the empty tree', async () => {
    const service = new GitService();
    const run = vi.spyOn(service, 'runCommandAtPathWithSignal')
      .mockResolvedValueOnce(`${'a'.repeat(40)}`)
      .mockResolvedValueOnce('10\t2\tsrc/root.ts');

    await expect(service.getCommitStatsAtPath('C:/repo', 'a'.repeat(40), new AbortController().signal))
      .resolves.toEqual({ files: 1, additions: 10, deletions: 2 });
    expect(run.mock.calls[1][1]).toEqual([
      'diff-tree',
      '--root',
      '--no-commit-id',
      '--numstat',
      '-r',
      '-M',
      'a'.repeat(40),
    ]);
  });

  it('uses only the first parent for normal and merge commits', async () => {
    const service = new GitService();
    const hash = 'c'.repeat(40);
    const firstParent = 'a'.repeat(40);
    const secondParent = 'b'.repeat(40);
    const run = vi.spyOn(service, 'runCommandAtPathWithSignal')
      .mockResolvedValueOnce(`${hash} ${firstParent}`)
      .mockResolvedValueOnce('1\t1\tnormal.ts')
      .mockResolvedValueOnce(`${hash} ${firstParent} ${secondParent}`)
      .mockResolvedValueOnce('2\t3\tmerge.ts');
    const signal = new AbortController().signal;

    await expect(service.getCommitStatsAtPath('C:/repo', hash, signal))
      .resolves.toEqual({ files: 1, additions: 1, deletions: 1 });
    await expect(service.getCommitStatsAtPath('C:/repo', hash, signal))
      .resolves.toEqual({ files: 1, additions: 2, deletions: 3 });
    expect(run.mock.calls[3][1]).toEqual([
      'diff-tree',
      '--no-commit-id',
      '--numstat',
      '-r',
      '-M',
      firstParent,
      hash,
    ]);
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

describe('GitService command queue', () => {
  it('serializes concurrent mutating runCommand calls per repository', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-queue-test-repo-'));

    const fakeExec = vi.fn(async (_file: string, _args: string[], _options: any) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      return { stdout: '', stderr: '' };
    });

    const service = new GitService(fakeExec as any);
    (service as any).repoPath = repoDir;

    try {
      await Promise.all([
        service.runCommand(['add', '--', 'a.txt']),
        service.runCommand(['add', '--', 'b.txt']),
        service.runCommand(['commit', '-m', 'test']),
      ]);

      expect(fakeExec).toHaveBeenCalledTimes(3);
      expect(maxInFlight).toBe(1);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('continues processing queued commands after a failed command', async () => {
    let callCount = 0;
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-queue-test-repo-2-'));
    const fakeExec = vi.fn(async (_file: string, _args: string[], _options: any) => {
      callCount += 1;
      if (callCount === 1) {
        const err: any = new Error('first call failed');
        err.stderr = 'fatal: test failure';
        throw err;
      }
      return { stdout: 'ok\n', stderr: '' };
    });

    const service = new GitService(fakeExec as any);
    (service as any).repoPath = repoDir;

    try {
      await expect(service.runCommand(['add', '--', 'x.txt'])).rejects.toThrow('fatal: test failure');
      await expect(service.runCommand(['add', '--', 'y.txt'])).resolves.toBe('ok');
      expect(fakeExec).toHaveBeenCalledTimes(2);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('does not serialize non-mutating read commands', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-queue-test-repo-3-'));

    const fakeExec = vi.fn(async (_file: string, _args: string[], _options: any) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      return { stdout: '', stderr: '' };
    });

    const service = new GitService(fakeExec as any);
    (service as any).repoPath = repoDir;

    try {
      await Promise.all([
        service.runCommand(['status', '--short']),
        service.runCommand(['diff', '--name-only']),
        service.runCommand(['log', '-1']),
      ]);

      expect(fakeExec).toHaveBeenCalledTimes(3);
      expect(maxInFlight).toBeGreaterThan(1);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('GitService scheduler classification', () => {
  it('treats metadata listings as polling and repository mutations as writes', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-scheduler-classification-'));
    const runner = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const service = new GitService(runner as any);

    try {
      await service.runCommandAtPath(repoPath, ['branch', '-a']);
      await service.runCommandAtPath(repoPath, ['remote', '-v']);
      await service.runCommandAtPath(repoPath, ['tag', '-l']);
      await service.runCommandAtPath(repoPath, ['submodule', 'status', '--recursive']);
      await service.runCommandAtPath(repoPath, ['branch', '-d', 'old-branch']);

      expect(service.getSchedulerDiagnostics().map((entry) => entry.kind)).toEqual([
        'polling',
        'polling',
        'polling',
        'polling',
        'write',
      ]);
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });
});

describe('GitService bare repository handling', () => {
  it('suppresses worktree status polling commands for bare repositories', async () => {
    const fakeExec = vi.fn(async () => ({ stdout: 'unexpected\n', stderr: '' }));
    const service = new GitService(fakeExec as any);
    (service as any).repoPath = path.join(os.tmpdir(), 'ogc-bare-test-repo.git');
    (service as any).repoIsBare = true;

    await expect(service.runCommand(['status', '--short'])).resolves.toBe('');
    await expect(service.runCommand(['status', '--porcelain=v1', '--untracked-files=all'])).resolves.toBe('');
    await expect(service.runCommand(['diff', '--numstat'])).resolves.toBe('');
    await expect(service.runCommand(['diff', '--numstat', '--cached'])).resolves.toBe('');
    await expect(service.runCommand(['submodule', 'status', '--recursive'])).resolves.toBe('');

    expect(fakeExec).not.toHaveBeenCalled();
  });
});

describe('GitService repository availability checks', () => {
  it('fails early with REPO_UNAVAILABLE when repository path is missing', async () => {
    const fakeExec = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const service = new GitService(fakeExec as any);
    (service as any).repoPath = path.join(os.tmpdir(), 'ogc-missing-repo-path', String(Date.now()));
    (service as any).repoIsBare = false;

    await expect(service.runCommand(['status', '--short'])).rejects.toThrow(/\[REPO_UNAVAILABLE\]/i);
    expect(fakeExec).not.toHaveBeenCalled();
  });

  it('maps spawn git ENOENT to REPO_UNAVAILABLE when repo disappears during command', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-repo-race-'));
    const fakeExec = vi.fn(async () => {
      fs.rmSync(repoDir, { recursive: true, force: true });
      const err: any = new Error('spawn git ENOENT');
      err.code = 'ENOENT';
      throw err;
    });
    const service = new GitService(fakeExec as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    await expect(service.runCommand(['status', '--short'])).rejects.toThrow(/\[REPO_UNAVAILABLE\]/i);
  });
});

describe('GitService expected non-fatal git errors', () => {
  it('does not log rev-parse upstream lookup failures as console errors', async () => {
    const error: any = new Error('Command failed');
    error.stderr = "fatal: no such branch: 'master'";

    const fakeExec = vi.fn(async () => {
      throw error;
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new GitService(fakeExec as any);
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-nonfatal-upstream-test-'));
    (service as any).repoPath = repoDir;

    try {
      await expect(
        service.runCommand(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
      ).rejects.toThrow(/no such branch/i);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('GitService clone target naming', () => {
  it('derives a stable repo name from a Windows local bare path', () => {
    const service = new GitService();
    const repoName = (service as any).deriveCloneRepoName('D:\\Projects\\Software\\zz. Test-remote.git');
    expect(repoName).toBe('zz. Test-remote');
  });

  it('sanitizes explicit clone target names', () => {
    const service = new GitService();
    const sanitized = (service as any).sanitizeCloneTargetName('demo/repo:name.');
    expect(sanitized).toBe('demo-repo-name');
  });
});
