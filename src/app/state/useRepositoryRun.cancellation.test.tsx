// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resourceKey } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import type { IpcResult } from '@/types/ipc';
import { createEmptyRepositoryRunConfig, type RepositoryRunConfigStateDto } from '@/types/repositoryRun';
import { useRepositoryRun } from './useRepositoryRun';

const config = (repo: string, label: string): RepositoryRunConfigStateDto => {
  const value = createEmptyRepositoryRunConfig();
  value.actions.run.steps = [{ id: 'run', label, parser: 'none', windows: { shell: 'cmd', command: 'npm run dev' } }];
  return {
    exists: true,
    config: value,
    configPath: `${repo}/.Open-Git-Control/run.json`,
    availableActions: { run: true, test: false, format: false, start: false, build: false },
    templates: [],
  };
};

const pendingConfig = (repo: string) => {
  let resolve!: (value: IpcResult<RepositoryRunConfigStateDto>) => void;
  const promise = new Promise<IpcResult<RepositoryRunConfigStateDto>>((done) => {
    resolve = done;
  });
  return { repo, promise, resolve };
};

describe('run configuration cancellation through the real resource cache', () => {
  const repo = 'C:/repo';
  let host: HTMLDivElement;
  let root: Root;
  let previousApi: PropertyDescriptor | undefined;
  let current: ReturnType<typeof useRepositoryRun>;
  let requests: ReturnType<typeof pendingConfig>[];
  let configListeners: Set<(repoPath: string) => void>;
  const getConfig = vi.fn<(repoPath: string) => Promise<IpcResult<RepositoryRunConfigStateDto>>>();
  const triggerRefresh = vi.fn();

  const Harness = ({ activeRepo }: { activeRepo: string }) => {
    current = useRepositoryRun({ activeRepo, triggerRefresh });
    return null;
  };
  const render = async (activeRepo = repo, strict = false) => {
    await act(async () =>
      root.render(
        strict ? (
          <StrictMode>
            <Harness activeRepo={activeRepo} />
          </StrictMode>
        ) : (
          <Harness activeRepo={activeRepo} />
        ),
      ),
    );
  };
  const changed = async (repoPath = repo) => {
    await act(async () => configListeners.forEach((listener) => listener(repoPath)));
  };
  const reply = async (index: number, value: RepositoryRunConfigStateDto) => {
    await act(async () => requests[index].resolve({ success: true, data: value }));
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    requests = [];
    configListeners = new Set();
    getConfig.mockReset().mockImplementation((repoPath) => {
      const request = pendingConfig(repoPath);
      requests.push(request);
      return request.promise;
    });
    const runs = {
      getRepositoryRunConfig: getConfig,
      getRepositoryRunState: vi.fn().mockResolvedValue({ success: true, data: null }),
      watchRepositoryRunConfig: vi.fn().mockResolvedValue({ success: true, data: true }),
      onRepositoryRunConfigChanged: (listener: (repoPath: string) => void) => {
        configListeners.add(listener);
        return () => {
          configListeners.delete(listener);
        };
      },
      onRepositoryRunEvent: vi.fn().mockReturnValue(() => {}),
    } satisfies Pick<
      ElectronAPI['runs'],
      'getRepositoryRunConfig' | 'getRepositoryRunState' | 'watchRepositoryRunConfig' | 'onRepositoryRunConfigChanged' | 'onRepositoryRunEvent'
    >;
    previousApi = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { runs } });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      for (const request of requests) request.resolve({ success: true, data: config(request.repo, 'late response') });
    });
    host.remove();
    if (previousApi) Object.defineProperty(window, 'electronAPI', previousApi);
    else delete (window as { electronAPI?: ElectronAPI }).electronAPI;
  });

  it.each([false, true])('replaces a cancelled cold read after an IPC change without an unhandled rejection (Strict Mode: %s)', async (strict) => {
    await render(repo, strict);
    expect(getConfig).toHaveBeenCalledWith(repo);
    // Strict Mode can start and cancel an additional read before remounting.
    const initialRequests = requests.length;
    expect(current.activeRunConfig).toBeNull();

    await changed();
    expect(requests).toHaveLength(initialRequests + 1);
    const latest = config(repo, 'updated command');
    await reply(initialRequests, latest);
    expect(current.activeRunConfig).toEqual(latest);

    for (let index = initialRequests - 1; index >= 0; index--) await reply(index, config(repo, 'outdated command'));
    expect(current.activeRunConfig).toEqual(latest);
    expect(queryClient.getQueryData(resourceKey('runs', 'getConfig', [repo]))).toEqual({ success: true, data: latest });
    expect(getConfig).toHaveBeenCalledTimes(initialRequests + 1);
  });

  it('accepts the newest configuration when several IPC changes supersede pending reads', async () => {
    await render();
    await changed();
    await changed();
    expect(requests).toHaveLength(3);
    const latest = config(repo, 'newest command');
    await reply(2, latest);
    await reply(1, config(repo, 'intermediate command'));
    await reply(0, config(repo, 'original command'));
    expect(current.activeRunConfig).toEqual(latest);
    expect(getConfig).toHaveBeenCalledTimes(3);
  });

  it('discards a pending cold read after switching repositories', async () => {
    await render();
    const nextRepo = 'C:/other-repo';
    await render(nextRepo);
    expect(requests.map((request) => request.repo)).toEqual([repo, nextRepo]);
    const latest = config(nextRepo, 'other repository command');
    await reply(1, latest);
    await reply(0, config(repo, 'previous repository command'));
    expect(current.activeRunConfig).toEqual(latest);
  });

  it.each([new Error('IPC transport failed'), new Error('CancelledError')])(
    'still rejects unexpected errors during an explicitly awaited refresh (%s)',
    async (error) => {
      await render();
      const initial = config(repo, 'existing command');
      await reply(0, initial);
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: resourceKey('runs', 'getConfig', [repo]), exact: true, refetchType: 'none' });
        getConfig.mockRejectedValueOnce(error);
        await expect(current.refreshRunConfig()).rejects.toBe(error);
      });
      expect(current.activeRunConfig).toEqual(initial);
    },
  );
});
