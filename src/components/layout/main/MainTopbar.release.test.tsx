// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AppStateSlicesProvider, type AppStateSlicesValue } from '@/contexts/AppStateContext';
import { I18nProvider } from '@/i18n';
import { MainTopbar } from './MainTopbar';
import { useHostingState } from '@/components/hosting/hostingState';

vi.mock('@/components/hosting/RemoteTransferHost', () => ({ RemoteTransferHost: () => null }));
describe('local topbar release entry', () => {
  it('opens the repository creator instead of changing the hosting selection or release list', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const open = vi.fn();
    const setTab = vi.fn();
    useHostingState.setState({ selected: null, section: 'repositories' });
    const state = {
      settings: { settings: { language: 'en' } },
      repository: {
        activeRepo: 'C:/repo',
        currentBranch: 'main',
        branches: [],
        tags: [],
        remoteSync: { isFetching: false },
        remoteStatus: { title: 'Up to date' },
      },
      workflow: { isGitActionRunning: false, repositoryRun: null, activeRunConfig: null },
      ui: {
        activeTab: 'repo',
        setActiveTab: setTab,
        onOpenReleaseCreator: open,
        onCloseRunConfig: vi.fn(),
        onCloseRemoteConfig: vi.fn(),
        onOpenRemoteConfig: vi.fn(),
      },
    } as unknown as AppStateSlicesValue;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(
            I18nProvider,
            { language: 'en', children: null },
            createElement(
              AppStateSlicesProvider,
              { value: state, children: null },
              createElement(MainTopbar, {
                canShowInspectorPane: false,
                showInspectorPane: false,
                onToggleInspectorPane: vi.fn(),
                onStageCommit: vi.fn(),
                onOpenTimeline: vi.fn(),
                isTimelineLoading: false,
              }),
            ),
          ),
        ),
      );
      const button = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Release');
      expect(button).toBeTruthy();
      await act(async () => button!.click());
      expect(open).toHaveBeenCalledWith();
      expect(setTab).not.toHaveBeenCalled();
      expect(useHostingState.getState()).toMatchObject({ selected: null, section: 'repositories' });
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
