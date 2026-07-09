import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../GitService';

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
      await expect(service.runCommand(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).rejects.toThrow(/no such branch/i);

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
      await expect(service.runCommand(['rev-parse', '--verify', '--quiet', 'v1.2.5^{commit}'])).rejects.toThrow(/Needed a single revision/i);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('treats missing origin as a normal local repository state', async () => {
    const error: any = new Error('Command failed');
    error.stderr = "error: No such remote 'origin'";

    const fakeExec = vi.fn(async () => {
      throw error;
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new GitService(fakeExec as any);
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-local-only-origin-test-'));

    try {
      await expect(service.getRepoOriginUrl(repoDir)).resolves.toBeNull();

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
      await expect(service.runCommand(['log', 'missing..main', '--pretty=format:%H%x1f%h%x1f%s'])).rejects.toThrow(/bad revision/i);

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
