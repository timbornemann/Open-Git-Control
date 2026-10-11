// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { AppSettingsDto } from '@/types/appDtos';
import { RecoveryCenter } from './RecoveryCenter';
import { resetWorkingDirectoryNavigationGuardForTests, setActiveWorkingDirectoryNavigationGuard } from './working-directory/workingDirectoryNavigationGuard';

const { setToastMock } = vi.hoisted(() => ({
  setToastMock: vi.fn(),
}));

vi.mock('@/hooks/useAppToast', () => ({
  useAppToastSetter: () => setToastMock,
}));

const settings = { confirmDangerousOps: true } as AppSettingsDto;

const buildReflog = (entries: Array<{ hash: string; abbrevHash: string; selector: string; subject: string; date: string }>): string =>
  entries.map((entry) => [entry.hash, entry.abbrevHash, entry.selector, entry.subject, entry.date].join('\x1f')).join('\x00');

const reflog = buildReflog([
  {
    hash: 'a'.repeat(40),
    abbrevHash: 'aaaaaaa',
    selector: 'HEAD@{0}',
    subject: 'checkout: first restore point',
    date: '2026-07-30T12:00:00.000Z',
  },
  {
    hash: 'a'.repeat(40),
    abbrevHash: 'aaaaaaa',
    selector: 'HEAD@{1}',
    subject: 'reset: second restore point',
    date: '2026-07-29T12:00:00.000Z',
  },
]);

describe('RecoveryCenter', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    setToastMock.mockReset();
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getCommitMessageEditBackups').mockResolvedValue({ success: true, data: [] });
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host.remove();
    vi.restoreAllMocks();
    resetWorkingDirectoryNavigationGuardForTests();
  });

  const renderCenter = async (props?: { repoPath?: string; refreshTrigger?: number; onRepoChanged?: () => void }) => {
    await act(async () => {
      root?.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(RecoveryCenter, {
            repoPath: props?.repoPath ?? 'C:/repos/demo',
            refreshTrigger: props?.refreshTrigger ?? 0,
            onRepoChanged: props?.onRepoChanged ?? vi.fn(),
            settings,
          }),
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const enterText = (input: HTMLInputElement, value: string) => {
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  };

  it('keeps reflog positions with the same commit independently selectable', async () => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    await renderCenter();

    expect(host.querySelector('.recovery-center__selection h2')?.textContent).toBe('first restore point');
    const historyItems = host.querySelectorAll<HTMLButtonElement>('.recovery-center__history-item');
    expect(historyItems).toHaveLength(2);

    act(() => historyItems[1]?.click());

    expect(host.querySelector('.recovery-center__selection h2')?.textContent).toBe('second restore point');
    expect(host.querySelector('.recovery-center__git-details code')?.textContent).toBe('HEAD@{1}');
    expect(historyItems[1]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows durable message backups even when their reflog position has expired', async () => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    vi.mocked(gitClient.getCommitMessageEditBackups).mockResolvedValue({
      success: true,
      data: [{ ref: 'refs/ogc/commit-reword/saved', hash: 'c'.repeat(40), branch: 'refs/heads/main', createdAt: Date.now() }],
    });
    await renderCenter();
    expect(host.textContent).toContain('Message backup');
    expect(host.querySelector('.recovery-center__git-details code')?.textContent).toBe('refs/ogc/commit-reword/saved');
  });

  it('validates the inline branch name and creates the recovery branch from the selected commit', async () => {
    const onRepoChanged = vi.fn();
    const runGitCommand = vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repoPath, command) => {
      if (command === 'reflog') return { success: true, data: reflog };
      return { success: true, data: '' };
    });
    await renderCenter({ onRepoChanged });

    const input = host.querySelector<HTMLInputElement>('#recovery-branch-name');
    if (!input) throw new Error('Missing recovery branch input.');
    enterText(input, 'invalid branch');
    act(() => {
      input.closest('form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('Use a valid Git branch name');
    expect(runGitCommand.mock.calls.some((call) => call[1] === 'checkout')).toBe(false);

    enterText(input, 'recovery/important-work');
    const createButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Create branch & open'));
    if (!createButton) throw new Error('Missing create branch button.');

    await act(async () => {
      createButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runGitCommand).toHaveBeenCalledWith('C:/repos/demo', 'checkout', '-b', 'recovery/important-work', 'a'.repeat(40));
    expect(onRepoChanged).toHaveBeenCalledOnce();
    expect(setToastMock).toHaveBeenCalledWith({
      msg: 'Recovery branch "recovery/important-work" was created.',
      isError: false,
    });
  });

  it('ignores a late reflog response after switching repositories', async () => {
    let resolveFirst: ((value: { success: true; data: string }) => void) | null = null;
    const firstRequest = new Promise<{ success: true; data: string }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondReflog = buildReflog([
      {
        hash: 'b'.repeat(40),
        abbrevHash: 'bbbbbbb',
        selector: 'HEAD@{0}',
        subject: 'commit: current repository',
        date: '2026-07-30T13:00:00.000Z',
      },
    ]);
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (repoPath) => {
      if (repoPath === 'C:/repos/first') return firstRequest;
      return { success: true, data: secondReflog };
    });

    await renderCenter({ repoPath: 'C:/repos/first' });
    await renderCenter({ repoPath: 'C:/repos/second' });
    expect(host.textContent).toContain('current repository');

    await act(async () => {
      resolveFirst?.({ success: true, data: reflog });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain('current repository');
    expect(host.textContent).not.toContain('first restore point');
  });

  it('keeps the current history visible while a background refresh is pending', async () => {
    let resolveRefresh: ((value: { success: true; data: string }) => void) | null = null;
    const refreshRequest = new Promise<{ success: true; data: string }>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.spyOn(gitClient, 'runGitCommandForRepo')
      .mockResolvedValueOnce({ success: true, data: reflog })
      .mockImplementationOnce(async () => refreshRequest);

    await renderCenter({ refreshTrigger: 0 });
    expect(host.querySelectorAll('.recovery-center__history-item')).toHaveLength(2);

    await renderCenter({ refreshTrigger: 1 });

    expect(host.querySelectorAll('.recovery-center__history-item')).toHaveLength(2);
    expect(host.querySelectorAll('.recovery-center__skeleton')).toHaveLength(0);
    expect(host.querySelector<HTMLButtonElement>('.recovery-center__intro-actions button')?.disabled).toBe(true);

    await act(async () => {
      resolveRefresh?.({ success: true, data: reflog });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelectorAll('.recovery-center__history-item')).toHaveLength(2);
  });

  const clickButton = async (label: string) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    await act(async () => {
      button.click();
    });
  };

  it('keeps advanced actions collapsed and explains destructive recovery before executing it', async () => {
    const run = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    await renderCenter();
    const advanced = host.querySelector<HTMLDetailsElement>('.recovery-center__advanced');
    expect(advanced?.open).toBe(false);
    expect(host.querySelector<HTMLDetailsElement>('.recovery-center__git-details')?.open).toBe(false);
    act(() => advanced?.querySelector('summary')?.click());
    expect(advanced?.open).toBe(true);
    await clickButton('Reset…');
    expect(run.mock.calls.filter((call) => call[1] === 'reset')).toHaveLength(0);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('including staged changes');
    await clickButton('Cancel');
    expect(run.mock.calls.filter((call) => call[1] === 'reset')).toHaveLength(0);
    await clickButton('Reset…');
    await clickButton('Reset branch');
    expect(run).toHaveBeenCalledWith('C:/repos/demo', 'reset', '--hard', 'a'.repeat(40));
  });

  it('keeps the selection, branch draft and open advanced options through an unchanged background refresh', async () => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    await renderCenter();
    const second = host.querySelectorAll<HTMLButtonElement>('.recovery-center__history-item')[1];
    act(() => second.click());
    const input = host.querySelector<HTMLInputElement>('#recovery-branch-name')!;
    enterText(input, 'recovered/draft');
    act(() => host.querySelector<HTMLDetailsElement>('.recovery-center__advanced')?.querySelector('summary')?.click());
    await renderCenter({ refreshTrigger: 1 });
    expect(host.querySelector('.recovery-center__selection h2')?.textContent).toBe('second restore point');
    expect(host.querySelector<HTMLInputElement>('#recovery-branch-name')?.value).toBe('recovered/draft');
    expect(host.querySelector<HTMLDetailsElement>('.recovery-center__advanced')?.open).toBe(true);
    expect(host.querySelectorAll('.recovery-center__skeleton')).toHaveLength(0);
  });

  it('sorts backups and history together and lets users filter saved backups', async () => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    vi.mocked(gitClient.getCommitMessageEditBackups).mockResolvedValue({
      success: true,
      data: [{ ref: 'refs/ogc/commit-reword/old', hash: 'c'.repeat(40), branch: 'refs/heads/main', createdAt: Date.parse('2026-07-28T10:00:00Z') }],
    });
    await renderCenter();
    expect(host.querySelectorAll('.recovery-center__history-item')).toHaveLength(3);
    expect(host.querySelector('.recovery-center__history-item')?.textContent).toContain('first restore point');
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Recovery point source"]')!;
    act(() => {
      select.value = 'backup';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelectorAll('.recovery-center__history-item')).toHaveLength(1);
    expect(host.querySelector('.recovery-center__selection h2')?.textContent).toBe('Original commit on main');
    const search = host.querySelector<HTMLInputElement>('[aria-label="Search recovery points"]')!;
    enterText(search, 'absent');
    expect(host.textContent).toContain('No matching entries');
    await clickButton('Show all entries');
    expect(search.value).toBe('');
    expect(select.value).toBe('all');
    expect(host.querySelectorAll('.recovery-center__history-item')).toHaveLength(3);
  });

  it('keeps available history when backups fail and exposes the failure with retry and collapsed details', async () => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    vi.mocked(gitClient.getCommitMessageEditBackups).mockResolvedValue({ success: false, error: 'Backup store is locked' });
    await renderCenter();
    expect(host.querySelectorAll('.recovery-center__history-item')).toHaveLength(2);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Git history is still available');
    expect(host.querySelector<HTMLDetailsElement>('[role="alert"] details')?.open).toBe(false);
    vi.mocked(gitClient.getCommitMessageEditBackups).mockResolvedValue({ success: true, data: [] });
    await clickButton('Retry');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('preserves the last known history when a refresh fails and recovers on retry', async () => {
    const run = vi
      .spyOn(gitClient, 'runGitCommandForRepo')
      .mockResolvedValueOnce({ success: true, data: reflog })
      .mockResolvedValueOnce({ success: false, error: 'Git unavailable' })
      .mockResolvedValue({ success: true, data: reflog });
    await renderCenter();
    await renderCenter({ refreshTrigger: 1 });
    expect(host.querySelectorAll('.recovery-center__history-item')).toHaveLength(2);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Git history could not be refreshed');
    await clickButton('Retry');
    expect(run).toHaveBeenCalledTimes(3);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('respects the editor guard and prevents duplicate submissions while waiting for it', async () => {
    const run = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    await renderCenter();
    let cancel: (() => void) | undefined;
    setActiveWorkingDirectoryNavigationGuard((_target, _proceed, decline) => {
      cancel = decline;
    });
    const form = host.querySelector('form')!;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(run.mock.calls.filter((call) => call[1] === 'checkout')).toHaveLength(0);
    expect(host.querySelector<HTMLInputElement>('#recovery-branch-name')?.disabled).toBe(true);
    await act(async () => cancel?.());
    expect(host.querySelector<HTMLInputElement>('#recovery-branch-name')?.disabled).toBe(false);
    expect(run.mock.calls.filter((call) => call[1] === 'checkout')).toHaveLength(0);
  });

  it('clears pending confirmations and drafts when the repository changes', async () => {
    const run = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    await renderCenter();
    enterText(host.querySelector<HTMLInputElement>('#recovery-branch-name')!, 'old-repo/draft');
    act(() => host.querySelector('.recovery-center__advanced summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await clickButton('Reset…');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await renderCenter({ repoPath: 'C:/repos/other' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('#recovery-branch-name')?.value).toBe('recovery-aaaaaaa');
    expect(run.mock.calls.filter((call) => call[1] === 'reset')).toHaveLength(0);
  });

  it('supports selecting recovery points with the keyboard', async () => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    await renderCenter();
    const first = host.querySelector<HTMLButtonElement>('.recovery-center__history-item')!;
    act(() => {
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(host.querySelector('.recovery-center__selection h2')?.textContent).toBe('second restore point');
    expect(document.activeElement?.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the chosen state and branch draft when new events renumber reflog positions', async () => {
    const run = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: reflog });
    await renderCenter();
    act(() => host.querySelectorAll<HTMLButtonElement>('.recovery-center__history-item')[1].click());
    enterText(host.querySelector<HTMLInputElement>('#recovery-branch-name')!, 'keep/my-recovery');
    const moved = reflog.replace('HEAD@{1}', 'HEAD@{2}').replace('HEAD@{0}', 'HEAD@{1}');
    run.mockResolvedValue({
      success: true,
      data:
        buildReflog([{ hash: 'b'.repeat(40), abbrevHash: 'bbbbbbb', selector: 'HEAD@{0}', subject: 'commit: new work', date: '2026-07-31T12:00:00Z' }]) +
        '\x00' +
        moved,
    });
    await renderCenter({ refreshTrigger: 1 });
    expect(host.querySelector('.recovery-center__selection h2')?.textContent).toBe('second restore point');
    expect(host.querySelector('.recovery-center__git-details code')?.textContent).toBe('HEAD@{2}');
    expect(host.querySelector<HTMLInputElement>('#recovery-branch-name')?.value).toBe('keep/my-recovery');
  });
});
