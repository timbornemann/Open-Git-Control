// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepositoryRunConfig } from '@/types/repositoryRun';
import { I18nProvider } from '@/i18n';
import { RepositoryRunConfigView } from './RepositoryRunConfigView';

const { copyMock, getConfigMock, saveConfigMock, checkMock, refreshMock, toastMock, repository } = vi.hoisted(() => ({
  copyMock: vi.fn(),
  getConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
  checkMock: vi.fn(),
  refreshMock: vi.fn(),
  toastMock: vi.fn(),
  repository: { activeRepo: 'C:/repos/a' as string | null, onToast: vi.fn() },
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useRepositoryContext: () => repository,
  useWorkflowContext: () => ({ onRefreshRunConfig: refreshMock }),
}));
vi.mock('@/services/repositoryRunClient', () => ({
  repositoryRunClient: { isAvailable: () => true, getConfig: getConfigMock, saveConfig: saveConfigMock, checkPrerequisites: checkMock },
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
  for (const mock of [copyMock, getConfigMock, saveConfigMock, checkMock, refreshMock, toastMock]) mock.mockReset();
  checkMock.mockResolvedValue({ success: true, data: { platform: 'linux', checkedAt: 1, checks: [] } });
  copyMock.mockResolvedValue(true);
  refreshMock.mockResolvedValue(undefined);
  window.sessionStorage.clear();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
});

describe('RepositoryRunConfigView', () => {
  it('shows missing programs alongside detected templates and checks again after installation without discarding the draft', async () => {
    vi.useFakeTimers();
    const initial = response('C:/repos/a');
    const template = {
      id: 'node-test',
      label: 'npm run test',
      action: 'test' as const,
      step: { label: 'Tests', parser: 'none' as const, linux: { shell: 'bash' as const, command: 'npm run test' } },
    };
    const report = {
      platform: 'linux' as const,
      checkedAt: 1,
      checks: [
        { program: 'node' as const, shell: 'bash' as const, state: 'available' as const },
        { program: 'npm' as const, shell: 'bash' as const, state: 'missing' as const },
      ],
    };
    getConfigMock.mockResolvedValue({ ...initial, data: { ...initial.data, templates: [template], prerequisites: report } });
    await render();
    expect(host.textContent).toContain('Required programs');
    expect(host.textContent).toContain('npmNot found');
    expect(checkMock).not.toHaveBeenCalled();
    act(() => button('Test')?.click());
    expect(button('+ npm run test')?.textContent).toContain('Required: npm · not found');
    act(() => button('+ npm run test')?.click());
    expect(host.textContent).toContain('Unsaved changes');
    checkMock.mockResolvedValue({ success: true, data: { ...report, checks: report.checks.map((check) => ({ ...check, state: 'available' })) } });
    act(() => button('Check again')?.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(checkMock).toHaveBeenCalledWith(
      'C:/repos/a',
      expect.objectContaining({ actions: expect.objectContaining({ test: { steps: [expect.objectContaining({ label: 'Tests' })] } }) }),
    );
    expect(host.textContent).not.toContain('not found');
    expect(host.textContent).toContain('Unsaved changes');
    expect(saveConfigMock).not.toHaveBeenCalled();
  });

  it('checks a newly chosen known template and ignores its late result after a repository switch', async () => {
    vi.useFakeTimers();
    const initial = response('C:/repos/a');
    const config = createEmptyRepositoryRunConfig();
    config.actions.test.steps = [{ id: 'test', label: 'Tests', parser: 'none', linux: { shell: 'bash', command: 'echo ready' } }];
    getConfigMock.mockImplementation(async (repo: string) => (repo === 'C:/repos/a' ? { ...initial, data: { ...initial.data, config } } : response(repo)));
    await render();
    act(() => button('Test')?.click());
    const picker = host.querySelector('.repository-run-settings__select-label select') as HTMLSelectElement;
    act(() => {
      picker.value = 'rust-test';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const pending = deferred<{
      success: true;
      data: { platform: 'linux'; checkedAt: number; checks: { program: 'cargo'; shell: 'bash'; state: 'missing' }[] };
    }>();
    checkMock.mockReturnValue(pending.promise);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(checkMock.mock.calls[0][1].actions.test.steps[0].linux.command).toBe('cargo test');
    repository.activeRepo = 'C:/repos/b';
    await render();
    await act(async () => {
      pending.resolve({ success: true, data: { platform: 'linux', checkedAt: 1, checks: [{ program: 'cargo', shell: 'bash', state: 'missing' }] } });
    });
    expect(host.textContent).not.toContain('Cargo');
    expect(host.textContent).toContain('C:/repos/b');
  });

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
