import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { GitService } from '../../../../GitService';
import { GitScheduler } from '../../../../GitScheduler';
import type { GitExecFileOptions } from '../../../../git/GitProcessTypes';
import type { CommitStatsService } from '../../../../CommitStatsService';
import type { WorkingTreeService } from '../../../../WorkingTreeService';
import { registerReadCancellation } from '../../../readRequests';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import type { ReadPriority } from '../../../../../src/shared/cache/resource';
import { registerGitHistoryHandlers } from '../registerGitHistoryHandlers';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<any>) => handlers.set(channel, handler) } }));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const event = (id = 1) => ({ sender: { id } }) as IpcMainInvokeEvent;
const hash = 'a'.repeat(40);
const raw = [hash, hash.slice(0, 7), 'Author', '2026-10-06T10:00:00Z', 'Fetched commit', '', 'HEAD -> main'].join('\x1f') + '\x00';

describe('commit history request scheduling', () => {
  let repoPath: string;
  let service: GitService;
  let scheduler: GitScheduler;
  let logs: { signal: AbortSignal; finish: ReturnType<typeof deferred<string>> }[];

  beforeEach(() => {
    handlers.clear();
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-history-scheduling-'));
    scheduler = new GitScheduler();
    logs = [];
    service = new GitService(async (_file: string, args: string[], options: GitExecFileOptions) => {
      if (args[0] !== 'log') return { stdout: hash, stderr: '' };
      const signal = options.signal!;
      const finish = deferred<string>();
      logs.push({ signal, finish });
      return new Promise((resolve, reject) => {
        const cancel = () => reject(Object.assign(new Error('Aborted history process'), { name: 'AbortError' }));
        signal.addEventListener('abort', cancel, { once: true });
        void finish.promise.then((stdout) => {
          signal.removeEventListener('abort', cancel);
          resolve({ stdout, stderr: '' });
        });
      });
    }, scheduler);
    vi.spyOn(service, 'getRepoPath').mockReturnValue(repoPath);
    registerReadCancellation();
    registerGitHistoryHandlers({
      gitService: service,
      commitStatsService: { onUpdate: vi.fn(), getCachedStats: vi.fn().mockResolvedValue({}) } as unknown as CommitStatsService,
      workingTreeService: {} as WorkingTreeService,
    });
  });

  afterEach(() => {
    logs.forEach((log) => log.finish.resolve(raw));
    vi.restoreAllMocks();
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  const read = (priority?: ReadPriority, requestId = 'history') =>
    handlers.get(IpcChannel.GitCommitLogPage)!(event(), {
      repoPath,
      scope: 'head',
      ...(priority ? { readRequest: { requestId, priority } } : {}),
    });

  it.each([undefined, 'visible'] as const)('keeps foreground history (%s) alive during fetch and concurrent detail reads', async (priority) => {
    const result = read(priority);
    await vi.waitFor(() => expect(logs).toHaveLength(1));
    await service.runCommandAtPath(repoPath, ['fetch', 'origin']);
    await service.runCommandAtPath(repoPath, ['diff', '--', 'file.txt']);
    await service.runCommandAtPath(repoPath, ['show', '-s', '--format=%s', 'HEAD']);
    logs[0].finish.resolve(raw);
    expect(await result).toMatchObject({ success: true, data: { raw, repoPath } });
    expect(logs[0].signal.aborted).toBe(false);
    expect(scheduler.getDiagnostics()).toContainEqual(expect.objectContaining({ command: 'log', kind: 'interactive', aborted: false }));
  });

  it.each(['repository', 'startup', 'speculative'] as const)('allows %s preloading to yield and a visible retry to finish', async (priority) => {
    const background = read(priority);
    await vi.waitFor(() => expect(logs).toHaveLength(1));
    await service.runCommandAtPath(repoPath, ['diff', '--', 'file.txt']);
    expect(await background).toEqual({ success: false, error: 'Git operation was aborted.' });
    expect(logs[0].signal.aborted).toBe(true);

    const foreground = read('visible', 'visible-retry');
    await vi.waitFor(() => expect(logs).toHaveLength(2));
    await service.runCommandAtPath(repoPath, ['show', '-s', '--format=%s', 'HEAD']);
    logs[1].finish.resolve(raw);
    expect(await foreground).toMatchObject({ success: true, data: { raw } });
  });

  it('still cancels foreground history when its owning window leaves the repository', async () => {
    const result = read('visible');
    await vi.waitFor(() => expect(logs).toHaveLength(1));
    await handlers.get(IpcChannel.AppCancelRead)!(event(2), 'history');
    expect(logs[0].signal.aborted).toBe(false);
    await handlers.get(IpcChannel.AppCancelRead)!(event(), 'history');
    expect(await result).toEqual({ success: false, error: 'Git operation was aborted.' });
    expect(logs[0].signal.aborted).toBe(true);
  });

  it('finishes a visible history read before a queued local write', async () => {
    const result = read('visible');
    await vi.waitFor(() => expect(logs).toHaveLength(1));
    let written = false;
    const write = scheduler.schedule(repoPath, 'write', 'checkout', async () => {
      written = true;
    });
    expect(written).toBe(false);
    logs[0].finish.resolve(raw);
    expect(await result).toMatchObject({ success: true, data: { raw } });
    await write;
    expect(written).toBe(true);
  });

  it('cancels the HEAD probe while it is waiting for a local write', async () => {
    const gate = deferred<void>();
    const write = scheduler.schedule(repoPath, 'write', 'checkout', () => gate.promise);
    try {
      const result = read('visible');
      await handlers.get(IpcChannel.AppCancelRead)!(event(), 'history');
      expect(await result).toMatchObject({ success: false, error: expect.stringMatching(/aborted/i) });
      expect(logs).toHaveLength(0);
    } finally {
      gate.resolve();
      await write;
    }
  });
});
