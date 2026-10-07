// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { HostedRepository, HostingCapabilities, HostingRelease } from '@/types/hostingDtos';
import { RepositoryReleaseCreator } from '../RepositoryReleaseCreator';
import { releaseDraftKey, useReleaseDraftState } from '../releaseDraftState';

const mocks = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn(), refresh: vi.fn(), target: null as unknown, files: [] as string[] }));
vi.mock('../useReleaseTarget', () => ({ useReleaseTarget: () => mocks.target }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => mocks.toast }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request, sessionVersion: () => 1 } }));
vi.mock('@/services/appClient', () => ({ appClient: { selectFiles: async () => mocks.files, isAvailable: () => true } }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select({ currentBranch: 'main', refreshTrigger: 0, triggerRefresh: mocks.refresh }),
  useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { language: 'en' } }),
  useUIStore: (select: (state: unknown) => unknown) => select({ setConfirmDialog: vi.fn(), onOpenRemoteConfig: vi.fn(), setActiveTab: vi.fn() }),
  useAppStateReader: () => () => ({ repository: { activeRepo: 'C:/repo', currentBranch: 'main' } }),
}));
const oid = 'a'.repeat(40);
const repository = (id: string): HostedRepository => ({
  ref: { connectionId: id, repositoryId: '1', fullPath: 'team/repo' },
  name: 'repo',
  fullName: 'team/repo',
  cloneUrl: 'https://forge.example/team/repo.git',
  htmlUrl: 'https://forge.example/team/repo',
  description: null,
  defaultBranch: 'main',
  private: true,
  fork: false,
});
const target = (id: string) => {
  const repo = repository(id);
  const endpoint = { remoteName: 'origin', url: repo.cloneUrl, repository: repo.ref };
  return {
    repository: repo,
    scope: id,
    endpoint,
    choices: [endpoint],
    capabilities: { releases: 'native', releaseAssets: true, draftRelease: true, prerelease: true } as HostingCapabilities,
    loading: false,
    missingTarget: false,
    error: '',
    choose: vi.fn(),
  };
};
let root: Root;
let host: HTMLDivElement;
let releases: Record<string, HostingRelease>;
let tagStatus: 'created' | 'failed';
let failUpload: boolean;
const key = (id = 'forgejo') => releaseDraftKey('C:/repo', repository(id).ref, 'origin');
const session = (id = 'forgejo') => useReleaseDraftState.getState().sessions[key(id)];
async function flush(operation: () => void = () => {}) {
  await act(async () => {
    operation();
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
}
const render = () =>
  flush(() =>
    root.render(
      <I18nProvider language="en">
        <RepositoryReleaseCreator repoPath="C:/repo" requestedTarget={null} />
      </I18nProvider>,
    ),
  );
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  expect(button).toBeDefined();
  await flush(() => button!.click());
}
async function prepare() {
  await render();
  await flush(() =>
    useReleaseDraftState.getState().update(key(), (previous) => ({
      ...previous!,
      form: { ...previous!.form, body: 'Original release notes' },
    })),
  );
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  useReleaseDraftState.setState({ sessions: {} });
  mocks.target = target('forgejo');
  mocks.files = [];
  releases = {};
  tagStatus = 'created';
  failUpload = false;
  mocks.request.mockImplementation(async (operation: string, input: any) => {
    const published = releases[input.repository.connectionId];
    if (operation === 'releaseContext')
      return {
        existingTags: ['v1.0.0', ...(published ? [published.tagName] : [])],
        lastReleaseTag: published?.tagName || 'v1.0.0',
        targetOid: oid,
        commitsTarget: 'main',
        repositoryHtmlUrl: repository('forgejo').htmlUrl,
        fallbackUsed: false,
        commitsSinceLastRelease:
          published && !input.fromRef ? [] : [{ hash: oid, shortHash: 'aaaaaaa', subject: 'Original change', author: 'Author', date: '2026-10-07' }],
      };
    if (operation === 'inspectRelease')
      return {
        inspectionId: 'inspected',
        localSha: oid,
        remoteSha: oid,
        targetBranch: 'main',
        ahead: 0,
        behind: 0,
        canPush: false,
        canReleaseRemote: true,
        pushBlockedReason: null,
      };
    if (operation === 'createRelease')
      return (releases[input.repository.connectionId] = {
        id: 'created',
        tagName: input.tagName,
        name: input.name,
        htmlUrl: '',
        draft: input.draft,
        prerelease: input.prerelease,
        localTag: {
          name: input.tagName,
          targetOid: oid,
          status: tagStatus,
          message: tagStatus === 'failed' ? 'Tag lock is held by another process' : undefined,
        },
      });
    if (operation === 'uploadAsset') {
      if (failUpload && input.filePath === 'C:/two.zip') throw new Error('Upload interrupted');
      return { id: input.filePath, name: input.filePath, htmlUrl: '' };
    }
    if (operation === 'syncReleaseTag') return { name: published.tagName, targetOid: oid, status: 'created' };
    throw new Error(`Unexpected operation ${operation}`);
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('release creator after publication', () => {
  it('refreshes release/history data, clears publication fields and assets, and keeps a ready next draft after reopening', async () => {
    await prepare();
    await flush(() =>
      useReleaseDraftState.getState().update(key(), (previous) => ({
        ...previous!,
        versionBump: 'major',
        options: { ...previous!.options, includeTechnicalDetails: false },
        form: { ...previous!.form, tagName: 'v2.0.0', releaseName: 'Custom release', fromRef: 'v0.9.0', prerelease: true },
      })),
    );
    mocks.files = ['C:/one.zip', 'C:/two.zip'];
    await click('Add assets');
    await click('Create release');
    expect(session().created).toBeNull();
    expect(session().lastCreated).toMatchObject({ tagName: 'v2.0.0', localTag: { status: 'created' } });
    expect(session().form).toEqual({ tagName: 'v2.0.1', releaseName: 'Release v2.0.1', targetCommitish: 'main', body: '', draft: false, prerelease: false });
    expect(session().assets).toEqual([]);
    expect(session().uploaded).toEqual([]);
    expect(session().options.includeTechnicalDetails).toBe(false);
    expect(session().versionBump).toBe('patch');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    expect(host.textContent).not.toContain('Original change');
    expect(host.textContent).toContain('v2.0.0');
    expect(host.textContent).not.toContain('Prepare another release');
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Local tag v2.0.0 is available'), false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('A new draft is ready'), false);
    await flush(() => root.render(<div />));
    await render();
    expect(session().form.tagName).toBe('v2.0.1');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'createRelease')).toHaveLength(1);
  });

  it('keeps failed assets and their release, refreshes history, then resets after retrying just the missing upload', async () => {
    await prepare();
    mocks.files = ['C:/one.zip', 'C:/two.zip'];
    await click('Add assets');
    failUpload = true;
    await click('Create release');
    expect(session().created?.tagName).toBe('v1.0.1');
    expect(session().form.body).toBe('Original release notes');
    expect(session().uploaded).toEqual(['C:/one.zip']);
    expect(host.textContent).toContain('Upload pending files');
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('was created; follow-up pending'), true);
    expect(mocks.toast.mock.calls.some(([message]) => message.includes('A new draft is ready'))).toBe(false);
    expect(host.textContent).not.toContain('Original change');
    failUpload = false;
    await click('Upload pending files');
    expect(session().created).toBeNull();
    expect(session().assets).toEqual([]);
    expect(session().form.body).toBe('');
    expect(session().form.tagName).toBe('v1.0.2');
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'uploadAsset').map(([, input]) => input.filePath)).toEqual([
      'C:/one.zip',
      'C:/two.zip',
      'C:/two.zip',
    ]);
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'createRelease')).toHaveLength(1);
  });

  it('makes a missing local tag retryable and resets only when the local follow-up succeeds', async () => {
    await prepare();
    tagStatus = 'failed';
    await click('Create release');
    expect(session().created?.localTag?.status).toBe('failed');
    expect(session().form.body).toBe('Original release notes');
    expect(host.textContent).toContain('Retry local tag');
    await click('Retry local tag');
    expect(mocks.request).toHaveBeenCalledWith('syncReleaseTag', { repoPath: 'C:/repo', repository: repository('forgejo').ref, releaseId: 'created' });
    expect(session().created).toBeNull();
    expect(session().form.tagName).toBe('v1.0.2');
    expect(session().form.body).toBe('');
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'createRelease')).toHaveLength(1);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Local tag v1.0.1 is available'), false);
  });

  it('does not clear another hosting account draft when an earlier publication finishes late', async () => {
    await prepare();
    const request = mocks.request.getMockImplementation()!;
    let finish!: () => Promise<void>;
    mocks.request.mockImplementation((operation, input) => {
      if (operation !== 'createRelease') return request(operation, input);
      return new Promise((resolve) => {
        finish = async () => resolve(await request(operation, input));
      });
    });
    await click('Create release');
    mocks.target = target('second-account');
    await render();
    await flush(() =>
      useReleaseDraftState.getState().update(key('second-account'), (previous) => ({
        ...previous!,
        form: { ...previous!.form, body: 'Notes for the second account' },
      })),
    );
    await act(async () => {
      await finish();
    });
    await flush();
    expect(session('second-account').form.body).toBe('Notes for the second account');
    expect(session('second-account').lastCreated).toBeNull();
    expect(session().form.body).toBe('Original release notes');
    expect(mocks.toast.mock.calls.some(([message]) => message.includes('A new draft is ready'))).toBe(false);
  });
});
