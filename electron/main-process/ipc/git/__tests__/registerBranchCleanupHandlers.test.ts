import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitService } from '../../../../GitService';
import type { HostingService } from '../../../../hosting/HostingService';
import type { BranchCleanupService } from '../../../../git/BranchCleanupService';
import type { BranchCleanupPreferencesStore } from '../../../../git/BranchCleanupPreferences';
import type { RemoteTransferService } from '../../../../git/RemoteTransferService';
import type { CleanupContext } from '../../../../git/branchCleanupModel';
import { RepoJobRegistry } from '../../../repoJobRegistry';
import { beginCommitProtection } from '../../../RepositoryCommitProtection';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerBranchCleanupHandlers } from '../registerBranchCleanupHandlers';

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock('electron', () => ({
  app: { getPath: () => '' },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) },
}));
beforeEach(() => handlers.clear());
const repo = path.resolve('cleanup-ipc-repo');
function fixture() {
  let active: string | null = repo;
  const registry = new RepoJobRegistry();
  registry.cancelForRepoChange(repo);
  const inspect = vi.fn(async (_request, context: CleanupContext) => {
    context.ensureActive();
    context.progress('branches');
    return { id: 'plan' };
  });
  const execute = vi.fn(async (_request, context: CleanupContext) => {
    context.ensureActive();
    return { outcomes: [], cancelled: false };
  });
  const preferences = { read: vi.fn(() => ({ protectedPatterns: ['main'] })), write: vi.fn((_repo, value) => value) };
  registerBranchCleanupHandlers({
    gitService: { runner: {}, getRepoPath: () => active } as unknown as GitService,
    transfers: {} as RemoteTransferService,
    hosting: {} as HostingService,
    repoJobRegistry: registry,
    preferences: preferences as unknown as BranchCleanupPreferencesStore,
    service: { inspect, execute } as unknown as BranchCleanupService,
  });
  const event = { sender: { id: 11, send: vi.fn(), isDestroyed: () => false } };
  const request = { repoPath: repo, operationId: 'scan-1' };
  return {
    inspect,
    execute,
    preferences,
    event,
    request,
    registry,
    switchRepo: () => {
      active = path.resolve('other-repo');
      registry.cancelForRepoChange(active);
    },
  };
}

describe('branch cleanup IPC authorization and lifecycle', () => {
  it('pins requests to the active repository and emits progress through existing job events', async () => {
    const f = fixture();
    expect(await handlers.get(IpcChannel.GitInspectBranchCleanup)!(f.event, f.request)).toEqual({ success: true, data: { id: 'plan' } });
    expect(f.event.sender.send.mock.calls.map((call) => call[1].status)).toEqual(['start', 'progress', 'done']);
    f.switchRepo();
    expect(await handlers.get(IpcChannel.GitInspectBranchCleanup)!(f.event, f.request)).toMatchObject({ success: false });
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.registry.isRepositoryBusy(repo)).toBe(false);
  });
  it('cancels only an operation belonging to the requesting window and releases its job', async () => {
    const f = fixture();
    let ready!: () => void;
    const entered = new Promise<void>((resolve) => {
      ready = resolve;
    });
    f.inspect.mockImplementation(async (_request, context) => {
      ready();
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      context.ensureActive();
      return { id: 'never' };
    });
    const running = handlers.get(IpcChannel.GitInspectBranchCleanup)!(f.event, f.request);
    await entered;
    expect(handlers.get(IpcChannel.GitCancelBranchCleanup)!({ sender: { id: 12 } }, f.request.operationId)).toBe(false);
    expect(handlers.get(IpcChannel.GitCancelBranchCleanup)!(f.event, f.request.operationId)).toBe(true);
    expect(await running).toMatchObject({ success: false });
    expect(f.event.sender.send.mock.calls.at(-1)?.[1].status).toBe('cancelled');
    expect(f.registry.isRepositoryBusy(repo)).toBe(false);
  });
  it('aborts an in-flight inspection after a repository switch and rejects duplicate IDs', async () => {
    const f = fixture();
    let ready!: () => void;
    const entered = new Promise<void>((resolve) => {
      ready = resolve;
    });
    f.inspect.mockImplementation(async (_request, context) => {
      ready();
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      context.ensureActive();
      return { id: 'never' };
    });
    const running = handlers.get(IpcChannel.GitInspectBranchCleanup)!(f.event, f.request);
    await entered;
    expect(await handlers.get(IpcChannel.GitInspectBranchCleanup)!(f.event, f.request)).toMatchObject({ success: false });
    f.switchRepo();
    expect(await running).toMatchObject({ success: false });
    expect(f.registry.isRepositoryBusy(repo)).toBe(false);
  });
  it('shares write protection with other repository operations and guards preference writes', async () => {
    const f = fixture();
    const release = beginCommitProtection(repo)!;
    try {
      expect(
        await handlers.get(IpcChannel.GitExecuteBranchCleanup)!(f.event, { ...f.request, planId: 'plan', selectedIds: ['branch'], confirmedUnmergedIds: [] }),
      ).toMatchObject({ success: false });
      expect(handlers.get(IpcChannel.GitBranchCleanupPreferencesSave)!(f.event, repo, { protectedPatterns: [] })).toMatchObject({ success: false });
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.preferences.write).not.toHaveBeenCalled();
    } finally {
      release();
    }
    expect(handlers.get(IpcChannel.GitBranchCleanupPreferencesGet)!(f.event, repo)).toMatchObject({ success: true });
    expect(handlers.get(IpcChannel.GitBranchCleanupPreferencesSave)!(f.event, repo, { protectedPatterns: ['release/*'] })).toMatchObject({ success: true });
    expect(
      await handlers.get(IpcChannel.GitExecuteBranchCleanup)!(f.event, { ...f.request, planId: 'plan', selectedIds: ['branch'], confirmedUnmergedIds: [] }),
    ).toMatchObject({ success: true });
    expect(beginCommitProtection(repo)?.()).toBeUndefined();
  });
});
