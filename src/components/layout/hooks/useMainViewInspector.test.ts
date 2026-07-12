import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveWorkingDirectoryFilePath, useMainViewInspector } from './useMainViewInspector';

type Inspector = ReturnType<typeof useMainViewInspector>;

const renderInspector = (initialRepo: string | null) => {
  let current: Inspector | null = null;
  const root: Root = createRoot(document.createElement('div'));
  const setSelectedCommit = vi.fn();
  const Harness = ({ activeRepo }: { activeRepo: string | null }) => {
    current = useMainViewInspector({
      activeRepo,
      setSelectedCommit,
      onOpenRepoWorkspace: vi.fn(),
      onCloseReleaseCreator: vi.fn(),
    });
    return null;
  };
  const render = (activeRepo: string | null) => {
    act(() => root.render(createElement(Harness, { activeRepo })));
  };

  render(initialRepo);
  return {
    get current() {
      if (!current) throw new Error('Inspector hook did not render.');
      return current;
    },
    rerender: render,
    unmount: () => act(() => root.unmount()),
  };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useMainViewInspector working-directory viewer binding', () => {
  it('hides a working-directory file immediately when it belongs to another repository', () => {
    expect(getActiveWorkingDirectoryFilePath({ path: 'src/index.ts', repoPath: 'C:/repositories/a' }, 'C:/repositories/b')).toBeNull();
  });

  it('does not expose a file selected in repository A after switching to repository B', () => {
    const hook = renderInspector('C:/repositories/a');

    act(() => hook.current.handleOpenWorkingDirectoryFile('src/index.ts'));
    expect(hook.current.workingDirectoryFilePath).toBe('src/index.ts');

    hook.rerender('C:/repositories/b');
    expect(hook.current.workingDirectoryFilePath).toBeNull();
    hook.unmount();
  });
});
