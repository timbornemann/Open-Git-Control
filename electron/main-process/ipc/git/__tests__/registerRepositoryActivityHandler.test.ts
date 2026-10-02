import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../../../../GitService';
import { WorkingTreeService } from '../../../../WorkingTreeService';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerReadCancellation } from '../../../readRequests';
import { registerRepositoryActivityHandler } from '../registerRepositoryActivityHandler';

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<any>>() }));
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => Promise<any>) => handlers.set(name, handler) } }));
const event = { sender: { id: 12 } };
const invoke = (repoPath: string, request?: { requestId: string; priority: string }) =>
  handlers.get(IpcChannel.GitRepositoryChangeSummary)!(event, repoPath, request);
const mocks = () => {
  const runner = {
    run: vi.fn(async (_path: string, args: string[], _options?: { signal: AbortSignal }): Promise<string> =>
      args.includes('rev-parse') ? 'false\n' : 'MM both.ts\0?? new.ts\0',
    ),
  };
  const gitService = { getRepoPath: vi.fn(() => 'C:/active'), runner, setRepoPath: vi.fn() };
  registerRepositoryActivityHandler({ gitService: gitService as unknown as GitService, readStoredRepoPaths: () => ['C:/inactive'] });
  return { runner, gitService };
};

beforeEach(() => {
  handlers.clear();
  registerReadCancellation();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('repository activity IPC', () => {
  it('only reads exact registered or active roots and never activates an inactive repository', async () => {
    const { runner, gitService } = mocks();
    expect(await invoke('C:/inactive')).toMatchObject({ success: true, data: { repoPath: 'C:/inactive', changeCount: 2 } });
    expect(await invoke('C:/active')).toMatchObject({ success: true });
    for (const repo of ['C:/unknown', 'C:/inactive/nested', '']) expect(await invoke(repo)).toMatchObject({ success: false });
    expect(runner.run).toHaveBeenCalledTimes(4);
    expect(runner.run).toHaveBeenCalledWith(
      'C:/inactive',
      expect.arrayContaining(['--no-optional-locks', '--untracked-files=all', '-z']),
      expect.objectContaining({ requestedKind: 'background' }),
    );
    expect(gitService.setRepoPath).not.toHaveBeenCalled();
  });

  it('uses no worktree status or snapshot reads for bare repositories', async () => {
    const { runner } = mocks();
    runner.run.mockResolvedValue('true\n');
    expect(await invoke('C:/inactive')).toMatchObject({ success: true, data: { changeCount: 0 } });
    expect(runner.run).toHaveBeenCalledOnce();
  });

  it('aborts a hung check at ten seconds and allows the next request', async () => {
    vi.useFakeTimers();
    const { runner } = mocks();
    runner.run.mockImplementationOnce(
      (_repo, _args, ...rest: unknown[]) =>
        new Promise((_, reject) => {
          const { signal } = rest[0] as { signal: AbortSignal };
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );
    const pending = invoke('C:/inactive');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ success: false, error: 'Repository status check timed out.' });
    expect(await invoke('C:/inactive')).toMatchObject({ success: true });
  });

  it('forwards renderer read cancellation to the Git scheduler', async () => {
    const { runner } = mocks();
    runner.run.mockImplementationOnce(
      (_repo, _args, ...rest: unknown[]) =>
        new Promise((_, reject) => {
          const { signal } = rest[0] as { signal: AbortSignal };
          signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        }),
    );
    const pending = invoke('C:/inactive', { requestId: 'activity-1', priority: 'speculative' });
    await handlers.get(IpcChannel.AppCancelRead)!(event, 'activity-1');
    expect(await pending).toEqual({ success: false, error: 'cancelled' });
  });

  it('observes external changes and a clean commit without changing the active Git service', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-activity-'));
    const inactive = path.join(root, 'inactive');
    fs.mkdirSync(inactive);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: inactive, stdio: 'pipe' });
    try {
      git('init', '-q');
      for (const file of ['both.txt', 'rename.txt', 'delete.txt']) fs.writeFileSync(path.join(inactive, file), `${file}\n`);
      fs.writeFileSync(path.join(inactive, '.gitignore'), 'ignored/\n');
      git('add', '.');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial');
      fs.appendFileSync(path.join(inactive, 'both.txt'), 'staged\n');
      git('add', 'both.txt');
      fs.appendFileSync(path.join(inactive, 'both.txt'), 'unstaged\n');
      git('mv', 'rename.txt', 'renamed.txt');
      fs.unlinkSync(path.join(inactive, 'delete.txt'));
      fs.mkdirSync(path.join(inactive, 'new'));
      fs.writeFileSync(path.join(inactive, 'new/one.txt'), 'one');
      fs.writeFileSync(path.join(inactive, 'new/two.txt'), 'two');
      fs.mkdirSync(path.join(inactive, 'ignored'));
      fs.writeFileSync(path.join(inactive, 'ignored/ignore.txt'), 'ignored');
      const service = new GitService();
      const selection = vi.spyOn(service, 'setRepoPath');
      registerRepositoryActivityHandler({ gitService: service, readStoredRepoPaths: () => [inactive] });
      expect(await invoke(inactive)).toMatchObject({ success: true, data: { changeCount: 5 } });
      git('add', '-A');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'clean');
      expect(await invoke(inactive)).toMatchObject({ success: true, data: { changeCount: 0 } });
      fs.writeFileSync(path.join(inactive, 'external.txt'), 'changed outside the app');
      expect(await invoke(inactive)).toMatchObject({ success: true, data: { changeCount: 1 } });
      const child = path.join(root, 'child');
      fs.mkdirSync(child);
      execFileSync('git', ['init', '-q'], { cwd: child, stdio: 'pipe' });
      fs.writeFileSync(path.join(child, 'child.txt'), 'initial');
      execFileSync('git', ['add', '.'], { cwd: child, stdio: 'pipe' });
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'child'], { cwd: child, stdio: 'pipe' });
      git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, 'sub');
      git('add', '-A');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'submodule');
      git('config', 'submodule.sub.ignore', 'all');
      fs.appendFileSync(path.join(inactive, 'sub/child.txt'), 'edited');
      expect(await invoke(inactive)).toMatchObject({ success: true, data: { changeCount: 1 } });
      expect(await new WorkingTreeService(service).getSnapshot(inactive)).toMatchObject({ changeCount: 1 });
      expect(selection).not.toHaveBeenCalled();
      expect(service.getRepoPath()).toBeNull();
    } finally {
      if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('ogc-activity-')) fs.rmSync(root, { recursive: true, force: true });
    }
  }, 20_000); // Real Git/submodule fixture setup is slower under the full parallel Windows suite.
});
