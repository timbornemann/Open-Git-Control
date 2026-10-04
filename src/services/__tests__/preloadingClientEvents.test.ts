import { afterEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '../appClient';
import { githubClient } from '@/legacy/github/githubClient';
import { queryClient } from '@/data/queryClient';
import { resourceKey } from '@/data/clientCache';
import type { UpdaterStatusDto } from '@/types/appDtos';

const idle: UpdaterStatusDto = {
  isSupported: true,
  state: 'idle',
  currentVersion: '1.0.0',
  availableVersion: null,
  downloaded: false,
  downloadPercent: null,
  bytesPerSecond: null,
  transferred: null,
  total: null,
  lastCheckedAt: null,
  releaseNotes: null,
  error: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('preloading client integration', () => {
  it('keeps an updater event when an earlier status IPC finishes late', async () => {
    let resolve!: (value: UpdaterStatusDto) => void;
    let deliver!: (value: UpdaterStatusDto) => void;
    const unsubscribe = vi.fn();
    const getUpdaterStatus = vi.fn(
      () =>
        new Promise<UpdaterStatusDto>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal('window', {
      electronAPI: {
        app: {
          getUpdaterStatus,
          onUpdaterEvent: (listener: typeof deliver) => {
            deliver = listener;
            return unsubscribe;
          },
        },
      },
    });
    const pending = appClient.getUpdaterStatus().catch(() => undefined);
    await vi.waitFor(() => expect(getUpdaterStatus).toHaveBeenCalledOnce());
    const listener = vi.fn();
    const detach = appClient.onUpdaterEvent(listener);
    const downloaded = { ...idle, state: 'downloaded' as const, availableVersion: '2.0.0', downloaded: true };
    deliver(downloaded);
    resolve(idle);
    await pending;

    expect(queryClient.getQueryData(resourceKey('app', 'getUpdaterStatus'))).toEqual(downloaded);
    expect(listener).toHaveBeenCalledWith(downloaded);
    detach();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('preserves the internal legacy branch-cache regression without a production preload contract', async () => {
    const read = vi.fn().mockResolvedValue({ success: true, data: ['main', 'feature'] });
    vi.stubGlobal('window', { electronAPI: { github: { githubGetBranches: read } } });
    expect(await githubClient.getBranches('octocat', 'repo')).toEqual({ success: true, data: ['main', 'feature'] });
    expect(await githubClient.getBranches('octocat', 'repo')).toEqual({ success: true, data: ['main', 'feature'] });
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith('octocat', 'repo');
  });

  it('cannot reuse a legacy account through the neutral production hosting namespace', () => {
    vi.stubGlobal('window', { electronAPI: { hosting: { request: vi.fn() } } });
    expect(githubClient.isAvailable()).toBe(false);
  });

  it('adds local cache diagnostics without masking a main-process failure', async () => {
    const report = { success: true as const, data: { report: 'Main process diagnostics', generatedAt: 'now' } };
    const failure = { success: false as const, error: 'Diagnostics unavailable' };
    const read = vi.fn().mockResolvedValueOnce(report).mockResolvedValueOnce(failure);
    vi.stubGlobal('window', { electronAPI: { app: { getDiagnosticsReport: read } } });
    const result = await appClient.getDiagnosticsReport();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.report).toContain('Main process diagnostics');
    const metrics = JSON.parse(result.data.report.split('Renderer data cache\n')[1]);
    expect(metrics).toMatchObject({ hits: expect.any(Number), reads: expect.any(Number), durationMs: expect.any(Number), queueLength: 0 });
    expect(await appClient.getDiagnosticsReport()).toEqual(failure);
  });
});
