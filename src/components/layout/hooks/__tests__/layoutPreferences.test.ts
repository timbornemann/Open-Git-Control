import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMainViewPaneResizer } from '@/components/layout/hooks/useMainViewPaneResizer';
import { useInspectorPaneVisibility } from '@/components/layout/main/useInspectorPaneVisibility';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';

type LayoutHooks = {
  sidebar: ReturnType<typeof useResizableSidebar>;
  panes: ReturnType<typeof useMainViewPaneResizer>;
  inspector: ReturnType<typeof useInspectorPaneVisibility>;
};

type HookRender<T> = {
  readonly current: T;
  unmount: () => void;
};

const renderHook = <T>(useHook: () => T): HookRender<T> => {
  let current: T | undefined;
  const root: Root = createRoot(document.createElement('div'));
  const TestComponent = () => {
    current = useHook();
    return null;
  };

  act(() => root.render(createElement(TestComponent)));
  return {
    get current() {
      if (current === undefined) throw new Error('Hook did not render.');
      return current;
    },
    unmount: () => act(() => root.unmount()),
  };
};

const installMatchMedia = (targetWindow: Window): void => {
  Object.defineProperty(targetWindow, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => {
      const maxWidth = /max-width:\s*(\d+)px/.exec(query)?.[1];
      const matches = maxWidth ? targetWindow.innerWidth <= Number(maxWidth) : false;
      return {
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      };
    },
  });
};

const renderLayoutHooks = () =>
  renderHook<LayoutHooks>(() => ({
    sidebar: useResizableSidebar(),
    panes: useMainViewPaneResizer(),
    inspector: useInspectorPaneVisibility(),
  }));

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
  installMatchMedia(dom.window);
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('layout preferences', () => {
  it('uses the intended first-run defaults when storage entries are absent', () => {
    const hook = renderLayoutHooks();

    expect(hook.current.sidebar.sidebarWidth).toBe(260);
    expect(hook.current.sidebar.isSidebarCollapsed).toBe(false);
    expect(hook.current.panes.primaryPaneBasis).toBe('70.00%');
    expect(hook.current.inspector.isInspectorPaneVisible).toBe(true);

    hook.unmount();
  });

  it('resets sidebar, content split, inspector width and inspector visibility together', () => {
    window.localStorage.setItem('open-git-control.sidebar-width', '420');
    window.localStorage.setItem('open-git-control.sidebar-manually-collapsed', 'true');
    window.localStorage.setItem('open-git-control.content-pane-ratio', '0.42');
    window.localStorage.setItem('open-git-control.inspector-pane-width', '410');
    window.localStorage.setItem('open-git-control.inspector-manually-collapsed', 'true');
    const hook = renderLayoutHooks();

    expect(hook.current.sidebar.sidebarWidth).toBe(420);
    expect(hook.current.sidebar.isSidebarCollapsed).toBe(true);
    expect(hook.current.panes.primaryPaneBasis).toBe('42.00%');
    expect(hook.current.inspector.isInspectorPaneVisible).toBe(false);

    act(() => hook.current.sidebar.resetLayout());

    expect(hook.current.sidebar.sidebarWidth).toBe(260);
    expect(hook.current.sidebar.isSidebarCollapsed).toBe(false);
    expect(hook.current.panes.primaryPaneBasis).toBe('70.00%');
    expect(hook.current.inspector.isInspectorPaneVisible).toBe(true);
    expect(window.localStorage.getItem('open-git-control.inspector-pane-width')).toBeNull();
    expect(window.localStorage.getItem('open-git-control.sidebar-manually-collapsed')).toBeNull();
    expect(window.localStorage.getItem('open-git-control.inspector-manually-collapsed')).toBeNull();

    hook.unmount();
  });
});
