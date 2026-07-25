// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepositoryRunConfig } from '@/types/repositoryRun';
import { I18nProvider } from '@/i18n';
import { SettingsRunSection } from '@/components/layout/settings/SettingsRunSection';

const { copyTextToClipboardMock, getConfigMock, saveConfigMock, refreshRunConfigMock, setConfirmDialogMock, onToastMock, repositoryContextState } = vi.hoisted(
  () => ({
    copyTextToClipboardMock: vi.fn(),
    getConfigMock: vi.fn(),
    saveConfigMock: vi.fn(),
    refreshRunConfigMock: vi.fn(),
    setConfirmDialogMock: vi.fn(),
    onToastMock: vi.fn(),
    repositoryContextState: { openRepos: ['C:/repos/a', 'C:/repos/b'], activeRepo: 'C:/repos/a' as string | null, onToast: undefined as unknown },
  }),
);

vi.mock('@/contexts/AppStateContext', () => ({
  useRepositoryContext: () => repositoryContextState,
  useWorkflowContext: () => ({ onRefreshRunConfig: refreshRunConfigMock }),
  useUIContext: () => ({ setConfirmDialog: setConfirmDialogMock }),
}));

vi.mock('@/services/repositoryRunClient', () => ({
  repositoryRunClient: {
    isAvailable: () => true,
    getConfig: getConfigMock,
    saveConfig: saveConfigMock,
  },
}));

vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: copyTextToClipboardMock }));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

let root: Root | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  copyTextToClipboardMock.mockReset().mockResolvedValue(true);
  getConfigMock.mockReset();
  saveConfigMock.mockReset();
  refreshRunConfigMock.mockReset();
  setConfirmDialogMock.mockReset();
  onToastMock.mockReset();
  repositoryContextState.onToast = onToastMock;
  window.sessionStorage.clear();
  repositoryContextState.openRepos = ['C:/repos/a', 'C:/repos/b'];
  repositoryContextState.activeRepo = 'C:/repos/a';
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SettingsRunSection', () => {
  it('copies an agent prompt for the selected repository', async () => {
    const config = createEmptyRepositoryRunConfig();
    getConfigMock.mockResolvedValue({
      success: true,
      data: { exists: true, config, configPath: 'C:/repos/a/.Open-Git-Control/run.json', availableActions: {}, templates: [] },
    });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
      await Promise.resolve();
      await Promise.resolve();
    });

    const copyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Copy AI agent prompt'));
    if (!copyButton) throw new Error('Missing copy agent prompt button.');
    await act(async () => {
      copyButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(copyTextToClipboardMock).toHaveBeenCalledWith(expect.stringContaining('<target_file>C:/repos/a/.Open-Git-Control/run.json</target_file>'));
    expect(onToastMock).toHaveBeenCalledWith('AI agent prompt copied.', false);
  });

  it('never applies a stale repository configuration after switching repositories', async () => {
    const configA = createEmptyRepositoryRunConfig();
    const configB = createEmptyRepositoryRunConfig();
    const requestA = deferred<any>();
    const requestB = deferred<any>();
    getConfigMock.mockImplementation((repoPath: string) => (repoPath === 'C:/repos/a' ? requestA.promise : requestB.promise));
    saveConfigMock.mockResolvedValue({ success: true, data: configB });

    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    act(() => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(getConfigMock).toHaveBeenCalledWith('C:/repos/a');

    const select = container.querySelector<HTMLSelectElement>('select');
    if (!select) throw new Error('Missing repository selector.');
    await act(async () => {
      select.value = 'C:/repos/b';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(getConfigMock).toHaveBeenCalledWith('C:/repos/b');

    await act(async () => {
      requestB.resolve({
        success: true,
        data: { exists: true, config: configB, configPath: 'C:/repos/b/.Open-Git-Control/run.json', availableActions: {}, templates: [] },
      });
      await Promise.resolve();
    });
    expect(container.textContent).toContain('C:/repos/b/.Open-Git-Control/run.json');

    await act(async () => {
      requestA.resolve({
        success: true,
        data: { exists: true, config: configA, configPath: 'C:/repos/a/.Open-Git-Control/run.json', availableActions: {}, templates: [] },
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain('C:/repos/b/.Open-Git-Control/run.json');
    expect(container.textContent).not.toContain('C:/repos/a/.Open-Git-Control/run.json');

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Save'));
    if (!saveButton) throw new Error('Missing save button.');
    await act(async () => {
      saveButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(saveConfigMock).toHaveBeenCalledWith('C:/repos/b', configB);
  });

  it('requires confirmation before discarding an unsaved configuration on repository switch', async () => {
    const configB = createEmptyRepositoryRunConfig();
    getConfigMock.mockImplementation(async (repoPath: string) => ({
      success: true,
      data:
        repoPath === 'C:/repos/a'
          ? { exists: true, config: null, configPath: 'C:/repos/a/.Open-Git-Control/run.json', availableActions: {}, templates: [], error: 'invalid' }
          : { exists: true, config: configB, configPath: 'C:/repos/b/.Open-Git-Control/run.json', availableActions: {}, templates: [] },
    }));

    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
      await Promise.resolve();
      await Promise.resolve();
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Create new configuration'));
    if (!createButton) throw new Error('Missing create configuration button.');
    act(() => createButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Unsaved changes');

    const select = container.querySelector<HTMLSelectElement>('select');
    if (!select) throw new Error('Missing repository selector.');
    act(() => {
      select.value = 'C:/repos/b';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });

    expect(setConfirmDialogMock).toHaveBeenCalledTimes(1);
    expect(getConfigMock).not.toHaveBeenCalledWith('C:/repos/b');
    const confirmation = setConfirmDialogMock.mock.calls[0][0];
    await act(async () => {
      await confirmation.onConfirm();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getConfigMock).toHaveBeenCalledWith('C:/repos/b');
  });

  it('restores an unsaved run configuration after the settings view is remounted', async () => {
    getConfigMock.mockResolvedValue({
      success: true,
      data: { exists: true, config: null, configPath: 'C:/repos/a/.Open-Git-Control/run.json', availableActions: {}, templates: [], error: 'invalid' },
    });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
      await Promise.resolve();
      await Promise.resolve();
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Create new configuration'));
    if (!createButton) throw new Error('Missing create configuration button.');
    act(() => createButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Unsaved changes');
    expect(window.sessionStorage.length).toBe(1);

    act(() => root?.unmount());
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Unsaved changes');
    expect(container.textContent).not.toContain('Create new configuration');
  });

  it('selects a remaining repository when the clean selected repository is closed', async () => {
    const config = createEmptyRepositoryRunConfig();
    getConfigMock.mockImplementation(async (repoPath: string) => ({
      success: true,
      data: { exists: true, config, configPath: `${repoPath}/.Open-Git-Control/run.json`, availableActions: {}, templates: [] },
    }));
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
      await Promise.resolve();
      await Promise.resolve();
    });

    repositoryContextState.openRepos = ['C:/repos/b'];
    repositoryContextState.activeRepo = 'C:/repos/b';
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
      await Promise.resolve();
      await Promise.resolve();
    });

    const select = container.querySelector<HTMLSelectElement>('select');
    expect(select?.value).toBe('C:/repos/b');
    expect(getConfigMock).toHaveBeenCalledWith('C:/repos/b');
  });

  it('selects a remaining repository and preserves the draft when the dirty repository is closed', async () => {
    getConfigMock.mockResolvedValue({
      success: true,
      data: { exists: true, config: null, configPath: 'C:/repos/a/.Open-Git-Control/run.json', availableActions: {}, templates: [], error: 'invalid' },
    });
    const container = document.getElementById('root');
    if (!container) throw new Error('Missing test root.');
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
      await Promise.resolve();
      await Promise.resolve();
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Create new configuration'));
    if (!createButton) throw new Error('Missing create configuration button.');
    act(() => createButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    expect(window.sessionStorage.length).toBe(1);

    repositoryContextState.openRepos = ['C:/repos/b'];
    repositoryContextState.activeRepo = 'C:/repos/b';
    await act(async () => {
      root?.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsRunSection)));
      await Promise.resolve();
      await Promise.resolve();
    });

    const select = container.querySelector<HTMLSelectElement>('select');
    expect(select?.value).toBe('C:/repos/b');
    expect(window.sessionStorage.length).toBe(1);
    expect(setConfirmDialogMock).not.toHaveBeenCalled();
  });
});
