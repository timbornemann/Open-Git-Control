// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { TopbarActions } from './TopbarActions';

describe('TopbarActions', () => {
  let root: Root | null = null;
  const onStartRepositoryRun = vi.fn<() => Promise<boolean>>();

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    onStartRepositoryRun.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  const renderActions = async () => {
    root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root?.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(TopbarActions, {
            activeRepo: 'C:/repo',
            branches: [],
            currentBranch: 'main',
            isGitActionRunning: false,
            isFetching: false,
            activeActionLabel: null,
            onFetch: vi.fn(),
            onPull: vi.fn(),
            onPullRebase: vi.fn(),
            onPullFfOnly: vi.fn(),
            onPullNoFf: vi.fn(),
            onPush: vi.fn(),
            onPushForceWithLease: vi.fn(),
            onPushTags: vi.fn(),
            onPushSetUpstream: vi.fn(),
            onMergeBranch: vi.fn(),
            onStageCommit: vi.fn(),
            onOpenReleaseCreator: vi.fn(),
            onOpenTimeline: vi.fn(),
            repositoryRun: null,
            activeRunConfig: {
              exists: true,
              config: null,
              configPath: 'C:/repo/.Open-Git-Control/run.json',
              availableActions: { run: true, test: false, format: false, start: false, build: false },
              templates: [],
            },
            hasUnreadRepositoryRunResult: false,
            onStartRepositoryRun,
            onStopRepositoryRun: vi.fn().mockResolvedValue(true),
            onOpenRunConsole: vi.fn(),
            onOpenRunSettings: vi.fn(),
          }),
        }),
      );
      await Promise.resolve();
    });
  };

  it('provides the complete Run menu from More when compact actions are active', async () => {
    await renderActions();

    const moreButton = document.querySelector<HTMLButtonElement>('.topbar-more-toggle');
    expect(moreButton).not.toBeNull();
    await act(async () => moreButton?.click());

    const runButton = document.querySelector<HTMLButtonElement>('[data-topbar-more-run]');
    expect(runButton?.textContent).toBe('Run');
    await act(async () => runButton?.click());

    expect(document.body.textContent).toContain('Repository commands');
    const defaultRun = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Run configured action'));
    await act(async () => defaultRun?.click());

    expect(onStartRepositoryRun).toHaveBeenCalledWith('run');
    expect(document.querySelector('.topbar-more-dropdown')).toBeNull();
  });
});
