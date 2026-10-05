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

  const render = () => {
    const actions = {
      isMutating: false,
      showDiff: vi.fn(),
      stageFile: vi.fn(),
      unstageFile: vi.fn(),
      deleteUntracked: vi.fn(),
      stagedStats: { files: 1, additions: 1, deletions: 0 },
      unstagedStats: { files: 1, additions: 1, deletions: 1 },
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
            onSelectFileInspect: inspect,
          }),
        }),
      );
    });
    return { actions, inspect };
  };

  it.each([
    ['staged.txt', 'staged', true],
    ['modified.txt', 'unstaged', false],
    ['new/file.txt', 'unstaged', false],
  ] as const)('opens %s directly in the inspector and diff without staging', (filePath, source, staged) => {
    const { actions, inspect } = render();
    const row = host.querySelector(`[title="${filePath}"]`)!.closest('.staging-file-row')!;
    act(() => row.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(inspect).toHaveBeenCalledWith(filePath, source);
    expect(actions.showDiff).toHaveBeenCalledWith(filePath, staged);
    expect(actions.stageFile).not.toHaveBeenCalled();
    expect(actions.unstageFile).not.toHaveBeenCalled();
    expect(actions.deleteUntracked).not.toHaveBeenCalled();
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
});
