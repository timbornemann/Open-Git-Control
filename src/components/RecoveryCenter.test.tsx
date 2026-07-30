// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { AppSettingsDto } from '@/types/appDtos';
import { RecoveryCenter } from './RecoveryCenter';

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
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host.remove();
    vi.restoreAllMocks();
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
    expect(host.querySelector('.recovery-center__selection-meta code')?.textContent).toBe('HEAD@{1}');
    expect(historyItems[1]?.getAttribute('aria-pressed')).toBe('true');
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
    const createButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Create branch from entry'),
    );
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
});
