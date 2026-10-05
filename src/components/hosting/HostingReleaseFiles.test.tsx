// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedRepositoryRef, HostingReleaseAsset } from '@/types/hostingDtos';
import { HostingReleaseFiles } from './HostingReleaseFiles';
import { useHostingState } from './hostingState';

const mocks = vi.hoisted(() => ({ request: vi.fn<(operation: string, input?: unknown) => Promise<unknown>>(), openExternal: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/services/appClient', () => ({ appClient: { openExternalUrl: mocks.openExternal } }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));

const cloud: HostedRepositoryRef = { connectionId: 'bitbucket-cloud', repositoryId: 'same-id', fullPath: 'team/project' };
const github: HostedRepositoryRef = { connectionId: 'github-backup', repositoryId: 'same-id', fullPath: 'team/project' };
const asset = (id: string, name: string, repository: HostedRepositoryRef = cloud): HostingReleaseAsset => ({
  id,
  name,
  htmlUrl: `https://${repository.connectionId === cloud.connectionId ? 'bitbucket.org' : 'github.com'}/team/project/downloads/${name}`,
});
const page = (items: HostingReleaseAsset[], nextCursor: string | null = null) => ({ items, nextCursor });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('repository downloads and native release attachments', () => {
  let host: HTMLDivElement;
  let root: Root;
  const button = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((element) => (element.getAttribute('aria-label') ?? element.textContent?.trim()) === label);
  const click = async (element: Element | undefined) => {
    expect(element).toBeTruthy();
    await act(async () => (element as HTMLElement).click());
  };
  const render = (repository = cloud, releaseId?: string) => act(async () => root.render(createElement(HostingReleaseFiles, { repository, releaseId })));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useHostingState.setState({ revision: 0 });
    mocks.request.mockReset();
    mocks.openExternal.mockReset().mockResolvedValue({ success: true });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('loads Bitbucket repository downloads independently of tags, paginates, and opens the selected file', async () => {
    const first = asset('one', 'archive-one.zip');
    const second = asset('two', 'archive-two.zip');
    mocks.request.mockImplementation(async (operation, input) => {
      expect(operation).toBe('releaseAssets');
      return (input as { cursor?: string }).cursor ? page([second]) : page([first], 'next-downloads-page');
    });
    await render();
    expect(host.querySelector('h3')?.textContent).toBe('Repository downloads');
    expect(mocks.request).toHaveBeenCalledWith('releaseAssets', { repository: cloud, releaseId: undefined });
    await click(button('Load more files'));
    expect(mocks.request).toHaveBeenCalledWith('releaseAssets', { repository: cloud, releaseId: undefined, cursor: 'next-downloads-page' });
    expect(button(first.name)).toBeTruthy();
    expect(button(second.name)).toBeTruthy();
    expect(button('Load more files')).toBeUndefined();
    await click(button(second.name));
    expect(mocks.openExternal).toHaveBeenCalledWith(second.htmlUrl);
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'tags' || operation === 'releases')).toBe(false);
  });

  it('rejects a late repository-download response after switching to a native release with the same repository ID', async () => {
    const old = deferred<ReturnType<typeof page>>();
    const attachment = asset('new', 'github-attachment.zip', github);
    mocks.request.mockImplementation((operation, input) => {
      expect(operation).toBe('releaseAssets');
      return (input as { repository: HostedRepositoryRef }).repository.connectionId === cloud.connectionId ? old.promise : Promise.resolve(page([attachment]));
    });
    await render();
    await render(github, 'release-42');
    expect(host.querySelector('h3')?.textContent).toBe('Attachments');
    expect(button(attachment.name)).toBeTruthy();
    await act(async () => old.resolve(page([asset('old', 'old-cloud-download.zip')])));
    expect(button('old-cloud-download.zip')).toBeUndefined();
    expect(button(attachment.name)).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith('releaseAssets', { repository: github, releaseId: 'release-42' });
  });

  it('does not append an old pagination result into another account download list', async () => {
    const oldPage = deferred<ReturnType<typeof page>>();
    const another = { ...cloud, connectionId: 'bitbucket-other-account' };
    const fresh = asset('fresh', 'other-account.zip', another);
    mocks.request.mockImplementation(async (_operation, input) => {
      const params = input as { repository: HostedRepositoryRef; cursor?: string };
      if (params.repository.connectionId === another.connectionId) return page([fresh]);
      return params.cursor ? oldPage.promise : page([asset('first', 'first-account.zip')], 'old-next-page');
    });
    await render();
    await click(button('Load more files'));
    await render(another);
    await act(async () => oldPage.resolve(page([asset('late', 'late-old-account.zip')])));
    expect(button(fresh.name)).toBeTruthy();
    expect(button('first-account.zip')).toBeUndefined();
    expect(button('late-old-account.zip')).toBeUndefined();
  });

  it('clears already-loaded files as soon as the endpoint changes while the new response is pending', async () => {
    const next = deferred<ReturnType<typeof page>>();
    mocks.request.mockImplementation(async (_operation, input) =>
      (input as { repository: HostedRepositoryRef }).repository.connectionId === cloud.connectionId ? page([asset('old', 'old-cloud-file.zip')]) : next.promise,
    );
    await render();
    expect(button('old-cloud-file.zip')).toBeTruthy();
    await render(github, 'release-42');
    expect(button('old-cloud-file.zip')).toBeUndefined();
    await act(async () => next.resolve(page([asset('new', 'new-release-file.zip', github)])));
    expect(button('new-release-file.zip')).toBeTruthy();
  });
});
