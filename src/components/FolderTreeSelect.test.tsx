// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderTreeSelect } from './FolderTreeSelect';

let root: Root | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('FolderTreeSelect', () => {
  it('loads and reveals nested folders only when their parent is expanded', async () => {
    const loadChildren = vi.fn(async (parentPath: string) => {
      if (parentPath === 'node_modules') return [{ value: 'node_modules/package-a', label: 'package-a' }];
      if (parentPath === 'node_modules/package-a') return [{ value: 'node_modules/package-a/lib', label: 'lib' }];
      return [];
    });
    const onChange = vi.fn();
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(FolderTreeSelect, {
          value: '',
          options: [
            { value: '', label: 'Repository root' },
            { value: 'node_modules', label: 'node_modules' },
            { value: 'src', label: 'src' },
          ],
          loadChildren,
          onChange,
        }),
      ),
    );

    expect(container.textContent).toContain('node_modules');
    expect(container.textContent).toContain('src');
    expect(container.textContent).not.toContain('package-a');

    const expandNodeModules = container.querySelector<HTMLButtonElement>('button[aria-label="Expand node_modules"]');
    if (!expandNodeModules) throw new Error('Missing node_modules toggle.');
    await act(async () => {
      expandNodeModules.click();
      await Promise.resolve();
    });
    expect(loadChildren).toHaveBeenCalledWith('node_modules');
    expect(container.textContent).toContain('package-a');
    expect(container.textContent).not.toContain('lib');

    const expandPackage = container.querySelector<HTMLButtonElement>('button[aria-label="Expand package-a"]');
    if (!expandPackage) throw new Error('Missing package toggle.');
    await act(async () => {
      expandPackage.click();
      await Promise.resolve();
    });
    expect(loadChildren).toHaveBeenCalledWith('node_modules/package-a');
    expect(container.textContent).toContain('lib');

    const selectLib = container.querySelector<HTMLButtonElement>('button[title="node_modules/package-a/lib"]');
    if (!selectLib) throw new Error('Missing nested folder option.');
    act(() => selectLib.click());
    expect(onChange).toHaveBeenCalledWith('node_modules/package-a/lib');
  });
});
