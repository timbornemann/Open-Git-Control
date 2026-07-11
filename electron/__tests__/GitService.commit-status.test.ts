import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { GitService } from '../GitService';

describe('GitService stale index.lock recovery', () => {
  it('does not delete an index lock whose ownership cannot be verified', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-index-lock-'));
    try {
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDir, 'README.md'), 'test\n', 'utf8');
      execFileSync('git', ['add', 'README.md'], { cwd: repoDir, stdio: 'ignore' });
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoDir, 'CHANGE.txt'), 'change\n', 'utf8');

      const lockPath = path.join(repoDir, '.git', 'index.lock');
      fs.writeFileSync(lockPath, 'stale lock', 'utf8');
      const staleDate = new Date(Date.now() - 120_000);
      fs.utimesSync(lockPath, staleDate, staleDate);

      const service = new GitService();
      service.setRepoPath(repoDir);

      await expect(service.addFile('CHANGE.txt')).rejects.toThrow(/index\.lock/i);
      expect(fs.existsSync(lockPath)).toBe(true);
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
      await expect(
        service.commitWithMessage({
          title: 'Long commit title',
          description: longDescription,
          amend: true,
          signoff: true,
        }),
      ).resolves.toBe('committed');

      expect(runner).toHaveBeenCalledWith('git', expect.arrayContaining(['commit', '--amend', '--signoff', '-F', messageFilePath]), expect.any(Object));
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
      expect(fs.readFileSync(pathspecFilePath, 'utf8')).toBe(':(literal)src/app.ts\0:(literal)docs/read me.md\0');
      return { stdout: 'committed\n', stderr: '' };
    });
    const service = new GitService(runner as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    try {
      await expect(service.commitWithMessageForPaths({ title: 'Batch commit' }, ['src/app.ts', 'docs/read me.md'])).resolves.toBe('committed');

      expect(runner).toHaveBeenCalledWith('git', expect.arrayContaining(['commit', '-F', messageFilePath, '--pathspec-file-nul']), expect.any(Object));
      expect(fs.existsSync(messageFilePath)).toBe(false);
      expect(fs.existsSync(pathspecFilePath)).toBe(false);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('GitService stagePaths', () => {
  it('stages multiple untracked files through one literal pathspec file', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-stage-untracked-'));
    try {
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.mkdirSync(path.join(repoDir, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(repoDir, 'first file.txt'), 'one\n', 'utf8');
      fs.writeFileSync(path.join(repoDir, 'nested', '[second].txt'), 'two\n', 'utf8');

      const service = new GitService();
      service.setRepoPath(repoDir);
      await expect(service.stagePaths(['first file.txt', 'nested/[second].txt'])).resolves.toBe('');

      const staged = (await service.runCommand(['diff', '--cached', '--name-only'])).split(/\r?\n/).filter(Boolean).sort();
      expect(staged).toEqual(['first file.txt', 'nested/[second].txt']);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('unstages an unborn-branch file with later working-tree edits without deleting it', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-unborn-unstage-'));
    try {
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      const filePath = path.join(repoDir, 'first file.txt');
      fs.writeFileSync(filePath, 'staged\n', 'utf8');
      execFileSync('git', ['add', 'first file.txt'], { cwd: repoDir, stdio: 'ignore' });
      fs.writeFileSync(filePath, 'edited after staging\n', 'utf8');

      const service = new GitService();
      service.setRepoPath(repoDir);
      await expect(service.runCommand(['rm', '--cached', '-f', '--', 'first file.txt'])).resolves.toBe("rm 'first file.txt'");

      expect(fs.readFileSync(filePath, 'utf8')).toBe('edited after staging\n');
      expect(execFileSync('git', ['status', '--porcelain=v1'], { cwd: repoDir, encoding: 'utf8' }).trim()).toBe('?? "first file.txt"');
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

describe('GitService status and stash helpers', () => {
  it('requests porcelain status with path quoting disabled', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-status-quotepath-'));
    const runner = vi.fn(async () => ({ stdout: ' M \u00e4.txt\n', stderr: '' }));
    const service = new GitService(runner as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    try {
      await expect(service.getStatusPorcelain()).resolves.toBe(' M \u00e4.txt');

      expect(runner).toHaveBeenCalledWith('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--untracked-files=all'], expect.any(Object));
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
      await expect(service.createBranchFromStash('stash@{0}', 'feature/stashed')).resolves.toBe('Switched to a new branch feature/stashed');

      expect(runner).toHaveBeenNthCalledWith(1, 'git', ['check-ref-format', '--branch', 'feature/stashed'], expect.any(Object));
      expect(runner).toHaveBeenNthCalledWith(2, 'git', ['stash', 'branch', 'feature/stashed', 'stash@{0}'], expect.any(Object));
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('rejects arbitrary stash arguments before passing them to Git', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-stash-ref-'));
    const runner = vi.fn();
    const service = new GitService(runner as any);
    (service as any).repoPath = repoDir;
    (service as any).repoIsBare = false;

    try {
      await expect(service.createBranchFromStash('--help', 'feature/stashed')).rejects.toThrow('Invalid stash reference.');
      expect(runner).not.toHaveBeenCalled();
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
