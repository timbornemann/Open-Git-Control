// @vitest-environment jsdom
import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateSlicesProvider, type AppStateSlicesValue } from '@/contexts/AppStateContext';
import { useDialogControllers } from '@/components/layout/hooks/useDialogControllers';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { I18nProvider } from '@/i18n';
import { aiClient } from '@/services/aiClient';
import { gitClient } from '@/services/gitClient';
import { clearCommitFormDraftsForTests } from './commitFormDraft';
import { StagingArea } from './StagingArea';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const repo = 'C:/ai-message-staging';
const paths = ['prepared.ts', 'changed.ts'];
const index = new Set<string>();
const toast = vi.fn();
const refreshed = vi.fn();
const currentStatus = () => ({
  staged: paths.filter((path) => index.has(path)).map((path) => ({ path, x: 'M', y: ' ' })),
  unstaged: paths.filter((path) => !index.has(path)).map((path) => ({ path, x: ' ', y: 'M' })),
  untracked: [],
});
let root: Root;
let host: HTMLDivElement;
let dialogs: ReturnType<typeof useDialogControllers>;
let message: ReturnType<typeof deferred<Awaited<ReturnType<typeof aiClient.generateCommitMessage>>>>;
let writeBarrier: Promise<void> | null;
let aiJobListener: Parameters<typeof aiClient.onJobEvent>[0];

function Harness() {
  dialogs = useDialogControllers();
  const [status, setStatus] = useState(currentStatus);
  const refresh = useCallback(async () => {
    refreshed();
    setStatus(currentStatus());
  }, []);
  const value = {
    settings: { onUpdateSettings: vi.fn(), onSelectSettingsTab: vi.fn() },
    repository: { activeRepo: repo, onToast: toast },
    ui: { ...dialogs, setActiveTab: vi.fn() },
    workflow: {},
  } as unknown as AppStateSlicesValue;
  return (
    <AppStateSlicesProvider value={value}>
      <StagingArea
        repoPath={repo}
        settings={DEFAULT_SETTINGS}
        workingTreeRepoPath={repo}
        workingTreeStatus={status}
        workingTreeStatusRaw=""
        onRefreshWorkingTree={refresh}
      />
    </AppStateSlicesProvider>
  );
}

const button = (selector: string) => {
  const element = host.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`Missing button: ${selector}`);
  return element;
};
const aiMessageButton = () => button('button[title^="Generate commit message from notes"]');
const click = async (element: HTMLButtonElement) => act(async () => element.click());
const finishMessage = async (pending: Promise<void>) => {
  await act(async () => {
    message.resolve({ success: true, data: { title: 'feat: parallel staging', description: 'Generated from the supplied notes.' } });
    await pending;
  });
};

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearCommitFormDraftsForTests();
  index.clear();
  index.add('prepared.ts');
  toast.mockClear();
  refreshed.mockClear();
  message = deferred();
  writeBarrier = null;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getStashes').mockResolvedValue({ success: true, data: [] });
  vi.spyOn(gitClient, 'getSequencerState').mockResolvedValue({ success: true, data: { operation: null } });
  vi.spyOn(gitClient, 'stagePaths').mockImplementation(async (selected) => {
    await writeBarrier;
    selected.forEach((path) => index.add(path));
    return { success: true, data: '' };
  });
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repo, command, ...args) => {
    if (command === 'status') return { success: true, data: `# branch.oid ${'a'.repeat(40)}\n# branch.head main` };
    await writeBarrier;
    if (command === 'add') paths.forEach((path) => index.add(path));
    if (command === 'reset') {
      if (args.includes('HEAD')) index.clear();
      else args.filter((path) => path !== '--').forEach((path) => index.delete(path));
    }
    return { success: true, data: '' };
  });
  vi.spyOn(aiClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(aiClient, 'getAutoCommitState').mockResolvedValue({ success: true, data: null });
  vi.spyOn(aiClient, 'onJobEvent').mockImplementation((listener) => {
    aiJobListener = listener;
    return () => {};
  });
  vi.spyOn(aiClient, 'generateCommitMessage').mockReturnValue(message.promise);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <I18nProvider language="en">
        <Harness />
      </I18nProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  clearCommitFormDraftsForTests();
});

describe('AI message generation alongside staging', () => {
  it('keeps global staging and unstaging available while the generated message is pending', async () => {
    await click(aiMessageButton());
    let pending!: Promise<void>;
    await act(async () => {
      pending = dialogs.executeInputDialog({ notes: 'Allow staging while generating the message.' });
    });
    expect(dialogs.inputDialog).toBeNull();
    expect(aiClient.generateCommitMessage).toHaveBeenCalledExactlyOnceWith({ notes: 'Allow staging while generating the message.' });
    expect(aiMessageButton().textContent).toContain('generating');
    expect(button('[data-tutorial="stage-repository"]').disabled).toBe(false);

    await click(button('[data-tutorial="stage-repository"]'));
    expect(gitClient.runGitCommandForRepo).toHaveBeenCalledWith(repo, 'add', '-A');
    expect(index.size).toBe(2);
    await click(button('[data-tutorial="unstage-file"]'));
    expect(index.size).toBe(1);
    expect(refreshed).toHaveBeenCalledTimes(2);
    expect(aiMessageButton().textContent).toContain('generating');

    await finishMessage(pending);
    expect(host.querySelector<HTMLTextAreaElement>('[data-tutorial="commit-message"]')?.value).toBe('parallel staging');
    expect(host.querySelector<HTMLTextAreaElement>('[data-tutorial="commit-description"]')?.value).toBe('Generated from the supplied notes.');
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(['stage', 'unstage'])('starts and completes AI generation while a %s operation is still pending', async (operation) => {
    const write = deferred<void>();
    writeBarrier = write.promise;
    await click(button(`[data-tutorial="${operation}-file"]`));
    expect(host.querySelector('[data-tutorial="staging"]')?.getAttribute('aria-busy')).toBe('true');
    expect(aiMessageButton().disabled).toBe(false);
    await click(aiMessageButton());
    let pending!: Promise<void>;
    await act(async () => {
      pending = dialogs.executeInputDialog({ notes: 'Generate independently of Git writes.' });
    });
    await finishMessage(pending);
    expect(host.querySelector('[data-tutorial="staging"]')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector<HTMLTextAreaElement>('[data-tutorial="commit-message"]')?.value).toBe('parallel staging');

    await act(async () => write.resolve());
    expect(refreshed).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-tutorial="staging"]')?.getAttribute('aria-busy')).toBe('false');
    expect(host.querySelector<HTMLTextAreaElement>('[data-tutorial="commit-message"]')?.disabled).toBe(false);
    expect(aiClient.generateCommitMessage).toHaveBeenCalledExactlyOnceWith({ notes: 'Generate independently of Git writes.' });
    expect(toast).not.toHaveBeenCalled();
  });

  it('keeps global staging and message generation blocked during an actual AI auto-commit', async () => {
    await act(async () =>
      aiJobListener({
        id: 'protected-auto-commit',
        operation: 'git:aiAutoCommit',
        status: 'start',
        timestamp: Date.now(),
        details: { repoPath: repo, phase: 'grouping' },
      }),
    );
    expect(button('[data-tutorial="stage-repository"]').disabled).toBe(true);
    expect(aiMessageButton().disabled).toBe(true);
    expect(aiClient.generateCommitMessage).not.toHaveBeenCalled();
  });
});
