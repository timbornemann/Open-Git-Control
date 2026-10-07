// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { ConfirmDialogState } from '@/app/state/contracts';
import type { HostedRepository, HostingCapabilities, HostingReleaseTarget } from '@/types/hostingDtos';
import { initialRemoteTransferState, useRemoteTransferState } from '@/components/hosting/remoteTransferState';
import { useRemoteTransferDialogState } from '@/components/hosting/remoteTransferDialogState';
import { newReleaseSession, type ReleaseSession } from '../releaseDraftState';
import { useReleasePublication } from '../useReleasePublication';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  auth: 1,
  activeRepo: 'C:/repo',
  dialog: null as ConfirmDialogState | null,
  setDialog: vi.fn((value: ConfirmDialogState | null | ((previous: ConfirmDialogState | null) => ConfirmDialogState | null)) => {
    mocks.dialog = typeof value === 'function' ? value(mocks.dialog) : value;
  }),
}));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request, sessionVersion: () => mocks.auth } }));
vi.mock('@/components/hosting/releasePushTarget', () => ({ resolveReleasePushTarget: async () => ({ origin: ['https://forge.example/team/repo.git'] }) }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select({ triggerRefresh: mocks.refresh }),
  useUIStore: (select: (state: unknown) => unknown) => select({ setConfirmDialog: mocks.setDialog }),
  useAppStateReader: () => () => ({ repository: { activeRepo: mocks.activeRepo } }),
}));
vi.mock('@/services/appClient', () => ({ appClient: { selectFiles: async () => ['C:/one.zip', 'C:/two.zip'] } }));

const oid = 'a'.repeat(40);
const repository: HostedRepository = {
  ref: { connectionId: 'forgejo', repositoryId: '1', fullPath: 'team/repo' },
  name: 'repo',
  fullName: 'team/repo',
  description: null,
  cloneUrl: 'https://forge.example/team/repo.git',
  htmlUrl: 'https://forge.example/team/repo',
  defaultBranch: 'main',
  private: true,
  fork: false,
};
const capabilities = { releases: 'native', releaseAssets: true, draftRelease: true, prerelease: true } as HostingCapabilities;
const context = {
  existingTags: ['v1.0.0'],
  lastReleaseTag: 'v1.0.0',
  repositoryHtmlUrl: repository.htmlUrl,
  targetOid: oid,
  commitsTarget: 'release',
  commitsSinceLastRelease: [],
  fallbackUsed: false,
};
const synchronized: HostingReleaseTarget = {
  inspectionId: 'checked',
  targetBranch: 'release',
  localSha: oid,
  remoteSha: oid,
  ahead: 0,
  behind: 0,
  canPush: false,
  canReleaseRemote: true,
  pushBlockedReason: null,
};
const release = { id: 'created', tagName: 'v1.0.1', name: 'Release v1.0.1', htmlUrl: '', draft: false, prerelease: false };
let root: Root;
let hook: ReturnType<typeof useReleasePublication>;
let session: ReleaseSession;
let edit: (update: (previous: ReleaseSession) => ReleaseSession) => void;
let initial: ReleaseSession;
function Harness({ scope = 'repo+forgejo+release' }: { scope?: string }) {
  const [value, update] = useState(initial);
  session = value;
  edit = update;
  hook = useReleasePublication({
    scope,
    repoPath: 'C:/repo',
    remoteName: 'origin',
    endpointUrl: repository.cloneUrl,
    repository,
    capabilities,
    session: value,
    context,
    update,
    refresh: async () => {},
  });
  return null;
}
const render = async (scope?: string) =>
  act(async () => {
    root.render(createElement(I18nProvider, { language: 'en' }, createElement(Harness, { scope })));
  });
const flush = async () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve: (value: T) => resolve(value),
  };
}
async function start() {
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.publish();
  });
  return { pending };
}
async function answer(secondary = false) {
  await act(async () => {
    await (secondary ? mocks.dialog?.onSecondaryAction?.() : mocks.dialog?.onConfirm());
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.request.mockReset();
  mocks.setDialog.mockClear();
  mocks.dialog = null;
  mocks.auth = 1;
  mocks.activeRepo = 'C:/repo';
  initial = {
    ...newReleaseSession('release', 'en'),
    form: { ...newReleaseSession('release', 'en').form, tagName: 'v1.0.1', releaseName: 'Release v1.0.1', body: 'manual notes' },
  };
  useRemoteTransferState.setState(initialRemoteTransferState());
  useRemoteTransferDialogState.setState({ dialog: null, cancelledRequest: null });
  mocks.request.mockImplementation(async (operation: string) =>
    operation === 'inspectRelease' ? synchronized : operation === 'createRelease' ? release : true,
  );
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

describe('shared release publication', () => {
  it('publishes a synchronized selected endpoint directly and prevents duplicate clicks', async () => {
    await render();
    const deferredCreate = deferred<typeof release>();
    mocks.request.mockImplementation(async (operation: string) => (operation === 'inspectRelease' ? synchronized : deferredCreate.promise));
    const first = await start();
    await act(async () => hook.publish());
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'createRelease')).toHaveLength(1);
    expect(mocks.dialog).toBeNull();
    await act(async () => {
      deferredCreate.resolve(release);
      await first.pending;
    });
    expect(session.created).toBeNull();
    expect(session.lastCreated).toEqual(release);
    expect(session.form).toMatchObject({ tagName: 'v1.0.2', releaseName: 'Release v1.0.2', body: '', draft: false, prerelease: false });
    expect(mocks.request).toHaveBeenCalledWith(
      'createRelease',
      expect.objectContaining({ repository: repository.ref, remoteName: 'origin', target: 'release', inspectionId: 'checked', body: 'manual notes' }),
    );
  });

  it('pushes the inspected source branch to one endpoint, then inspects again before publishing', async () => {
    mocks.request.mockResolvedValueOnce({ ...synchronized, remoteSha: 'b'.repeat(40), ahead: 2, canPush: true });
    await render();
    const { pending } = await start();
    expect(mocks.dialog?.confirmLabel).toBe('Push and create release');
    await answer();
    const intent = useRemoteTransferDialogState.getState().dialog!;
    expect(intent).toMatchObject({
      repoPath: 'C:/repo',
      sourceBranch: 'release',
      destinationBranch: 'release',
      expectedSourceOid: oid,
      constrainedRemoteNames: ['origin'],
      constrainedTargetUrls: { origin: [repository.cloneUrl] },
      tagNames: [],
    });
    expect(intent.requestId).toBeTruthy();
    await act(async () => {
      useRemoteTransferState.setState({
        intent,
        batch: { id: 'matching', planId: 'captured', repoPath: 'C:/repo', sourceOid: oid, state: 'success', targets: [] },
      });
      await pending;
    });
    expect(mocks.request.mock.calls.map(([operation]) => operation)).toEqual(['inspectRelease', 'inspectRelease', 'createRelease']);
    expect(session.created).toBeNull();
    expect(session.lastCreated).toEqual(release);
  });

  it('can explicitly publish the existing remote revision with unchanged notes', async () => {
    mocks.request.mockResolvedValueOnce({ ...synchronized, ahead: 2, remoteSha: 'b'.repeat(40), canPush: true });
    await render();
    const { pending } = await start();
    expect(mocks.dialog?.consequences).toContain('Notes remain unchanged');
    await answer(true);
    await act(async () => pending);
    expect(useRemoteTransferDialogState.getState().dialog).toBeNull();
    expect(mocks.request).toHaveBeenCalledWith('createRelease', expect.objectContaining({ body: 'manual notes', mode: 'remote' }));
  });

  it('confirms empty notes and preserves the draft after cancellation', async () => {
    initial.form.body = '';
    await render();
    const { pending } = await start();
    expect(mocks.dialog?.confirmLabel).toBe('Create without notes');
    await act(async () => {
      await mocks.dialog?.onCancel?.();
      await pending;
    });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(session.form.tagName).toBe('v1.0.1');
    expect(session.created).toBeNull();
  });

  it('retains the created release and retries only failed assets', async () => {
    initial.assets = ['C:/one.zip', 'C:/two.zip'];
    let uploads = 0;
    mocks.request.mockImplementation(async (operation: string) => {
      if (operation === 'inspectRelease') return synchronized;
      if (operation === 'createRelease') return release;
      if (++uploads === 2) throw new Error('Upload interrupted');
      return true;
    });
    await render();
    await act(async () => hook.publish());
    expect(session.created).toEqual(release);
    expect(session.uploaded).toEqual(['C:/one.zip']);
    expect(hook.error).toContain('two.zip: Upload interrupted');
    await act(async () => hook.retryAssets());
    expect(session.uploaded).toEqual([]);
    expect(session.assets).toEqual([]);
    expect(session.created).toBeNull();
    expect(session.lastCreated).toEqual(release);
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'createRelease')).toHaveLength(1);
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'uploadAsset').map(([, input]) => input.filePath)).toEqual([
      'C:/one.zip',
      'C:/two.zip',
      'C:/two.zip',
    ]);
  });

  it('stops on divergent history and on changed form, account or repository after inspection', async () => {
    mocks.request.mockResolvedValueOnce({ ...synchronized, ahead: 1, behind: 1 });
    await render();
    await act(async () => hook.publish());
    expect(hook.error).toContain('diverged');
    expect(mocks.dialog).toBeNull();
    for (const change of [
      () => edit((previous) => ({ ...previous, form: { ...previous.form, body: 'edited' } })),
      () => {
        mocks.auth++;
      },
      () => {
        mocks.activeRepo = 'C:/other';
      },
    ]) {
      const inspection = deferred<HostingReleaseTarget>();
      mocks.request.mockImplementationOnce(() => inspection.promise);
      const { pending } = await start();
      await act(async () => change());
      await act(async () => {
        inspection.resolve(synchronized);
        await pending;
      });
    }
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'createRelease')).toBe(false);
  });

  it('cancels the corresponding transfer when navigating away', async () => {
    mocks.request.mockResolvedValueOnce({ ...synchronized, ahead: 2, canPush: true });
    await render();
    const { pending } = await start();
    await answer();
    const id = useRemoteTransferDialogState.getState().dialog!.requestId;
    await render('different-repository');
    await pending;
    await flush();
    expect(useRemoteTransferDialogState.getState().cancelledRequest).toBe(id);
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'createRelease')).toBe(false);
  });
});
