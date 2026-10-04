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
  it('clears repository-bound dialogs when resetting repository navigation', () => {
    const setters = {
      setConfirmDialog: vi.fn(),
      setInputDialog: vi.fn(),
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
    act(() => {
      root.unmount();
    });
  });
});
