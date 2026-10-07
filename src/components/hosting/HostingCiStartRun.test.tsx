// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { HostedRepository, HostingLocalWorkflows } from '@/types/hostingDtos';
import { HostingCiStartRun } from './HostingCiStartRun';

const mocks = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn(), started: vi.fn(), close: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/contexts/AppStateContext', () => ({ useGitStore: (selector: (state: unknown) => unknown) => selector({ onToast: mocks.toast }) }));
const repository: HostedRepository = {
  ref: { connectionId: 'github', repositoryId: '42', fullPath: 'team/app' },
  name: 'app',
  fullName: 'team/app',
  description: null,
  cloneUrl: 'https://github.com/team/app.git',
  htmlUrl: 'https://github.com/team/app',
  private: false,
  fork: false,
  defaultBranch: 'main',
};
const local: HostingLocalWorkflows = {
  provider: 'github',
  workflows: [
    { id: 'build.yml', name: 'Build application', filePath: '.github/workflows/build.yml' },
    { id: 'deploy.yml', name: 'Deploy application', filePath: '.github/workflows/deploy.yml' },
  ],
  files: ['.github/workflows/build.yml', '.github/workflows/deploy.yml'],
  issues: [],
};
const repoPath = 'C:/Code/app';
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let host: HTMLDivElement;
let root: Root;
const render = (repo = repository, path: string | null = repoPath) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <HostingCiStartRun
          key={JSON.stringify(repo.ref)}
          id="start-run"
          repository={repo}
          repoPath={path}
          defaultRef="main"
          onStarted={mocks.started}
          onClose={mocks.close}
        />
      </I18nProvider>,
    ),
  );
const change = (element: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(async () => {
    if (element instanceof HTMLSelectElement) {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
const submit = () => act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.request.mockReset().mockImplementation(async (operation: string) => {
    if (operation === 'localWorkflows') return local;
    if (operation === 'dispatch') return true;
    throw new Error(`Unexpected operation: ${operation}`);
  });
  mocks.toast.mockReset();
  mocks.started.mockReset();
  mocks.close.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('manual CI workflow choices', () => {
  it('offers named local workflows and dispatches the selected filename and independent ref for the exact hosted repository', async () => {
    await render();
    expect(mocks.request).toHaveBeenCalledWith('localWorkflows', { repository: repository.ref, repoPath });
    const select = host.querySelector('select')!;
    expect(select.value).toBe('0');
    expect(select.options[1].text).toBe('Deploy application · .github/workflows/deploy.yml');
    expect(host.textContent).toContain('configuration must also exist on the selected branch / tag');
    await change(select, '1');
    await change(host.querySelector<HTMLInputElement>('input')!, 'release/v2');
    await submit();
    expect(mocks.request).toHaveBeenCalledWith('dispatch', { repository: repository.ref, workflow: 'deploy.yml', ref: 'release/v2', inputs: {} });
    expect(mocks.started).toHaveBeenCalledOnce();
  });

  it('retains manual entry alongside the dropdown and uses newly read configurations when refreshed', async () => {
    await render();
    await change(host.querySelector('select')!, 'manual');
    await change(host.querySelector<HTMLInputElement>('[aria-label="Enter workflow manually"]')!, 'custom-remote.yml');
    mocks.request.mockResolvedValueOnce({
      ...local,
      workflows: [...local.workflows, { id: 'new.yml', name: 'New workflow', filePath: '.github/workflows/new.yml' }],
    });
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Refresh local workflows"]')!.click());
    expect(host.querySelector<HTMLInputElement>('[aria-label="Enter workflow manually"]')!.value).toBe('custom-remote.yml');
    expect(host.querySelector('select')!.options).toHaveLength(4);
    await submit();
    expect(mocks.request).toHaveBeenLastCalledWith('dispatch', expect.objectContaining({ workflow: 'custom-remote.yml' }));
  });

  it('does not overwrite a manual draft when discovery finishes later', async () => {
    const discovered = deferred<HostingLocalWorkflows>();
    mocks.request.mockReturnValueOnce(discovered.promise);
    await render();
    expect(host.textContent).toContain('Reading local workflows');
    await change(host.querySelector<HTMLInputElement>('[aria-label="Enter workflow manually"]')!, 'own.yml');
    await act(async () => discovered.resolve(local));
    expect(host.querySelector('select')!.value).toBe('manual');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Enter workflow manually"]')!.value).toBe('own.yml');
    await submit();
    expect(mocks.request).toHaveBeenLastCalledWith('dispatch', expect.objectContaining({ workflow: 'own.yml' }));
  });

  it('preserves a manual draft when the matching local clone is identified after opening the form', async () => {
    await render(repository, null);
    await change(host.querySelector<HTMLInputElement>('[aria-label="Enter workflow manually"]')!, 'chosen.yml');
    await render(repository, repoPath);
    expect(host.querySelector('select')!.value).toBe('manual');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Enter workflow manually"]')!.value).toBe('chosen.yml');
    await submit();
    expect(mocks.request).toHaveBeenLastCalledWith('dispatch', expect.objectContaining({ workflow: 'chosen.yml' }));
  });

  it('ignores discovery responses belonging to another repository or account', async () => {
    const old = deferred<HostingLocalWorkflows>();
    mocks.request.mockReturnValueOnce(old.promise);
    await render();
    const other = { ...repository, ref: { ...repository.ref, connectionId: 'forgejo', fullPath: 'private/app' } };
    mocks.request.mockResolvedValueOnce({
      ...local,
      provider: 'forgejo',
      workflows: [{ id: 'private.yml', name: 'Private workflow', filePath: '.forgejo/workflows/private.yml' }],
    });
    await render(other, 'C:/Code/private');
    await act(async () => old.resolve(local));
    expect(host.textContent).toContain('Private workflow');
    expect(host.textContent).not.toContain('Build application');
    await submit();
    expect(mocks.request).toHaveBeenLastCalledWith('dispatch', expect.objectContaining({ repository: other.ref, workflow: 'private.yml' }));
  });

  it('reports unreadable configurations centrally and keeps manual start available for missing or invalid local files', async () => {
    mocks.request.mockResolvedValueOnce({ ...local, workflows: [], issues: [{ filePath: '.github/workflows/bad.yml', reason: 'invalid' }] });
    await render();
    expect(mocks.toast).toHaveBeenCalledWith('Some workflow files could not be read: .github/workflows/bad.yml', true);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await change(host.querySelector<HTMLInputElement>('[aria-label="Enter workflow manually"]')!, 'remote.yml');
    await submit();
    expect(mocks.started).toHaveBeenCalledOnce();
  });

  it('keeps manual entry available without a matching active clone and does not read unrelated local repositories', async () => {
    await render(repository, null);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(host.querySelector('select')).toBeNull();
    expect(host.textContent).toContain('A local clone provides workflow suggestions');
    await change(host.querySelector<HTMLInputElement>('[aria-label="Enter workflow manually"]')!, 'ci.yml');
    await submit();
    expect(mocks.request).toHaveBeenLastCalledWith('dispatch', expect.objectContaining({ workflow: 'ci.yml' }));
  });

  it('dispatches the detected GitLab pipeline with an empty workflow selector', async () => {
    mocks.request.mockResolvedValueOnce({
      provider: 'gitlab',
      workflows: [{ id: '', name: 'Pipeline', filePath: '.gitlab-ci.yml' }],
      files: ['.gitlab-ci.yml'],
      issues: [],
    });
    await render({ ...repository, ref: { ...repository.ref, connectionId: 'gitlab' } });
    expect(host.querySelector('select')!.options[0].text).toBe('Pipeline · .gitlab-ci.yml');
    await submit();
    expect(mocks.request).toHaveBeenLastCalledWith('dispatch', expect.objectContaining({ workflow: '', ref: 'main' }));
  });
});
