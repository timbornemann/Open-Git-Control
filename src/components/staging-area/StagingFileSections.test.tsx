// @vitest-environment jsdom

import { act, createElement } from 'react';
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

  const render = (lfs?: ReturnType<typeof useFileOperations>['lfs'], withInspector = true, selectedFile?: { path: string; source: 'staged' | 'unstaged' }) => {
    const actions = {
      isMutating: false,
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
            selectedFile,
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
    render(undefined, true, { path: 'modified.txt', source: 'unstaged' });
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
    const list = row.closest<HTMLElement>('.staging-section-list')!;
    row.focus();
    list.scrollTop = 8;
    for (let tick = 0; tick < 8; tick++) {
      render();
      expect(host.querySelector('[aria-label="modified.txt"]')).toBe(row);
      expect(row.querySelector('button')).toBe(button);
      expect(document.activeElement).toBe(row);
      expect(list.scrollTop).toBe(8);
    }
  });
});
