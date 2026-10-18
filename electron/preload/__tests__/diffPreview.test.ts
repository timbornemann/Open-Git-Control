import { describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../src/types/ipcContract';
import { createElectronApi } from '../createElectronApi';

describe('cancellable diff preview API', () => {
  it('forwards read tokens with explicit and implicit repositories in both namespaces', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() });
    const args = ['diff', '--', 'src/app.ts'];
    const limits = { maxBytes: 65536, maxLines: 100 };
    const readRequest = { requestId: 'diff-1', priority: 'visible' as const };
    await api.git.getDiffPreview(args, limits, 'C:/repo', readRequest);
    await api.getDiffPreview(args, limits, undefined, readRequest);
    await api.app.cancelReadRequest(readRequest.requestId);
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitDiffPreview, args, limits, 'C:/repo', readRequest],
      [IpcChannel.GitDiffPreview, args, limits, undefined, readRequest],
      [IpcChannel.AppCancelRead, readRequest.requestId],
    ]);
  });

  it('preserves legacy preview argument lists when no read token is supplied', async () => {
    const invoke = vi.fn().mockResolvedValue({ success: true });
    const api = createElectronApi({ invoke, on: vi.fn(), removeListener: vi.fn() });
    const args = ['diff', '--cached', '--', 'src/app.ts'];
    await api.git.getDiffPreview(args);
    await api.getDiffPreview(args, undefined, 'C:/repo');
    expect(invoke.mock.calls).toEqual([
      [IpcChannel.GitDiffPreview, args, {}],
      [IpcChannel.GitDiffPreview, args, {}, 'C:/repo'],
    ]);
  });
});
