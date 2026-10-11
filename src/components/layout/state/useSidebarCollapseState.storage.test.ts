import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSidebarCollapseState } from './useSidebarCollapseState';
import { SIDEBAR_COLLAPSE_STORAGE_KEY } from './appStateShared';
import type { RepositoryUiPreferences } from '@/shared/ipc/repositoryUiPreferences';

const api = vi.hoisted(() => ({ uiPreferences: vi.fn(), updateUiPreferences: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/services/storageClient', () => ({ storageClient: { ...api, hasUiPreferences: () => true, isAvailable: () => true } }));

describe('shared desktop repository UI preferences', () => {
  let root: Root, state: ReturnType<typeof useSidebarCollapseState>;
  const Harness = ({ active }: { active: string }) => {
    state = useSidebarCollapseState({ activeRepo: active });
    return null;
  };
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.createElement('div'));
    api.uiPreferences.mockResolvedValue({ success: true, data: {} });
    api.subscribe.mockReturnValue(() => {});
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    window.close();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it('migrates supported legacy preferences and removes the legacy copy only after success', async () => {
    const legacy = { 'C:/repo': { branchPanelCollapsed: true, tagPanelCollapsed: true } };
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify(legacy));
    api.uiPreferences.mockResolvedValue({ success: true, data: legacy });
    await act(async () => root.render(createElement(Harness, { active: 'C:/repo' })));
    expect(api.uiPreferences).toHaveBeenCalledWith(legacy);
    expect(state.activeSidebarCollapseState.tagPanelCollapsed).toBe(true);
    expect(localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)).toBeNull();
  });
  it('preserves the legacy copy when the main-process migration fails', async () => {
    const raw = JSON.stringify({ 'C:/repo': { branchPanelCollapsed: true } });
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, raw);
    api.uiPreferences.mockResolvedValue({ success: false, error: 'Unsupported storage' });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await act(async () => root.render(createElement(Harness, { active: 'C:/repo' })));
    expect(localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)).toBe(raw);
    warning.mockRestore();
  });
  it('sends only the changed preference and ignores late responses from older edits', async () => {
    const initial: Record<string, RepositoryUiPreferences> = { 'C:/repo': { branchPanelCollapsed: true } };
    api.uiPreferences.mockResolvedValue({ success: true, data: initial });
    const pending: ((value: unknown) => void)[] = [];
    api.updateUiPreferences.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    await act(async () => root.render(createElement(Harness, { active: 'C:/repo/' })));
    await act(async () => state.toggleTagPanelCollapsed());
    expect(state.activeSidebarCollapseState.branchPanelCollapsed).toBe(true);
    expect(api.updateUiPreferences).toHaveBeenLastCalledWith({ repoPath: 'C:/repo/', patch: { tagPanelCollapsed: true } });
    await act(async () => state.toggleRemotePanelCollapsed());
    await act(async () =>
      pending[1]({ success: true, data: { 'C:/repo': { branchPanelCollapsed: true, tagPanelCollapsed: true, remotePanelCollapsed: true } } }),
    );
    await act(async () => pending[0]({ success: true, data: initial }));
    expect(state.activeSidebarCollapseState.remotePanelCollapsed).toBe(true);
    expect(state.activeSidebarCollapseState.tagPanelCollapsed).toBe(true);
  });
});
