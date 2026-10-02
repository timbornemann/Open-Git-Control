// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepositoryRunConfig } from '@/types/repositoryRun';
import { I18nProvider } from '@/i18n';
import { RepositoryRunConfigView } from './RepositoryRunConfigView';

const { copyMock, getConfigMock, saveConfigMock, refreshMock, toastMock, repository } = vi.hoisted(() => ({
  copyMock: vi.fn(),
  getConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
  refreshMock: vi.fn(),
  toastMock: vi.fn(),
  repository: { activeRepo: 'C:/repos/a' as string | null, onToast: vi.fn() },
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useRepositoryContext: () => repository,
  useWorkflowContext: () => ({ onRefreshRunConfig: refreshMock }),
}));
vi.mock('@/services/repositoryRunClient', () => ({
  repositoryRunClient: { isAvailable: () => true, getConfig: getConfigMock, saveConfig: saveConfigMock },
}));
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: copyMock }));

const response = (repoPath: string, config = createEmptyRepositoryRunConfig()) => ({
  success: true as const,
  data: { exists: true, config, configPath: `${repoPath}/.Open-Git-Control/run.json`, availableActions: {}, templates: [] },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

let root: Root | null = null;
let host: HTMLDivElement;
const render = async () => {
  await act(async () => {
    root?.render(createElement(I18nProvider, { language: 'en', children: createElement(RepositoryRunConfigView) }));
    await Promise.resolve();
    await Promise.resolve();
  });
};
const button = (label: string) => Array.from(host.querySelectorAll('button')).find((item) => item.textContent?.includes(label));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  repository.activeRepo = 'C:/repos/a';
  repository.onToast = toastMock;
  for (const mock of [copyMock, getConfigMock, saveConfigMock, refreshMock, toastMock]) mock.mockReset();
  copyMock.mockResolvedValue(true);
  refreshMock.mockResolvedValue(undefined);
  window.sessionStorage.clear();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  host.remove();
});

describe('RepositoryRunConfigView', () => {
  it('binds the page and agent prompt to the active repository', async () => {
    getConfigMock.mockResolvedValue(response('C:/repos/a'));
    await render();
    expect(host.textContent).toContain('C:/repos/a');
    expect(host.querySelector('select[value="C:/repos/b"]')).toBeNull();
    await act(async () => button('Copy AI agent prompt')?.click());
    expect(copyMock).toHaveBeenCalledWith(expect.stringContaining('<target_file>C:/repos/a/.Open-Git-Control/run.json</target_file>'));
  });

  it('does not show a stale config after the active repository changes', async () => {
    const pendingA = deferred<ReturnType<typeof response>>();
    const pendingB = deferred<ReturnType<typeof response>>();
    getConfigMock.mockImplementation((path: string) => (path === 'C:/repos/a' ? pendingA.promise : pendingB.promise));
    await render();
    repository.activeRepo = 'C:/repos/b';
    await render();
    await act(async () => {
      pendingB.resolve(response('C:/repos/b'));
      await Promise.resolve();
    });
    expect(host.textContent).toContain('C:/repos/b/.Open-Git-Control/run.json');
    await act(async () => {
      pendingA.resolve(response('C:/repos/a'));
      await Promise.resolve();
    });
    expect(host.textContent).not.toContain('C:/repos/a/.Open-Git-Control/run.json');
  });

  it('keeps the editor visible after saving and refreshes the header config', async () => {
    const config = createEmptyRepositoryRunConfig();
    getConfigMock.mockResolvedValue(response('C:/repos/a', config));
    saveConfigMock.mockResolvedValue({ success: true, data: config });
    await render();
    await act(async () => {
      button('Save')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saveConfigMock).toHaveBeenCalledWith('C:/repos/a', config);
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(toastMock).toHaveBeenCalledWith('Run configuration saved.', false);
    expect(host.textContent).toContain('C:/repos/a');
    expect(button('Save')).toBeTruthy();
  });

  it('restores an unsaved draft after leaving and reopening the page', async () => {
    getConfigMock.mockResolvedValue({ ...response('C:/repos/a'), data: { ...response('C:/repos/a').data, config: null, error: 'invalid' } });
    await render();
    act(() => button('Create new configuration')?.click());
    expect(host.textContent).toContain('Unsaved changes');
    expect(window.sessionStorage.length).toBe(1);
    act(() => root?.unmount());
    root = createRoot(host);
    await render();
    expect(host.textContent).toContain('Unsaved changes');
    expect(button('Create new configuration')).toBeUndefined();
  });

  it('preserves a dirty draft when another repository becomes active', async () => {
    getConfigMock.mockImplementation(async (path: string) => ({ ...response(path), data: { ...response(path).data, config: null, error: 'invalid' } }));
    await render();
    act(() => button('Create new configuration')?.click());
    repository.activeRepo = 'C:/repos/b';
    await render();
    expect(host.textContent).toContain('C:/repos/b');
    expect(host.textContent).not.toContain('C:/repos/a/.Open-Git-Control/run.json');
    expect(window.sessionStorage.length).toBe(1);
  });

  it('shows an empty state with no active repository', async () => {
    repository.activeRepo = null;
    await render();
    expect(host.textContent).toContain('Open a local repository first.');
    expect(getConfigMock).not.toHaveBeenCalled();
  });
});
