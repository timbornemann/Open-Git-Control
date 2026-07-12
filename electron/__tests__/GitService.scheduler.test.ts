import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../GitService';

describe('GitService command queue', () => {
  it('serializes concurrent mutating runCommand calls per repository', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-queue-test-repo-'));

    const fakeExec = vi.fn(async (_file: string, _args: string[], _options: any) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      inFlight -= 1;
      return { stdout: '', stderr: '' };
    });

    const service = new GitService(fakeExec as any);
    (service as any).repoPath = repoDir;

    try {
      await Promise.all([service.runCommand(['add', '--', 'a.txt']), service.runCommand(['add', '--', 'b.txt']), service.runCommand(['commit', '-m', 'test'])]);

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
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      inFlight -= 1;
      return { stdout: '', stderr: '' };
    });

    const service = new GitService(fakeExec as any);
    (service as any).repoPath = repoDir;

    try {
      await Promise.all([service.runCommand(['status', '--short']), service.runCommand(['diff', '--name-only']), service.runCommand(['log', '-1'])]);

      expect(fakeExec).toHaveBeenCalledTimes(3);
      expect(maxInFlight).toBeGreaterThan(1);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('keeps local reads responsive during fetch but serializes local writes behind it', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-queue-test-repo-4-'));
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });

    const fakeExec = vi.fn(async (_file: string, args: string[]) => {
      if (args[0] === 'fetch') {
        // Simulate an offline/hanging remote: the fetch stays in flight until
        // explicitly released.
        await fetchGate;
        return { stdout: '', stderr: '' };
      }
      return { stdout: `${args[0]}-ok\n`, stderr: '' };
    });

    const service = new GitService(fakeExec as any);
    (service as any).repoPath = repoDir;

    try {
      // Reads remain useful while a remote is slow, but a local write must not
      // race ref/FETCH_HEAD updates performed by fetch.
      const fetchPromise = service.runCommand(['fetch', 'origin', '--prune']);
      await expect(service.runCommand(['log', '-1'])).resolves.toContain('log-ok');
      const commitPromise = service.runCommand(['commit', '-m', 'local']);
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(fakeExec.mock.calls.some(([, args]) => args[0] === 'commit')).toBe(false);

      releaseFetch();
      await expect(Promise.all([fetchPromise, commitPromise])).resolves.toEqual(['', 'commit-ok']);

      const kinds = service.getSchedulerDiagnostics().map((entry) => `${entry.command}:${entry.kind}`);
      expect(kinds).toContain('fetch:network');
      expect(kinds).toContain('log:interactive');
      expect(kinds).toContain('commit:write');
    } finally {
      releaseFetch();
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('classifies push as a network job', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-queue-test-repo-5-'));
    const service = new GitService((async () => ({ stdout: '', stderr: '' })) as any);
    (service as any).repoPath = repoDir;

    try {
      await service.runCommand(['push', 'origin', 'main']);
      expect(service.getSchedulerDiagnostics().map((entry) => entry.kind)).toEqual(['network']);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('classifies ls-remote as a side-effect-free network read', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-queue-test-repo-6-'));
    const service = new GitService((async () => ({ stdout: '', stderr: '' })) as any);

    try {
      await service.runCommandAtPath(repoDir, ['ls-remote', 'origin']);
      expect(service.getSchedulerDiagnostics().map((entry) => entry.kind)).toEqual(['network-read']);
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
      await service.runCommandAtPath(repoPath, ['branch', '--set-upstream-to=origin/main', 'main']);
      await service.runCommandAtPath(repoPath, ['branch', 'new-branch']);
      await service.runCommandAtPath(repoPath, ['branch', '--track', 'tracked-branch', 'origin/main']);
      await service.runCommandAtPath(repoPath, ['branch', '--list', 'feature/*']);
      await service.runCommandAtPath(repoPath, ['remote', 'set-branches', 'origin', 'main']);
      await service.runCommandAtPath(repoPath, ['rm', '-f', '--', 'gone.txt']);
      await service.runCommandAtPath(repoPath, ['init']);
      await service.runCommandAtPath(repoPath, ['update-ref', 'refs/heads/main', 'a'.repeat(40)]);
      await service.runCommandAtPath(repoPath, ['symbolic-ref', 'HEAD']);
      await service.runCommandAtPath(repoPath, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
      await service.runCommandAtPath(repoPath, ['config', '--get', 'user.name']);
      await service.runCommandAtPath(repoPath, ['config', 'user.name', 'Scheduler Test']);
      await service.runCommandAtPath(repoPath, ['restore', '--', 'file.txt']);
      await service.runCommandAtPath(repoPath, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'configured']);
      await service.runCommandAtPath(repoPath, ['--no-pager', 'status', '--short']);

      expect(service.getSchedulerDiagnostics().map((entry) => entry.kind)).toEqual([
        'polling',
        'polling',
        'polling',
        'polling',
        'write',
        'write',
        'write',
        'write',
        'polling',
        'write',
        'write',
        'write',
        'write',
        'polling',
        'write',
        'polling',
        'write',
        'write',
        'write',
        'polling',
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
    const bareRepoPath = path.join(os.tmpdir(), 'ogc-bare-test-repo.git');
    (service as any).repoPath = bareRepoPath;
    (service as any).bareState.setActive(bareRepoPath, true);

    await expect(service.runCommand(['status', '--short'])).resolves.toBe('');
    await expect(service.runCommand(['status', '--porcelain=v1', '--untracked-files=all'])).resolves.toBe('');
    await expect(service.getStatusPorcelain()).resolves.toBe('');
    await expect(service.runCommand(['diff', '--numstat'])).resolves.toBe('');
    await expect(service.runCommand(['diff', '--numstat', '--cached'])).resolves.toBe('');
    await expect(service.runCommand(['submodule', 'status', '--recursive'])).resolves.toBe('');

    expect(fakeExec).not.toHaveBeenCalled();
  });
});
