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
  it('loads root commit statistics with one first-parent show command', async () => {
    const service = new GitService();
    const run = vi.spyOn(service, 'runCommandAtPathWithSignal')
      .mockResolvedValueOnce('10\t2\tsrc/root.ts');

    await expect(service.getCommitStatsAtPath('C:/repo', 'a'.repeat(40), new AbortController().signal))
      .resolves.toEqual({ files: 1, additions: 10, deletions: 2 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toEqual([
      'show',
      '--root',
      '--first-parent',
      '--format=',
      '--numstat',
      '-r',
      '-M',
      'a'.repeat(40),
    ]);
  });

  it('uses only the first parent for normal and merge commits', async () => {
    const service = new GitService();
    const hash = 'c'.repeat(40);
    const run = vi.spyOn(service, 'runCommandAtPathWithSignal')
      .mockResolvedValueOnce('1\t1\tnormal.ts')
      .mockResolvedValueOnce('2\t3\tmerge.ts');
    const signal = new AbortController().signal;

    await expect(service.getCommitStatsAtPath('C:/repo', hash, signal))
      .resolves.toEqual({ files: 1, additions: 1, deletions: 1 });
    await expect(service.getCommitStatsAtPath('C:/repo', hash, signal))
      .resolves.toEqual({ files: 1, additions: 2, deletions: 3 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][1]).toEqual([
      'show',
      '--root',
      '--first-parent',
      '--format=',
      '--numstat',
      '-r',
      '-M',
      hash,
    ]);
  });
});

describe('GitService file timeline data', () => {
  it('parses structured timeline output without splitting subjects or paths on separators', async () => {
    const service = new GitService();
    const recordSeparator = '\x1e';
    const fieldSeparator = '\x1f';
    const nullSeparator = '\x00';
    const hash = 'a'.repeat(40);
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue([
      `${recordSeparator}${hash}${fieldSeparator}Alice${fieldSeparator}2026-01-01 12:00:00 +0000${fieldSeparator}feat: keep | pipe`,
      'M',
      'src/with spaces/file name.ts',
      'R100',
      'src/old name.ts',
      'src/new name.ts',
    ].join(nullSeparator));

    const timeline = await service.getFileTimelineData(50);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining([
      '-z',
      '--name-status',
    ]));
    expect(timeline).toEqual([{
      hash,
      author: 'Alice',
      date: '2026-01-01 12:00:00 +0000',
      subject: 'feat: keep | pipe',
      changes: [
        { status: 'modified', path: 'src/with spaces/file name.ts' },
        { status: 'renamed', oldPath: 'src/old name.ts', path: 'src/new name.ts' },
      ],
    }]);
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

describe('GitService Markdown preview reads', () => {
  it('reads Markdown text and linked image assets from working tree, index, and commit', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-markdown-preview-'));
    try {
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.mkdirSync(path.join(repoDir, 'docs', 'images'), { recursive: true });
      fs.writeFileSync(path.join(repoDir, 'docs', 'README.md'), '# Preview\n\n![Logo](images/logo.png)\n', 'utf8');
      fs.writeFileSync(
        path.join(repoDir, 'docs', 'images', 'logo.png'),
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
      );

      const service = new GitService();
      service.setRepoPath(repoDir);

      await expect(service.readRepositoryFileTextAtSource('unstaged', 'docs/README.md'))
        .resolves.toContain('# Preview');
      await expect(service.readRepositoryImageDataUrlAtSource('unstaged', 'docs/images/logo.png'))
        .resolves.toMatchObject({ mimeType: 'image/png' });

      execFileSync('git', ['add', 'docs/README.md', 'docs/images/logo.png'], { cwd: repoDir, stdio: 'ignore' });
      await expect(service.readRepositoryFileTextAtSource('staged', 'docs/README.md'))
        .resolves.toContain('![Logo]');

      execFileSync(
        'git',
        ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'docs'],
        { cwd: repoDir, stdio: 'ignore' },
      );
      const commitHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();

      await expect(service.readRepositoryFileTextAtSource('commit', 'docs/README.md', commitHash))
        .resolves.toContain('# Preview');
      const image = await service.readRepositoryImageDataUrlAtSource('commit', 'docs/images/logo.png', commitHash);
      expect(image.dataUrl).toMatch(/^data:image\/png;base64,/);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
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

describe('GitService commitWithMessage', () => {
  it('passes long commit messages through a temporary message file', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-commit-message-file-'));
    let messageFilePath = '';
    const longDescription = 'body '.repeat(2000).trim();
    const runner = vi.fn(async (_file: string, args: string[]) => {
      const fileFlagIndex = args.indexOf('-F');
      expect(fileFlagIndex).toBeGreaterThan(0);
      messageFilePath = args[fileFlagIndex + 1];
      expect(fs.readFileSync(messageFilePath, 'utf8')).toBe(`Long commit title\n\n${longDescription}`);
      return { stdout: 'committed\n', stderr: '' };
    });
    const service = new GitService(runner as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    try {
      await expect(service.commitWithMessage({
        title: 'Long commit title',
        description: longDescription,
        amend: true,
        signoff: true,
      })).resolves.toBe('committed');

      expect(runner).toHaveBeenCalledWith('git', expect.arrayContaining([
        'commit',
        '--amend',
        '--signoff',
        '-F',
        messageFilePath,
      ]), expect.any(Object));
      expect(fs.existsSync(messageFilePath)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('can limit a commit to explicit pathspec entries', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-commit-pathspec-'));
    let messageFilePath = '';
    let pathspecFilePath = '';
    const runner = vi.fn(async (_file: string, args: string[]) => {
      const fileFlagIndex = args.indexOf('-F');
      expect(fileFlagIndex).toBeGreaterThan(0);
      messageFilePath = args[fileFlagIndex + 1];
      const pathspecArg = args.find((arg) => arg.startsWith('--pathspec-from-file='));
      expect(pathspecArg).toBeTruthy();
      pathspecFilePath = String(pathspecArg).slice('--pathspec-from-file='.length);
      expect(fs.readFileSync(messageFilePath, 'utf8')).toBe('Batch commit');
      expect(fs.readFileSync(pathspecFilePath, 'utf8')).toBe('src/app.ts\0docs/read me.md\0');
      return { stdout: 'committed\n', stderr: '' };
    });
    const service = new GitService(runner as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    try {
      await expect(service.commitWithMessageForPaths(
        { title: 'Batch commit' },
        ['src/app.ts', 'docs/read me.md'],
      )).resolves.toBe('committed');

      expect(runner).toHaveBeenCalledWith('git', expect.arrayContaining([
        'commit',
        '-F',
        messageFilePath,
        '--pathspec-file-nul',
      ]), expect.any(Object));
      expect(fs.existsSync(messageFilePath)).toBe(false);
      expect(fs.existsSync(pathspecFilePath)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('GitService status and stash helpers', () => {
  it('requests porcelain status with path quoting disabled', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-status-quotepath-'));
    const runner = vi.fn(async () => ({ stdout: ' M ä.txt\n', stderr: '' }));
    const service = new GitService(runner as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    try {
      await expect(service.getStatusPorcelain()).resolves.toBe(' M ä.txt');

      expect(runner).toHaveBeenCalledWith('git', [
        '-c',
        'core.quotepath=false',
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
      ], expect.any(Object));
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('creates a branch from a stash after validating the branch name', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-stash-branch-'));
    const runner = vi.fn(async (_file: string, args: string[]) => {
      if (args[0] === 'check-ref-format') return { stdout: 'feature/stashed\n', stderr: '' };
      return { stdout: 'Switched to a new branch feature/stashed\n', stderr: '' };
    });
    const service = new GitService(runner as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    try {
      await expect(service.createBranchFromStash('stash@{0}', 'feature/stashed'))
        .resolves.toBe('Switched to a new branch feature/stashed');

      expect(runner).toHaveBeenNthCalledWith(1, 'git', [
        'check-ref-format',
        '--branch',
        'feature/stashed',
      ], expect.any(Object));
      expect(runner).toHaveBeenNthCalledWith(2, 'git', [
        'stash',
        'branch',
        'feature/stashed',
        'stash@{0}',
      ], expect.any(Object));
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('treats missing .gitmodules mappings as empty submodule status', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-submodule-status-'));
    const error: any = new Error('Command failed');
    error.stderr = "fatal: no submodule mapping found in .gitmodules for path '.claude/worktrees/bold-mendeleev'";
    const runner = vi.fn(async () => {
      throw error;
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new GitService(runner as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    try {
      await expect(service.getSubmoduleStatus()).resolves.toBe('');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(runner).toHaveBeenCalledWith('git', ['submodule', 'status', '--recursive'], expect.any(Object));
    } finally {
      consoleErrorSpy.mockRestore();
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

  it('runs working-tree numstat requests as polling jobs', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-working-tree-stats-'));
    const runner = vi.fn(async () => ({ stdout: '4\t2\tsrc/app.ts\n', stderr: '' }));
    const service = new GitService(runner as any);

    try {
      await service.runPollingCommandAtPath(repoPath, ['diff', '--numstat', '--cached']);

      expect(service.getSchedulerDiagnostics()).toEqual([
        expect.objectContaining({
          kind: 'polling',
          command: 'diff',
        }),
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
    await expect(service.getStatusPorcelain()).resolves.toBe('');
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

  it('does not log quiet rev-parse verification probes as console errors', async () => {
    const error: any = new Error('Command failed');
    error.stderr = 'fatal: Needed a single revision';

    const fakeExec = vi.fn(async () => {
      throw error;
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new GitService(fakeExec as any);
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-nonfatal-verify-test-'));
    (service as any).repoPath = repoDir;

    try {
      await expect(
        service.runCommand(['rev-parse', '--verify', '--quiet', 'v1.2.5^{commit}']),
      ).rejects.toThrow(/Needed a single revision/i);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('logs git format strings without treating %s as console placeholders', async () => {
    const error: any = new Error('Command failed');
    error.stderr = 'fatal: bad revision';

    const fakeExec = vi.fn(async () => {
      throw error;
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new GitService(fakeExec as any);
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-format-log-test-'));
    (service as any).repoPath = repoDir;

    try {
      await expect(
        service.runCommand(['log', 'missing..main', '--pretty=format:%H%x1f%h%x1f%s']),
      ).rejects.toThrow(/bad revision/i);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(String(message)).toContain('--pretty=format:%H%x1f%h%x1f%s');
      expect(String(message)).toContain('fatal: bad revision');
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
