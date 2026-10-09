// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateSlicesProvider, type AppStateSlicesValue } from '@/contexts/AppStateContext';
import { I18nProvider } from '@/i18n';
import { MainTopbar } from '../main/MainTopbar';
import { SidebarActivityBar } from './SidebarActivityBar';
import { SidebarHeaderContainer } from './containers/SidebarHeaderContainer';
import { SidebarContentRouter } from './containers/SidebarContentRouter';
import { selectAnalyticsTab, useAnalyticsNavigation } from '@/components/repository-analytics/analyticsNavigationState';

vi.mock('./UpdateNotification', () => ({ UpdateNotification: () => null }));
vi.mock('./RepositoryActivityRail', () => ({ RepositoryActivityRail: () => null }));
vi.mock('@/components/system-tools/SystemToolsWarning', () => ({ SystemToolsWarning: () => null }));
vi.mock('@/components/hosting/RemoteTransferHost', () => ({ RemoteTransferHost: () => null }));
vi.mock('@/components/repository-icon/useRepositoryIcon', () => ({ useRepositoryIcon: () => null }));

let host: HTMLDivElement, root: Root;
const setTab = vi.fn(),
  toggleSidebar = vi.fn(),
  switchRepo = vi.fn();
function state(repoPath: string | null): AppStateSlicesValue {
  return {
    repository: {
      activeRepo: repoPath,
      openRepos: ['C:/Code/alpha', 'D:/Code/beta'],
      onSwitchRepo: switchRepo,
      currentBranch: 'main',
      remoteSync: { isFetching: false },
      remoteStatus: { title: 'Up to date' },
    },
    ui: { activeTab: 'analytics', setActiveTab: setTab },
    settings: {},
    workflow: {},
  } as unknown as AppStateSlicesValue;
}
async function render(repoPath: string | null = 'C:/Code/alpha', collapsed = false) {
  await act(async () =>
    root.render(
      <I18nProvider language="en">
        <AppStateSlicesProvider value={state(repoPath)}>
          <SidebarActivityBar activeTab="analytics" setActiveTab={setTab} isSidebarCollapsed={collapsed} onToggleSidebar={toggleSidebar} />
          <aside>
            <SidebarHeaderContainer />
            <SidebarContentRouter />
          </aside>
          <MainTopbar
            canShowInspectorPane={false}
            showInspectorPane={false}
            onToggleInspectorPane={vi.fn()}
            onStageCommit={vi.fn()}
            onOpenTimeline={vi.fn()}
            isTimelineLoading={false}
          />
        </AppStateSlicesProvider>
      </I18nProvider>,
    ),
  );
}
function current() {
  return host.querySelector('.analytics-sidebar-nav [aria-current="page"]')?.textContent;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  useAnalyticsNavigation.setState({ sections: {} });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe('standalone analytics navigation', () => {
  it('uses a dedicated activity icon, sidebar and compact topbar without Git actions', async () => {
    await render();
    const icon = host.querySelector('.activity-bar button.active');
    expect(icon?.getAttribute('aria-label')).toBe('Statistics & analytics');
    expect(icon?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.sidebar-header')?.textContent).toBe('Statistics & analytics');
    expect(host.querySelector('.analytics-sidebar-repository-path')?.textContent).toBe('C:/Code/alpha');
    expect(host.querySelectorAll('.analytics-sidebar-nav button')).toHaveLength(8);
    expect(host.querySelector('aside .analytics-filters')).toBeTruthy();
    expect(host.querySelectorAll('aside .analytics-filter-panel label')).toHaveLength(7);
    expect(current()).toBe('Overview');
    expect(host.querySelector('.topbar-repo-title')?.textContent).toBe('Statistics & analytics');
    expect(host.querySelector('.topbar-right')?.textContent).toBe('');
    expect(host.querySelector('.topbar-chip')).toBeNull();
    expect(host.textContent).not.toContain('Back to repository');
  });
  it('keeps each repository section and follows report drilldowns in the sidebar', async () => {
    await render();
    const hotspots = [...host.querySelectorAll<HTMLButtonElement>('.analytics-sidebar-nav button')].find((node) => node.textContent === 'Change hotspots')!;
    await act(async () => hotspots.click());
    expect(current()).toBe('Change hotspots');
    await render('D:/Code/beta');
    expect(current()).toBe('Overview');
    act(() => selectAnalyticsTab('D:/Code/beta', 'commits'));
    expect(current()).toBe('Commits');
    await render('c:\\Code\\alpha');
    expect(current()).toBe('Change hotspots');
    expect(host.querySelector('.analytics-sidebar-repository-path')?.textContent).toBe('c:\\Code\\alpha');
  });
  it('delegates repository selection to the normal activation workflow and retains the current repository until activation completes', async () => {
    await render();
    const picker = host.querySelector<HTMLSelectElement>('[aria-label="Active repository"]')!;
    await act(async () => {
      picker.value = 'D:/Code/beta';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(switchRepo).toHaveBeenCalledWith('D:/Code/beta');
    expect(setTab).not.toHaveBeenCalled();
    expect(picker.value).toBe('C:/Code/alpha');
    expect(host.querySelector('.analytics-sidebar-repository-path')?.textContent).toBe('C:/Code/alpha');
  });
  it('opens the repository list and disables report navigation without an active repository', async () => {
    await render(null);
    expect([...host.querySelectorAll<HTMLButtonElement>('.analytics-sidebar-nav button')].every((button) => button.disabled)).toBe(true);
    const choose = [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent?.trim() === 'Choose repository')!;
    await act(async () => choose.click());
    expect(setTab).toHaveBeenCalledWith('localRepos');
  });
  it('toggles its sidebar when the active analytics icon is clicked', async () => {
    await render('C:/Code/alpha', true);
    const icon = host.querySelector<HTMLButtonElement>('.activity-bar button.active')!;
    await act(async () => icon.click());
    expect(toggleSidebar).toHaveBeenCalledOnce();
    expect(setTab).not.toHaveBeenCalled();
  });
  it('activates analytics and reveals a collapsed sidebar from another main tab', async () => {
    await act(async () =>
      root.render(
        <I18nProvider language="en">
          <SidebarActivityBar activeTab="repo" setActiveTab={setTab} isSidebarCollapsed onToggleSidebar={toggleSidebar} />
        </I18nProvider>,
      ),
    );
    const icon = [...host.querySelectorAll<HTMLButtonElement>('.activity-bar button')].find(
      (button) => button.getAttribute('aria-label') === 'Statistics & analytics',
    )!;
    await act(async () => icon.click());
    expect(setTab).toHaveBeenCalledWith('analytics');
    expect(toggleSidebar).toHaveBeenCalledOnce();
  });
});
