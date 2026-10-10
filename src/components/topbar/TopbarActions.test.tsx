// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { TopbarActions } from './TopbarActions';
import type { BranchInfo } from '@/types/git';

describe('TopbarActions', () => {
  let root: Root | null = null;
  const onStartRepositoryRun = vi.fn<() => Promise<boolean>>();
  const onOpenRemoteConfig = vi.fn();
  const onMergeBranch = vi.fn();

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '<div id="root"></div>';
    onStartRepositoryRun.mockReset().mockResolvedValue(true);
    onOpenRemoteConfig.mockReset();
    onMergeBranch.mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  const renderActions = async (branches: BranchInfo[] = []) => {
    root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root?.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(TopbarActions, {
            activeRepo: 'C:/repo',
            branches,
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
            onMergeBranch,
            onStageCommit: vi.fn(),
            onOpenReleaseCreator: vi.fn(),
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
            onOpenRemoteConfig,
          }),
        }),
      );
      await Promise.resolve();
    });
  };

  it('opens the repository remote configuration from More without starting a transfer', async () => {
    await renderActions();
    expect([...document.querySelectorAll('.topbar-action-label')].map((label) => label.textContent)).not.toContain('Timeline');
    await act(async () => document.querySelector<HTMLButtonElement>('.topbar-more-toggle')?.click());
    expect(document.querySelector('.topbar-more-dropdown')?.textContent).not.toContain('Timeline');
    const remote = [...document.querySelectorAll<HTMLButtonElement>('.topbar-dropdown-item')].find((button) =>
      button.textContent?.includes('Remote configuration'),
    );
    expect(remote).toBeTruthy();
    await act(async () => remote?.click());
    expect(onOpenRemoteConfig).toHaveBeenCalledOnce();
    expect(document.querySelector('.topbar-more-dropdown')).toBeNull();
  });

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

  it('uses the same guided merge menu in the topbar and the compact More menu', async () => {
    await renderActions([
      { name: 'main', isHead: true, scope: 'local' },
      { name: 'feature', isHead: false, scope: 'local' },
    ]);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Choose branch to merge"]')?.click());
    expect(document.querySelectorAll('.merge-branch-menu')).toHaveLength(1);
    expect(document.body.textContent).toContain('Your current branch stays active');
    await act(async () => document.querySelector<HTMLButtonElement>('.topbar-more-toggle')?.click());
    const item = [...document.querySelectorAll<HTMLButtonElement>('.topbar-dropdown-item')].find((button) =>
      button.textContent?.includes('Choose source, target and behavior'),
    )!;
    await act(async () => item.click());
    expect(document.querySelectorAll('.merge-branch-menu')).toHaveLength(1);
    const outward = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Current into another')!;
    await act(async () => outward.click());
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('.merge-branch-menu select')!;
      select.value = 'feature';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => document.querySelector<HTMLButtonElement>('.merge-menu-continue')?.click());
    expect(onMergeBranch).toHaveBeenCalledWith('feature', 'default', 'intoSelected');
    expect(document.querySelector('.topbar-more-dropdown')).toBeNull();
  });
});
