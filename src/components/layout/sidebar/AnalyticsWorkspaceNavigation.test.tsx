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
import { useAnalyticsToolbarState, usePublishAnalyticsToolbar } from '@/components/repository-analytics/analyticsToolbarState';
import { normalizeRepoPathKey } from '@/utils/repoPath';

vi.mock('./UpdateNotification', () => ({ UpdateNotification: () => null }));
vi.mock('./RepositoryActivityRail', () => ({ RepositoryActivityRail: () => null }));
vi.mock('@/components/system-tools/SystemToolsWarning', () => ({ SystemToolsWarning: () => null }));
vi.mock('@/components/hosting/RemoteTransferHost', () => ({ RemoteTransferHost: () => null }));
vi.mock('@/components/repository-icon/useRepositoryIcon', () => ({ useRepositoryIcon: () => null }));

let host: HTMLDivElement, root: Root;
const setTab = vi.fn(),
  toggleSidebar = vi.fn(),
  switchRepo = vi.fn(),
  refresh = vi.fn(),
  cancel = vi.fn();
type ToolbarOptions = { repoPath?: string; running?: boolean; paused?: boolean };
function ToolbarOwner({ repoPath, running = false, paused = false }: ToolbarOptions & { repoPath: string }) {
  usePublishAnalyticsToolbar({ repoPath, savedAt: 1000, running, paused, failed: false, hasWarnings: false, reload: refresh, cancel, showCoverage: vi.fn() });
  return null;
}
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
async function render(repoPath: string | null = 'C:/Code/alpha', collapsed = false, toolbar: ToolbarOptions = {}) {
  await act(async () =>
    root.render(
      <I18nProvider language="en">
        <AppStateSlicesProvider value={state(repoPath)}>
          {repoPath && <ToolbarOwner {...toolbar} repoPath={toolbar.repoPath ?? repoPath} />}
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
  useAnalyticsToolbarState.setState({ current: null });
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
    expect(host.querySelectorAll('.analytics-sidebar-nav button')).toHaveLength(6);
    expect(host.querySelector('.activity-bar [title="Current repository"]')?.nextElementSibling).toBe(icon);
    expect(icon?.nextElementSibling?.getAttribute('title')).toBe('Local repositories');
    expect(host.querySelector('aside .analytics-filters')).toBeTruthy();
    expect(host.querySelectorAll('aside .analytics-filter-panel label')).toHaveLength(7);
    expect(current()).toBe('Overview');
    expect(host.querySelector('.topbar-repo-title')?.textContent).toBe('Statistics & analytics');
    expect(host.querySelector('.topbar-right')?.textContent).toContain('Updated');
    expect(host.querySelector('.topbar-right')?.textContent).toContain('Refresh');
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
    act(() => selectAnalyticsTab('D:/Code/beta', 'contributions'));
    expect(current()).toBe('Contributions');
    await render('c:\\Code\\alpha');
    expect(current()).toBe('Change hotspots');
    expect(host.querySelector('.analytics-sidebar-repository-path')?.textContent).toBe('c:\\Code\\alpha');
  });
  it('opens Contributions for a former line-attribution selection in the current session', async () => {
    useAnalyticsNavigation.setState({ sections: { [normalizeRepoPathKey('C:/Code/alpha')]: 'ownership' } });
    await render();
    expect(current()).toBe('Contributions');
    expect([...host.querySelectorAll('.analytics-sidebar-nav button')].map((node) => node.textContent)).not.toContain('Last changed lines');
  });
  it('shows the active repository without offering repository switching in analytics', async () => {
    await render();
    expect(host.querySelector('[aria-label="Active repository"]')).toBeNull();
    expect(host.querySelector('.analytics-sidebar-repository select')).toBeNull();
    expect(host.querySelector('.analytics-sidebar-repository strong')?.textContent).toBe('alpha');
    expect(switchRepo).not.toHaveBeenCalled();
    expect(setTab).not.toHaveBeenCalled();
    expect(host.querySelector('.analytics-sidebar-repository-path')?.textContent).toBe('C:/Code/alpha');
  });
  it('keeps update status and working refresh, cancel and resume controls in the main title row', async () => {
    await render();
    const topbar = host.querySelector('.topbar')!;
    expect(topbar.querySelector('.topbar-repo-title')?.textContent).toBe('Statistics & analytics');
    expect(topbar.querySelector('time')?.dateTime).toBe(new Date(1000).toISOString());
    await act(async () => topbar.querySelector<HTMLButtonElement>('.analytics-refresh-action')!.click());
    expect(refresh).toHaveBeenCalledOnce();
    await render('C:/Code/alpha', false, { running: true });
    expect(topbar.querySelector('.analytics-refresh-action')?.textContent).toBe('Cancel');
    await act(async () => topbar.querySelector<HTMLButtonElement>('.analytics-refresh-action')!.click());
    expect(cancel).toHaveBeenCalledOnce();
    await render('C:/Code/alpha', false, { paused: true });
    expect(topbar.querySelector('.analytics-refresh-action')?.textContent).toBe('Resume');
    await act(async () => topbar.querySelector<HTMLButtonElement>('.analytics-refresh-action')!.click());
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('rejects header controls from another repository and clears them when the dashboard unmounts', async () => {
    await render('D:/Code/beta', false, { repoPath: 'C:/Code/alpha' });
    expect(host.querySelector('.topbar time')).toBeNull();
    const button = host.querySelector<HTMLButtonElement>('.analytics-refresh-action')!;
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(refresh).not.toHaveBeenCalled();
    await render(null);
    expect(useAnalyticsToolbarState.getState().current).toBeNull();
    expect(host.querySelector('.analytics-topbar-actions')).toBeNull();
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
