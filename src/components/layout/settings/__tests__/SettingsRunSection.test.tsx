// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepositoryRunConfig } from '@/types/repositoryRun';
import { I18nProvider } from '@/i18n';
import { SettingsRunSection } from '@/components/layout/settings/SettingsRunSection';

const { getConfigMock, saveConfigMock, refreshRunConfigMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
  refreshRunConfigMock: vi.fn(),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useRepositoryContext: () => ({ openRepos: ['C:/repos/a', 'C:/repos/b'], activeRepo: 'C:/repos/a' }),
  useWorkflowContext: () => ({ onRefreshRunConfig: refreshRunConfigMock }),
}));

vi.mock('@/services/repositoryRunClient', () => ({
  repositoryRunClient: {
    isAvailable: () => true,
    getConfig: getConfigMock,
    saveConfig: saveConfigMock,
  },
}));

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
  getConfigMock.mockReset();
  saveConfigMock.mockReset();
  refreshRunConfigMock.mockReset();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SettingsRunSection', () => {
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
});
