// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { StagingFileSections } from './StagingFileSections';
import type { useFileOperations } from './useFileOperations';

describe('StagingFileSections file previews', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  type ListOverrides = Partial<Omit<ComponentProps<typeof StagingFileSections>, 'fileOps' | 'onSelectFileInspect'>>;
  const render = (lfs?: ReturnType<typeof useFileOperations>['lfs'], withInspector = true, overrides: ListOverrides = {}) => {
    const actions = {
      isMutating: false,
      searchQuery: '',
      showDiff: vi.fn(),
      stageFile: vi.fn(),
      unstageFile: vi.fn(),
      deleteUntracked: vi.fn(),
      openFileContextMenu: vi.fn(),
      stagedStats: { files: 1, additions: 1, deletions: 0 },
      unstagedStats: { files: 1, additions: 1, deletions: 1 },
      lfs,
    };
    const inspect = vi.fn();
    act(() => {
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(StagingFileSections, {
            visibleStaged: [{ path: 'staged.txt', x: 'A', y: ' ' }],
            visibleUnstaged: [{ path: 'modified.txt', x: ' ', y: 'M' }],
            visibleUntracked: [{ path: 'new/file.txt', x: '?', y: '?' }],
            fileOps: actions as unknown as ReturnType<typeof useFileOperations>,
            onSelectFileInspect: withInspector ? inspect : undefined,
            ...overrides,
          }),
        }),
      );
    });
    return { actions, inspect };
  };

  it.each([
    ['staged.txt', 'staged'],
    ['modified.txt', 'unstaged'],
    ['new/file.txt', 'unstaged'],
  ] as const)('opens %s through one inspector navigation without staging', (filePath, source) => {
    const { actions, inspect } = render();
    const row = host.querySelector(`[title="${filePath}"]`)!.closest('.staging-file-row')!;
    act(() => row.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(inspect).toHaveBeenCalledExactlyOnceWith(filePath, source);
    expect(actions.showDiff).not.toHaveBeenCalled();
    expect(actions.stageFile).not.toHaveBeenCalled();
    expect(actions.unstageFile).not.toHaveBeenCalled();
    expect(actions.deleteUntracked).not.toHaveBeenCalled();
  });

  it('opens files and their context actions from the keyboard without staging them', () => {
    const { actions, inspect } = render();
    const row = host.querySelector('[title="new/file.txt"]')!.closest('.staging-file-row')!;
    act(() => row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(inspect).toHaveBeenCalledWith('new/file.txt', 'unstaged');
    act(() => row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })));
    expect(actions.openFileContextMenu).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: 'new/file.txt' }), 'untracked');
    expect(actions.stageFile).not.toHaveBeenCalled();
  });

  it('shows a focusable recommendation only for an eligible unconfigured file and keeps the viewer available', () => {
    const lfs = {
      stateFor: (filePath: string) => (filePath === 'new/file.txt' ? { recommendation: 'asset' } : { configured: true }),
      recommendationTitle: () => 'Git LFS recommended: large asset file (18 MiB). Convert through the context menu.',
    } as unknown as ReturnType<typeof useFileOperations>['lfs'];
    const { actions, inspect } = render(lfs);
    const marker = host.querySelector<HTMLElement>('.staging-lfs-recommendation')!;
    expect(host.querySelectorAll('.staging-lfs-recommendation')).toHaveLength(1);
    expect(marker.tabIndex).toBe(0);
    expect(marker.title).toContain('18 MiB');
    expect(marker.getAttribute('aria-label')).toContain('context menu');
    act(() => marker.click());
    expect(inspect).toHaveBeenCalledExactlyOnceWith('new/file.txt', 'unstaged');
    expect(actions.showDiff).not.toHaveBeenCalled();
    render({ ...lfs, stateFor: () => ({ configured: true, pointer: true }) } as any);
    expect(host.querySelector('.staging-lfs-recommendation')).toBeNull();
  });

  it('opens a diff directly when embedded without an inspector callback', () => {
    const { actions } = render(undefined, false);
    act(() => host.querySelector<HTMLElement>('[aria-label="staged.txt"]')!.click());
    expect(actions.showDiff).toHaveBeenCalledExactlyOnceWith('staged.txt', true);
  });

  it('marks the selected file in its original category', () => {
    render(undefined, true, { selectedFile: { path: 'modified.txt', source: 'unstaged' } });
    expect(host.querySelector('[aria-current="true"]')?.getAttribute('aria-label')).toBe('modified.txt');
    expect(host.querySelectorAll('.is-selected')).toHaveLength(1);
  });

  it.each(['stage', 'delete'] as const)('keeps the explicit %s button independent of preview selection', (action) => {
    const { actions, inspect } = render();
    const row = host.querySelector('[title="new/file.txt"]')!.closest('.staging-file-row')!;
    const button = row.querySelectorAll('button')[action === 'stage' ? 0 : 1]!;
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(action === 'stage' ? actions.stageFile : actions.deleteUntracked).toHaveBeenCalledWith('new/file.txt');
    expect(inspect).not.toHaveBeenCalled();
    expect(actions.showDiff).not.toHaveBeenCalled();
  });
  it('preserves file rows, button identity, focus and scroll position through progress and statistics updates', () => {
    render();
    const row = host.querySelector<HTMLElement>('[aria-label="modified.txt"]')!;
    const button = row.querySelector('button')!;
    const list = row.closest<HTMLElement>('.staging-change-list')!;
    act(() => row.focus());
    list.scrollTop = 8;
    for (let tick = 0; tick < 8; tick++) {
      render();
      expect(host.querySelector('[aria-label="modified.txt"]')).toBe(row);
      expect(row.querySelector('button')).toBe(button);
      expect(document.activeElement).toBe(row);
      expect(list.scrollTop).toBe(8);
    }
  });

  it('shows repository-relative parents and distinguishes the two diffs of a partially staged rename', () => {
    const rename = { path: 'src/settings/index.ts', originalPath: 'src/legacy/config.ts', x: 'R', y: 'M' };
    const homonym = { path: 'tests/settings/index.ts', x: ' ', y: 'M' };
    const { inspect } = render(undefined, true, {
      visibleStaged: [rename],
      visibleUnstaged: [rename, homonym],
      selectedFile: { path: rename.path, source: 'staged' },
    });
    const [staged, unstaged] = host.querySelectorAll<HTMLElement>('[aria-label="src/settings/index.ts"]');
    const other = host.querySelector('[aria-label="tests/settings/index.ts"]')!;
    expect(staged.querySelector('.staging-file-name')?.textContent).toBe('index.ts');
    expect(staged.querySelector('.staging-directory')?.textContent).toBe('src/settings/');
    expect(other.querySelector('.staging-directory')?.textContent).toBe('tests/settings/');
    expect(staged.querySelector<HTMLElement>('.staging-path')?.title).toBe('src/settings/index.ts\nPreviously src/legacy/config.ts');
    expect(staged.querySelector('.staging-partial')?.getAttribute('title')).toBe('Also has unstaged changes');
    const description = document.getElementById(unstaged.getAttribute('aria-describedby')!);
    expect(description?.textContent).toContain('Modified · Also has staged changes');
    expect(staged.getAttribute('aria-current')).toBe('true');
    expect(unstaged.hasAttribute('aria-current')).toBe(false);

    act(() => staged.click());
    act(() => unstaged.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    expect(inspect.mock.calls).toEqual([
      [rename.path, 'staged'],
      [rename.path, 'unstaged'],
    ]);
  });

  it('scrolls between virtualized rows and keeps focus across snapshots and group boundaries', () => {
    const visibleUnstaged = Array.from({ length: 100 }, (_, index) => ({ path: `src/file-${index}.ts`, x: ' ', y: 'M' }));
    render(undefined, true, { visibleUnstaged });
    const list = host.querySelector<HTMLDivElement>('.staging-change-list')!;
    Object.defineProperty(list, 'clientHeight', { value: 160 });
    const scroll = (top: number) =>
      act(() => {
        list.scrollTop = top;
        list.dispatchEvent(new Event('scroll'));
      });
    const row = (path: string) => list.querySelector<HTMLElement>(`.staging-file-row[aria-label="${path}"]`);
    const move = (key: string) => act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

    expect(row('src/file-99.ts')).toBeNull();
    act(() => row('staged.txt')!.focus());
    move('ArrowDown');
    expect(document.activeElement).toBe(row('src/file-0.ts'));
    const focused = document.activeElement;
    scroll(4_000);
    render(undefined, true, { visibleUnstaged: visibleUnstaged.map((file) => ({ ...file })) });
    expect(list.scrollTop).toBe(4_000);
    expect(document.activeElement).toBe(focused);
    expect(row('src/file-0.ts')).toBe(focused);
    expect(row('src/file-50.ts')).toBeNull();

    act(() => row('src/file-99.ts')!.focus());
    move('ArrowDown');
    expect(document.activeElement).toBe(row('new/file.txt'));
    expect(list.scrollTop).toBeGreaterThan(4_000);
    move('ArrowUp');
    expect(document.activeElement).toBe(row('src/file-99.ts'));
  });
});
