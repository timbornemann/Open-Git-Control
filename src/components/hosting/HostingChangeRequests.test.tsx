// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedRepository, HostedRepositoryRef, HostingCapabilities } from '@/types/hostingDtos';
import { HostingChangeRequests } from './HostingChangeRequests';
import { useHostingState } from './hostingState';

const mocks = vi.hoisted(() => ({ request: vi.fn<(operation: string, input?: unknown) => Promise<unknown>>() }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/services/appClient', () => ({ appClient: { openExternalUrl: vi.fn() } }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (selector: (value: unknown) => unknown) => selector({ triggerRefresh: vi.fn(), currentBranch: 'feature' }),
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));
const ref: HostedRepositoryRef = { connectionId: 'private-gitlab', repositoryId: '42', fullPath: 'team/tools/project' };
const repository: HostedRepository = {
  ref,
  fullName: ref.fullPath,
  name: 'project',
  description: null,
  private: true,
  cloneUrl: 'https://git.example/team/tools/project.git',
  htmlUrl: 'https://git.example/team/tools/project',
  defaultBranch: 'main',
  fork: true,
};
const capabilities: HostingCapabilities = {
  createRepository: true,
  fork: true,
  defaultBranchOnlyFork: false,
  changeRequests: true,
  changeRequestLabel: 'Merge Requests',
  mergeMethods: ['squash'],
  ciLabel: 'GitLab CI/CD',
  runs: true,
  jobs: true,
  steps: true,
  logs: true,
  artifacts: true,
  cancelRun: true,
  retryRun: true,
  dispatch: true,
  releases: 'native',
  releaseAssets: true,
  draftRelease: false,
  prerelease: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('repository selection in the change request form', () => {
  let host: HTMLDivElement;
  let root: Root;
  const change = async (element: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const click = async (element: HTMLButtonElement) => act(async () => element.click());
  const render = () => act(async () => root.render(createElement(HostingChangeRequests, { repository, capabilities, repoPath: null })));
  const picker = (index: number) => host.querySelectorAll<HTMLElement>('.hosting-repository-picker')[index];
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useHostingState.setState({ revision: 0 });
    mocks.request.mockReset().mockImplementation(async (operation) => {
      if (operation === 'changeRequests') return { items: [], nextCursor: null };
      if (operation === 'resolveRepository') return null;
      if (operation === 'createChangeRequest') return { number: '73', title: 'Use the selected repositories' };
      throw new Error(operation);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  it('resolves URLs on the current account, shows the resolved references and creates with those exact repositories', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    const source = { ...ref, repositoryId: '42-fork', fullPath: 'tim/project' };
    const target = { ...ref, repositoryId: '42-parent', fullPath: 'team/platform/project' };
    mocks.request.mockImplementation(async (operation, input) => {
      if (operation === 'changeRequests') return { items: [], nextCursor: null };
      if (operation === 'resolveRepository') return { ...repository, ref: (input as { url: string }).url.endsWith('/tim/project') ? source : target };
      if (operation === 'createChangeRequest') return { number: '73', title: 'Use the selected repositories' };
      throw new Error(operation);
    });
    await render();
    for (const [index, selected] of [source, target].entries()) {
      const url = 'https://git.example/' + selected.fullPath;
      await change(picker(index).querySelector('input')!, url);
      await click(picker(index).querySelector('button')!);
      expect(mocks.request).toHaveBeenCalledWith('resolveRepository', { connectionId: ref.connectionId, url });
      expect(picker(index).querySelector('.hosting-source-ref')?.textContent).toBe(selected.fullPath);
    }
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mocks.request).toHaveBeenCalledWith(
      'createChangeRequest',
      expect.objectContaining({
        repository: target,
        source,
        sourceBranch: 'feature',
        targetBranch: 'main',
      }),
    );
    expect(prompt).not.toHaveBeenCalled();
  });
  it('keeps the existing source after an invalid URL and ignores a late resolution after leaving the form', async () => {
    await render();
    await change(picker(0).querySelector('input')!, 'https://other.example/team/tools/project');
    await click(picker(0).querySelector('button')!);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Repository does not belong to this server and account');
    expect(picker(0).querySelector('.hosting-source-ref')?.textContent).toBe(ref.fullPath);
    const pending = deferred<HostedRepository>();
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((operation, input) => (operation === 'resolveRepository' ? pending.promise : normal(operation, input)));
    await click(picker(0).querySelector('button')!);
    expect(picker(0).querySelector('input')?.disabled).toBe(true);
    await act(async () => root.render(createElement('div', null, 'Catalog')));
    await act(async () => pending.resolve({ ...repository, ref: { ...ref, fullPath: 'late/private-source' } }));
    expect(host.textContent).toBe('Catalog');
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'createChangeRequest')).toBe(false);
  });
});
