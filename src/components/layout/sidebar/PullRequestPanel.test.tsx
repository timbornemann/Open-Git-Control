// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { PullRequestPanel } from './PullRequestPanel';

describe('PullRequestPanel', () => {
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

  it('keeps a long owner and repository heading available through a tooltip', () => {
    const owner = 'timbornemann-with-a-very-long-owner-name';
    const repo = 'mathe-erklaerer-with-a-very-long-repository-name';
    root = createRoot(document.getElementById('root')!);

    act(() => {
      root?.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(PullRequestPanel, {
            ownerRepo: { owner, repo },
            prFilter: 'open',
            setPrFilter: vi.fn(),
            prLoading: false,
            prHasLoaded: true,
            pullRequests: [],
            prCiByNumber: {},
            showCreatePR: false,
            setShowCreatePR: vi.fn(),
            currentBranch: 'main',
            setNewPRHead: vi.fn(),
            newPRTitle: '',
            setNewPRTitle: vi.fn(),
            newPRBody: '',
            setNewPRBody: vi.fn(),
            newPRHead: 'main',
            setNewPRHeadInput: vi.fn(),
            newPRBase: 'main',
            setNewPRBase: vi.fn(),
            onCreatePR: vi.fn(),
            onOpenPR: vi.fn(),
            onCopyPRUrl: vi.fn(),
            onCheckoutPR: vi.fn().mockResolvedValue(undefined),
            onMergePR: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      );
    });

    const title = document.querySelector<HTMLElement>('.github-panel-section-title');
    expect(title?.getAttribute('title')).toBe(`Pull Requests (${owner}/${repo})`);
  });
});
