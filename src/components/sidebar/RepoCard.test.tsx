// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoCard, RepoCardHeader } from './RepoCard';

describe('RepoCardHeader', () => {
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

  it('keeps a long collapsible title available through a tooltip', () => {
    const onToggleCollapsed = vi.fn();
    const title = 'Pull Requests (timbornemann/mathe-erklaerer-with-a-very-long-repository-name)';
    root = createRoot(document.getElementById('root')!);

    act(() => {
      root?.render(
        createElement(RepoCard, {
          children: createElement(RepoCardHeader, {
            title,
            collapsed: false,
            onToggleCollapsed,
            toggleTitle: 'Collapse pull requests',
          }),
        }),
      );
    });

    const titleElement = document.querySelector<HTMLElement>('.repo-card-title');
    const toggle = document.querySelector<HTMLButtonElement>('.repo-card-toggle');
    expect(titleElement?.getAttribute('title')).toBe(title);
    expect(toggle?.getAttribute('title')).toBe('Collapse pull requests');

    act(() => toggle?.click());
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });
});
