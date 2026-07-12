// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositoryRunClient } from '@/services/repositoryRunClient';
import { useRepositoryRun } from './useRepositoryRun';

describe('useRepositoryRun configuration binding', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(repositoryRunClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(repositoryRunClient, 'getState').mockResolvedValue({ success: true, data: null } as any);
    vi.spyOn(repositoryRunClient, 'onEvent').mockReturnValue(vi.fn());
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('clears the old configuration and ignores a late response after switching repositories', async () => {
    let resolveFirstConfig: ((value: any) => void) | undefined;
    vi.spyOn(repositoryRunClient, 'getConfig').mockImplementation((repoPath) =>
      repoPath === 'C:/repo-a'
        ? new Promise((resolve) => {
            resolveFirstConfig = resolve;
          })
        : new Promise<void>(() => {}),
    );
    let current: ReturnType<typeof useRepositoryRun> | null = null;
    const Harness = ({ activeRepo }: { activeRepo: string | null }) => {
      current = useRepositoryRun({ activeRepo, triggerRefresh: vi.fn() });
      return null;
    };

    await act(async () => root.render(createElement(Harness, { activeRepo: 'C:/repo-a' })));
    await act(async () => root.render(createElement(Harness, { activeRepo: 'C:/repo-b' })));
    expect(current?.activeRunConfig).toBeNull();

    await act(async () => resolveFirstConfig?.({ success: true, data: { configPath: 'C:/repo-a/.ogc.json' } }));

    expect(current?.activeRunConfig).toBeNull();
  });
});
