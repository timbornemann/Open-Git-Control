import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitService } from '../../../../GitService';
import { DiffLineStagingService } from '../../../../git/DiffLineStagingService';
import { registerDiffLineSelectionHandler } from '../registerDiffLineSelectionHandler';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { beginCommitProtection } from '../../../RepositoryCommitProtection';

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<any>) => handlers.set(channel, handler) } }));
describe('line selection IPC', () => {
  let active: string;
  const request = { repoPath: 'C:/repo', path: 'file.txt', source: 'unstaged' as const, expectedDiff: 'diff', selectedUnitIds: ['hunk-1:0'] };
  beforeEach(() => {
    vi.restoreAllMocks();
    handlers.clear();
    active = 'C:/repo';
    registerDiffLineSelectionHandler({ runner: {}, getRepoPath: () => active } as GitService);
  });
  const apply = (value: unknown = request) => handlers.get(IpcChannel.GitApplyDiffLineSelection)!({}, value);
  it('forwards typed requests and preserves the structured stale outcome', async () => {
    const service = vi.spyOn(DiffLineStagingService.prototype, 'apply').mockResolvedValue({ status: 'stale' });
    expect(await apply()).toEqual({ success: true, data: { status: 'stale' } });
    expect(service).toHaveBeenCalledWith(request, expect.any(Function));
  });
  it('rejects inactive or missing repositories without reaching the service', async () => {
    const service = vi.spyOn(DiffLineStagingService.prototype, 'apply');
    for (const value of [null, { ...request, repoPath: 'C:/other' }]) expect(await apply(value)).toMatchObject({ success: false, error: expect.any(String) });
    expect(service).not.toHaveBeenCalled();
  });
  it('checks active repository again during the operation', async () => {
    vi.spyOn(DiffLineStagingService.prototype, 'apply').mockImplementation(async (_request, ensure) => {
      active = 'C:/other';
      ensure();
      return { status: 'applied' };
    });
    expect(await apply()).toMatchObject({ success: false, error: expect.any(String) });
  });
  it('respects active commit protection', async () => {
    const service = vi.spyOn(DiffLineStagingService.prototype, 'apply');
    const release = beginCommitProtection('C:/repo');
    try {
      expect(await apply()).toMatchObject({ success: false, error: expect.any(String) });
      expect(service).not.toHaveBeenCalled();
    } finally {
      release?.();
    }
  });
  it('returns a readable failure on rejected Git application', async () => {
    vi.spyOn(DiffLineStagingService.prototype, 'apply').mockRejectedValue(new Error('Index is locked'));
    expect(await apply()).toEqual({ success: false, error: 'Index is locked' });
  });
});
