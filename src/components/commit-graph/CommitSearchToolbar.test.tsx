// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitSearchToolbar } from './CommitSearchToolbar';

describe('CommitSearchToolbar', () => {
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  it('keeps compact toolbar actions reachable through the More menu', () => {
    const onToggleRecoveryCenter = vi.fn();
    root = createRoot(document.getElementById('root')!);

    act(() => {
      root?.render(
        createElement(CommitSearchToolbar, {
          activeSearchPanel: 'commits',
          onActiveSearchPanelChange: vi.fn(),
          searchScope: 'all',
          onSearchScopeChange: vi.fn(),
          searchScopeLabels: { all: 'All', subject: 'Message', author: 'Author', hash: 'Hash', refs: 'Refs' },
          searchQuery: 'fix',
          onSearchQueryChange: vi.fn(),
          showRecoveryCenter: false,
          onToggleRecoveryCenter,
          normalizedSearch: 'fix',
          matchCount: 2,
          onJumpToPreviousMatch: vi.fn(),
          onJumpToNextMatch: vi.fn(),
          t: (key) => key,
        }),
      );
    });

    const moreToggle = document.querySelector<HTMLButtonElement>('.commit-search-toolbar__more-toggle');
    expect(moreToggle).not.toBeNull();
    act(() => moreToggle?.click());

    expect(document.querySelectorAll('.commit-search-toolbar__more-control select')).toHaveLength(2);
    const recoveryAction = document.querySelector<HTMLButtonElement>('.commit-search-toolbar__more-action');
    expect(recoveryAction).not.toBeNull();

    act(() => recoveryAction?.click());
    expect(onToggleRecoveryCenter).toHaveBeenCalledOnce();
    expect(document.querySelector('.commit-search-toolbar__more-menu')).toBeNull();
  });
});
