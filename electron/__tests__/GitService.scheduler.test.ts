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

      expect(service.getSchedulerDiagnostics().map((entry) => entry.kind)).toEqual(['polling', 'polling', 'polling', 'polling', 'write']);
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
