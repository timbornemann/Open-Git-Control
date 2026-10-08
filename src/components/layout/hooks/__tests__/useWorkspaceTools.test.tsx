// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceDomain } from '../useWorkspaceDomain';
import { appClient } from '@/services/appClient';
import { receiveSystemTools, useSystemTools } from '@/app/state/systemToolsStore';
import type { SystemToolState } from '@/shared/ipc/systemTools';

afterEach(() => {
  delete (window as Partial<Window>).electronAPI;
  vi.restoreAllMocks();
});
describe('Git availability and repository restoration', () => {
  it('keeps saved entries and selection during a slow/failed check and resumes after external installation', async () => {
    const stored = {
      repos: [
        { path: 'C:/repo-a', lastOpened: 2, pinned: true, createdAt: 1 },
        { path: 'C:/repo-b', lastOpened: 1, pinned: false, createdAt: 1 },
      ],
      activeRepo: 'C:/repo-b',
      sortBy: 'lastOpenedDesc' as const,
    };
    vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(appClient, 'getStoredRepos').mockResolvedValue(stored);
    const save = vi.spyOn(appClient, 'setStoredRepos').mockResolvedValue(true);
    vi.spyOn(appClient, 'resolveRepoPath').mockImplementation(async (path) => path);
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { app: { getSystemToolsStatus: vi.fn() } } });
    const tools = (state: SystemToolState) => ({
      platform: 'win32' as const,
      checkedAt: 1,
      tools: [{ id: 'git' as const, required: true, state, downloadUrl: '', instructionsUrl: '' }],
      installation: null,
    });
    receiveSystemTools(tools('checking'));
    const select = vi.spyOn(appClient, 'setRepoPath').mockResolvedValue('C:/repo-b');
    let workspace!: ReturnType<typeof useWorkspaceDomain>;
    const onNoActiveRepo = vi.fn();
    const Harness = () => {
      workspace = useWorkspaceDomain({
        triggerRefresh: vi.fn(),
        setConfirmDialog: vi.fn(),
        setInputDialog: vi.fn(),
        setGitActionToast: vi.fn(),
        onRepoActivated: vi.fn(),
        onNoActiveRepo,
        language: 'en',
      });
      return null;
    };
    const root = createRoot(document.createElement('div'));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => root.render(createElement(Harness)));
    expect(workspace.openRepos).toEqual(['C:/repo-a', 'C:/repo-b']);
    expect(select).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await act(async () => receiveSystemTools(tools('missing')));
    expect(workspace.openRepos).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
    await act(async () => expect(await workspace.handleSwitchRepo('C:/repo-a')).toBe(false));
    expect(useSystemTools.getState().dialogOpen).toBe(true);
    await act(async () => receiveSystemTools(tools('available')));
    expect(workspace.activeRepo).toBe('C:/repo-b');
    expect(select).toHaveBeenCalledExactlyOnceWith('C:/repo-b');
    expect(workspace.repoMeta['C:/repo-a'].pinned).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ activeRepo: 'C:/repo-b' }));
    act(() => root.unmount());
  });
});
