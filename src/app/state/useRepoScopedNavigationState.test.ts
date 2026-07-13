import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepoScopedNavigationState } from './useRepoScopedNavigationState';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRepoScopedNavigationState', () => {
  it('clears repository-bound dialogs, PR drafts, and release drafts together', () => {
    const setters = {
      setConfirmDialog: vi.fn(),
      setInputDialog: vi.fn(),
      setShowCreatePR: vi.fn(),
      setNewPRTitle: vi.fn(),
      setNewPRBody: vi.fn(),
      setNewPRHead: vi.fn(),
      setNewPRBase: vi.fn(),
      setShowReleaseCreator: vi.fn(),
      setReleaseFormState: vi.fn(),
      setReleaseSubmitting: vi.fn(),
      setReleaseError: vi.fn(),
      setReleaseSuccess: vi.fn(),
      setReleaseContextLoading: vi.fn(),
      setReleaseContext: vi.fn(),
      setReleaseContextError: vi.fn(),
      setReleaseNotesGenerating: vi.fn(),
    };

    let hook: ReturnType<typeof useRepoScopedNavigationState> | null = null;
    const container = document.createElement('div');
    const root = createRoot(container);

    const TestComponent = () => {
      hook = useRepoScopedNavigationState(setters);
      return null;
    };

    act(() => {
      root.render(createElement(TestComponent));
    });

    act(() => {
      if (!hook) throw new Error('Hook did not render.');
      hook.resetRepoScopedUi();
    });

    expect(setters.setConfirmDialog).toHaveBeenCalledWith(null);
    expect(setters.setInputDialog).toHaveBeenCalledWith(null);
    expect(setters.setShowCreatePR).toHaveBeenCalledWith(false);
    expect(setters.setNewPRTitle).toHaveBeenCalledWith('');
    expect(setters.setNewPRBody).toHaveBeenCalledWith('');
    expect(setters.setNewPRHead).toHaveBeenCalledWith('');
    expect(setters.setNewPRBase).toHaveBeenCalledWith('main');
    expect(setters.setShowReleaseCreator).toHaveBeenCalledWith(false);
    expect(setters.setReleaseFormState).toHaveBeenCalledWith({
      owner: '',
      repo: '',
      tagName: '',
      targetCommitish: '',
      releaseName: '',
      body: '',
      draft: false,
      prerelease: false,
    });
    expect(setters.setReleaseSubmitting).toHaveBeenCalledWith(false);
    expect(setters.setReleaseError).toHaveBeenCalledWith(null);
    expect(setters.setReleaseSuccess).toHaveBeenCalledWith(null);
    expect(setters.setReleaseContextLoading).toHaveBeenCalledWith(false);
    expect(setters.setReleaseContext).toHaveBeenCalledWith(null);
    expect(setters.setReleaseContextError).toHaveBeenCalledWith(null);
    expect(setters.setReleaseNotesGenerating).toHaveBeenCalledWith(false);

    act(() => {
      root.unmount();
    });
  });
});
