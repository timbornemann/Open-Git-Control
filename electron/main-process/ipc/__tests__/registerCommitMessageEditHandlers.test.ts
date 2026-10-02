import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { GitService } from '../../../GitService';
import { GitRunner } from '../../../git/GitRunner';
import { RepoJobRegistry } from '../../repoJobRegistry';
import { registerCommitMessageEditHandlers } from '../git/registerCommitMessageEditHandlers';

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle } }));
describe('commit edit IPC authorization and lifecycle', () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  beforeEach(() => {
    handlers.clear();
    handle.mockImplementation((channel, handler) => handlers.set(channel, handler));
  });
  function setup() {
    let repo = 'C:/repo';
    let busy = false;
    const registry = new RepoJobRegistry();
    const service = registerCommitMessageEditHandlers({
      gitService: { runner: new GitRunner(), getRepoPath: () => repo } as GitService,
      repoJobRegistry: registry,
      ensureCommitProtectionIsIdle: () => {
        if (busy) throw new Error('busy');
      },
      beginCommitProtection: () => {
        if (busy) return null;
        busy = true;
        return () => {
          busy = false;
        };
      },
    });
    const event = { sender: { id: 1, send: vi.fn() } };
    const request = {
      repoPath: repo,
      commitHash: 'a'.repeat(40),
      expectedHead: 'b'.repeat(40),
      expectedBranch: 'refs/heads/main',
      title: 'Edited',
      description: '',
      operationId: randomUUID(),
    };
    const switchRepo = () => {
      repo = 'C:/different';
      registry.cancelForRepoChange(repo);
    };
    return { service, event, request, switchRepo, isBusy: () => busy };
  }
  it('rejects non-active paths before running Git', async () => {
    const { service, event, request } = setup();
    const inspect = vi.spyOn(service, 'inspect');
    const reword = vi.spyOn(service, 'reword');
    expect(await handlers.get(IpcChannel.GitInspectCommitMessageEdit)!(event, { ...request, repoPath: 'C:/other' })).toMatchObject({ success: false });
    expect(await handlers.get(IpcChannel.GitRewordCommitMessage)!(event, { ...request, repoPath: 'C:/other' })).toMatchObject({ success: false });
    expect(inspect).not.toHaveBeenCalled();
    expect(reword).not.toHaveBeenCalled();
  });
  it.each(['cancel', 'switch'])('handles %s, rejects duplicate/concurrent jobs and releases protection', async (kind) => {
    const { service, event, request, switchRepo, isBusy } = setup();
    vi.spyOn(service, 'reword').mockImplementation(async (_input, context) => {
      context.progress('remotes');
      await new Promise<void>((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
      throw new Error('unreachable');
    });
    const running = handlers.get(IpcChannel.GitRewordCommitMessage)!(event, request);
    expect(isBusy()).toBe(true);
    expect(await handlers.get(IpcChannel.GitRewordCommitMessage)!(event, request)).toMatchObject({ success: false });
    expect(await handlers.get(IpcChannel.GitRewordCommitMessage)!(event, { ...request, operationId: randomUUID() })).toMatchObject({ success: false });
    expect(handlers.get(IpcChannel.GitCancelCommitMessageEdit)!({ sender: { id: 2 } }, request.operationId)).toBe(false);
    if (kind === 'switch') switchRepo();
    else expect(handlers.get(IpcChannel.GitCancelCommitMessageEdit)!(event, request.operationId)).toBe(true);
    expect(await running).toMatchObject({ success: false });
    expect(isBusy()).toBe(false);
    expect(event.sender.send.mock.calls.map((call) => call[1].status)).toEqual(['start', 'progress', 'failed']);
  });
});
