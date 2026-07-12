// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import type { AppTabId } from '@/app/state/contracts';
import {
  requestWorkingDirectoryNavigation,
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from '@/components/working-directory/workingDirectoryNavigationGuard';
import { useMainViewTimeline } from './useMainViewTimeline';

afterEach(() => {
  resetWorkingDirectoryNavigationGuardForTests();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useMainViewTimeline dirty-editor navigation', () => {
  it('waits for navigation confirmation before replacing the file viewer', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getFileTimelineData').mockResolvedValue({ success: true, data: [] });
    const setRepoTab = vi.fn();
    const setActiveTab = vi.fn((tab: AppTabId) => requestWorkingDirectoryNavigation({ kind: 'view', label: tab }, () => setRepoTab(tab)));
    const closeRelease = vi.fn();
    let current: ReturnType<typeof useMainViewTimeline> | null = null;
    const Harness = () => {
      current = useMainViewTimeline({ activeRepo: 'C:/repo', setActiveTab, onCloseReleaseCreator: closeRelease, t: (key) => key });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    act(() => root.render(createElement(Harness)));
    let proceed: (() => void) | undefined;
    const guard = vi.fn((_target: unknown, next: () => void) => (proceed = next));
    setActiveWorkingDirectoryNavigationGuard(guard);

    let open!: Promise<void>;
    await act(async () => {
      open = current!.openTimeline();
      await Promise.resolve();
    });
    expect(current!.showTimeline).toBe(false);
    expect(setRepoTab).not.toHaveBeenCalled();

    await act(async () => {
      proceed?.();
      await open;
    });
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(setRepoTab).toHaveBeenCalledWith('repo');
    expect(guard).toHaveBeenCalledTimes(1);
    expect(current!.showTimeline).toBe(true);
    act(() => root.unmount());
  });
});
