import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSidebarCollapseState } from './useSidebarCollapseState';
import { SIDEBAR_COLLAPSE_STORAGE_KEY } from './appStateShared';
import { notifyRepositoryLocationChanged, onRepositoryLocationChanged } from '@/services/repositoryLocationBus';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  localStorage.clear();
  window.close();
  vi.unstubAllGlobals();
});
describe('sidebar preferences after moving a repository', () => {
  it('moves the saved collapse settings and persists them under the new path', async () => {
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify({ 'C:/old/demo': { branchPanelCollapsed: true, tagPanelCollapsed: true } }));
    const root = createRoot(document.createElement('div'));
    let state!: ReturnType<typeof useSidebarCollapseState>;
    const Harness = ({ active }: { active: string }) => {
      state = useSidebarCollapseState({ activeRepo: active });
      return null;
    };
    await act(async () => {
      root.render(createElement(Harness, { active: 'C:/old/demo' }));
    });
    expect(state.activeSidebarCollapseState.branchPanelCollapsed).toBe(true);
    await act(async () => {
      notifyRepositoryLocationChanged({ oldPath: 'C:/old/demo', newPath: 'C:/new/demo' });
      root.render(createElement(Harness, { active: 'C:/new/demo' }));
    });
    expect(state.activeSidebarCollapseState.branchPanelCollapsed).toBe(true);
    const saved = JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)!);
    expect(saved['C:/new/demo']).toMatchObject({ tagPanelCollapsed: true });
    expect(saved['C:/old/demo']).toBeUndefined();
    await act(async () => {
      root.unmount();
    });
    // Subscribers are removed on unmount; unrelated relocation events stay harmless.
    notifyRepositoryLocationChanged({ oldPath: 'C:/another', newPath: 'C:/another-new' });
  });
  it('does not create settings for an unrelated entry and supports unsubscribing', async () => {
    const root = createRoot(document.createElement('div'));
    await act(async () => {
      root.render(
        createElement(() => {
          useSidebarCollapseState({ activeRepo: 'C:/repo' });
          return null;
        }),
      );
    });
    await act(async () => {
      notifyRepositoryLocationChanged({ oldPath: 'C:/unknown', newPath: 'C:/moved' });
    });
    expect(localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)).toBe('{}');
    let notified = 0;
    const removeFailing = onRepositoryLocationChanged(() => {
      throw new Error('Unmounting view');
    });
    const unsubscribe = onRepositoryLocationChanged(() => {
      notified++;
    });
    notifyRepositoryLocationChanged({ oldPath: 'C:/repo', newPath: 'C:/repo' });
    unsubscribe();
    notifyRepositoryLocationChanged({ oldPath: 'C:/repo', newPath: 'C:/new' });
    expect(notified).toBe(1);
    removeFailing();
    await act(async () => {
      root.unmount();
    });
  });
});
