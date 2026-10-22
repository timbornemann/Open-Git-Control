// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainView } from './MainView';
import { openStagingCommitArea } from '@/utils/layoutPreferences';
import { clearCommitShortcutRequest, useCommitShortcutRequest } from '@/components/staging-area/commitShortcutState';

const state = vi.hoisted(() => ({
  ui: {} as Record<string, any>,
  repo: {} as Record<string, any>,
  open: vi.fn(),
  defer: false,
  deferTab: false,
  proceed: undefined as (() => void) | undefined,
  listeners: new Set<() => void>(),
}));
vi.mock('@/contexts/AppStateContext', () => ({
  useUIStore: (select: (value: any) => unknown) =>
    useSyncExternalStore(
      (notify) => {
        state.listeners.add(notify);
        return () => state.listeners.delete(notify);
      },
      () => select(state.ui),
    ),
  useGitStore: (select: (value: any) => unknown) =>
    useSyncExternalStore(
      (notify) => {
        state.listeners.add(notify);
        return () => state.listeners.delete(notify);
      },
      () => select(state.repo),
    ),
  useWorkflowStore: (select: (value: any) => unknown) => select({}),
}));
vi.mock('@/hooks/useWorkingTreeSnapshot', () => ({ useWorkingTreeSnapshot: () => ({}) }));
vi.mock('./hooks/useMainViewPaneResizer', () => ({ useMainViewPaneResizer: () => ({ contentAreaRef: { current: null } }) }));
vi.mock('./hooks/useMainViewInspector', () => ({ useMainViewInspector: () => ({ handleStageCommitOpen: state.open }) }));
vi.mock('./main/MainPrimaryPane', () => ({ MainPrimaryPane: () => <div>Primary view</div> }));
vi.mock('./main/MainTopbar', () => ({ MainTopbar: () => null }));
vi.mock('./main/MainInspectorPane', () => ({
  MainInspectorPane: ({ directoryMode, onDirectoryModeChange }: { directoryMode: string; onDirectoryModeChange: (mode: string) => void }) => (
    <div data-testid="inspector">
      <span>{directoryMode}</span>
      <button onClick={() => onDirectoryModeChange('tree')}>Tree</button>
    </div>
  ),
}));

let host: HTMLDivElement, root: Root;
const render = () =>
  act(async () => {
    state.listeners.forEach((notify) => notify());
    root.render(<MainView />);
  });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearCommitShortcutRequest();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('innerWidth', 500);
  vi.stubGlobal('matchMedia', () => ({ matches: window.innerWidth <= 900, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  state.ui = { activeTab: 'settings', onCloseRunConfig: vi.fn(), onCloseRemoteConfig: vi.fn(), onCloseSecretScanAllowlist: vi.fn() };
  state.repo = { activeRepo: 'C:/repo' };
  state.defer = false;
  state.deferTab = false;
  state.proceed = undefined;
  state.open.mockReset().mockImplementation((onOpened?: () => void, beforeOpen?: () => void) => {
    const proceed = () => {
      beforeOpen?.();
      if (!state.deferTab) state.ui.activeTab = 'repo';
      onOpened?.();
    };
    if (state.defer) state.proceed = proceed;
    else proceed();
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  clearCommitShortcutRequest();
  vi.unstubAllGlobals();
});

describe('commit shortcut opens the repository workspace', () => {
  it('reveals staging from another view even in a narrow window and queues one repository-bound commit', async () => {
    await render();
    expect(host.querySelector('[data-testid="inspector"]')).toBeNull();
    await act(async () => openStagingCommitArea({ repoPath: 'C:/repo', submit: true }));
    expect(host.querySelector('[data-testid="inspector"]')?.textContent).toContain('staging');
    expect(useCommitShortcutRequest.getState().request?.repoPath).toBe('C:/repo');
  });
  it('switches a mounted working-directory tree back to staging without submitting ordinary open requests', async () => {
    state.ui.activeTab = 'repo';
    vi.stubGlobal('innerWidth', 1200);
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    expect(host.textContent).toContain('tree');
    await act(async () => openStagingCommitArea());
    expect(host.querySelector('[data-testid="inspector"]')?.textContent).toContain('staging');
    expect(useCommitShortcutRequest.getState().request).toBeNull();
  });
  it('waits for guarded navigation and drops commit requests when the repository changes', async () => {
    state.defer = true;
    await render();
    await act(async () => openStagingCommitArea({ repoPath: 'C:/repo', submit: true }));
    expect(useCommitShortcutRequest.getState().request).toBeNull();
    expect(state.ui.onCloseRunConfig).not.toHaveBeenCalled();
    await act(async () => state.proceed?.());
    expect(useCommitShortcutRequest.getState().request?.repoPath).toBe('C:/repo');
    state.repo.activeRepo = 'C:/other';
    await render();
    expect(useCommitShortcutRequest.getState().request).toBeNull();
    await act(async () => openStagingCommitArea({ repoPath: 'C:/repo', submit: true }));
    expect(useCommitShortcutRequest.getState().request).toBeNull();
  });
  it('cancels a pending submission when leaving staging before status has loaded', async () => {
    await render();
    await act(async () => openStagingCommitArea({ repoPath: 'C:/repo', submit: true }));
    expect(useCommitShortcutRequest.getState().request).not.toBeNull();
    state.ui.activeTab = 'planner';
    await render();
    expect(useCommitShortcutRequest.getState().request).toBeNull();
    await act(async () => openStagingCommitArea({ repoPath: 'C:/repo', submit: true }));
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    expect(useCommitShortcutRequest.getState().request).toBeNull();
  });
  it('keeps a request while the app context catches up with local staging navigation', async () => {
    vi.stubGlobal('innerWidth', 1200);
    state.ui.activeTab = 'repo';
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    state.ui.activeTab = 'settings';
    await render();
    state.deferTab = true;
    await act(async () => openStagingCommitArea({ repoPath: 'C:/repo', submit: true }));
    expect(useCommitShortcutRequest.getState().request?.repoPath).toBe('C:/repo');
    state.ui.activeTab = 'repo';
    await render();
    expect(host.querySelector('[data-testid="inspector"]')?.textContent).toContain('staging');
    expect(useCommitShortcutRequest.getState().request?.repoPath).toBe('C:/repo');
  });
  it('closes views that restore a return tab before navigating to the repository', async () => {
    state.ui.isReleaseCreatorOpen = true;
    state.ui.onCloseReleaseCreator = vi.fn(() => {
      state.ui.isReleaseCreatorOpen = false;
      state.ui.activeTab = 'planner';
    });
    await render();
    await act(async () => openStagingCommitArea({ repoPath: 'C:/repo', submit: true }));
    expect(state.ui.activeTab).toBe('repo');
    expect(host.querySelector('[data-testid="inspector"]')?.textContent).toContain('staging');
    expect(useCommitShortcutRequest.getState().request?.repoPath).toBe('C:/repo');
  });
});
