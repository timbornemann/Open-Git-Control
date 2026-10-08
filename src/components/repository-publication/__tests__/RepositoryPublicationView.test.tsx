// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { NotificationProvider } from '@/contexts/NotificationContext';
import type { PublicationContext, PublicationSelection, RepositoryPublication } from '@/types/repositoryPublication';
import type { HostingConnection, HostedRepository } from '@/types/hostingDtos';
import { useHostingState } from '@/components/hosting/hostingState';
import { usePublicationDraftState } from '../publicationDraftState';
import { RepositoryPublicationView } from '../RepositoryPublicationView';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  transfer: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
  showBranchCreator: vi.fn(),
  ui: { setActiveTab: vi.fn(), onOpenRemoteConfig: vi.fn() },
  gitReady: true,
  notifications: { publish: vi.fn(() => 1), update: vi.fn(() => true), dismiss: vi.fn() },
}));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request, sessionVersion: () => 1 } }));
vi.mock('@/components/hosting/useHostingConnections', () => ({ useHostingConnections: () => {} }));
vi.mock('@/components/hosting/awaitRemoteTransfer', () => ({ awaitRemoteTransfer: mocks.transfer }));
vi.mock('@/services/appClient', () => ({ appClient: { openExternalUrl: vi.fn() } }));
vi.mock('@/app/state/systemToolsStore', () => ({ useGitAvailable: () => mocks.gitReady, openSystemTools: vi.fn() }));
const repositoryContext = { onToast: mocks.toast, onSetCreatingBranch: mocks.showBranchCreator };
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (s: unknown) => unknown) => select({ triggerRefresh: mocks.refresh }),
  useUIStore: (select: (s: unknown) => unknown) => select(mocks.ui),
  useOptionalRepositoryContext: () => repositoryContext,
}));
const oid = 'a'.repeat(40);
const connection: HostingConnection = {
  id: 'account',
  provider: 'github',
  label: 'Alice',
  baseUrl: 'https://github.com',
  apiBaseUrl: 'https://api.github.com',
  username: 'alice',
  userId: '7',
  authenticated: true,
  hasCredentials: true,
};
const hosted: HostedRepository = {
  ref: { connectionId: connection.id, repositoryId: '42', fullPath: 'alice/project' },
  name: 'project',
  fullName: 'alice/project',
  cloneUrl: 'https://github.com/alice/project.git',
  htmlUrl: 'https://github.com/alice/project',
  private: true,
  defaultBranch: 'main',
  fork: false,
};
let context: PublicationContext, saved: RepositoryPublication | null;
let root: Root, container: HTMLDivElement;
const flush = async () =>
  act(async () => {
    for (let i = 0; i < 15; i++) await Promise.resolve();
  });
const render = async (repoPath = 'C:/project', requestedConnectionId = 'account') =>
  act(async () =>
    root.render(
      createElement(
        I18nProvider,
        { language: 'en' },
        createElement(
          NotificationProvider,
          { value: mocks.notifications },
          createElement(RepositoryPublicationView, { key: repoPath, repoPath, requestedConnectionId }),
        ),
      ),
    ),
  );
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!;
const click = async (text: string) => {
  expect(button(text), text).toBeTruthy();
  await act(async () => button(text).click());
  await flush();
};
const setSelect = async (label: string, value: string) =>
  act(async () => {
    const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
const setText = async (label: string, value: string) =>
  act(async () => {
    const element = [...container.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gitReady = true;
  saved = null;
  context = {
    snapshot: { repoPath: 'C:/project', branch: 'main', upstream: null, defaultPushRemote: null, supportsPushUrlIsolation: true, remotes: [] },
    branches: [
      { name: 'main', oid },
      { name: 'feature', oid: 'b'.repeat(40) },
    ],
    tags: [{ name: 'v1', oid }],
    dirtyFiles: 0,
    publications: [],
  };
  useHostingState.setState({ connections: [connection, { ...connection, id: 'second', username: 'bob', userId: '8' }] });
  usePublicationDraftState.setState({ drafts: {} });
  mocks.request.mockImplementation(async (operation: string, input: { selection: PublicationSelection; inspectOnly?: boolean }) => {
    if (operation === 'publicationContext') return context;
    if (operation === 'creationTargets')
      return { items: [{ id: 'alice', namespace: 'alice', label: 'alice', kind: 'personal', visibility: ['private', 'public'] }], nextCursor: null };
    if (operation === 'preparePublication') {
      saved = {
        id: 'publication',
        selection: input.selection,
        stage: 'prepared',
        branches: input.selection.branches.map((b) => ({ ...b, sourceOid: oid })),
        tags: input.selection.tagNames.map((name) => ({ name, oid })),
        commitCount: 1,
        createdAt: '',
        updatedAt: '',
      };
      return saved;
    }
    if (operation === 'connectPublication') {
      saved = { ...saved!, stage: 'connected', repository: hosted, remoteUrl: hosted.cloneUrl };
      return saved;
    }
    if (operation === 'finishPublication') {
      if (input.inspectOnly) return saved;
      saved = { ...saved!, stage: 'complete' };
      return saved;
    }
    return true;
  });
  mocks.transfer.mockResolvedValue({ state: 'success' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('shared publication wizard', () => {
  it('reviews before creating and sends only captured branches, tags and the new endpoint to the coordinator', async () => {
    await render();
    await flush();
    await setSelect('Account, organization or namespace', 'alice');
    await click('Next');
    expect(container.textContent).toContain('origin is the usual first connection');
    expect(mocks.request.mock.calls.some(([op]) => op === 'connectPublication')).toBe(false);
    await click('Review selection');
    expect(container.textContent).toContain('1 Commits');
    expect(mocks.transfer).not.toHaveBeenCalled();
    await click('Create and publish');
    expect(mocks.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        constrainedRemoteNames: ['origin'],
        constrainedTargetUrls: { origin: [hosted.cloneUrl] },
        branchTargets: [{ sourceBranch: 'main', destinationBranch: 'main', sourceOid: oid }],
        tagNames: [],
        expectedTagRefs: [],
      }),
      expect.any(AbortSignal),
    );
    expect(container.textContent).toContain('Repository published');
    expect(mocks.notifications.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
    await click('Publish another repository');
    expect(container.querySelector('input')?.value).toBe('project');
    expect(button('Next')).toBeTruthy();
  });
  it('retains separate drafts across back navigation, repositories and accounts', async () => {
    await render();
    await flush();
    await setText('Repository name', 'alice-project');
    await setSelect('Provider, server and account', 'second');
    await setText('Repository name', 'bob-project');
    await setSelect('Provider, server and account', 'account');
    expect(container.querySelector('input')?.value).toBe('alice-project');
    await render('C:/another');
    await flush();
    expect(container.querySelector('input')?.value).toBe('another');
    await render();
    await flush();
    expect(container.querySelector('input')?.value).toBe('alice-project');
    expect(mocks.transfer).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.some(([op]) => op === 'connectPublication')).toBe(false);
  });
  it('keeps existing defaults unless explicitly selected and displays dirty files without auto-committing', async () => {
    context.snapshot.remotes = [{ name: 'origin', fetchUrls: ['https://old.invalid/repo.git'], pushUrls: ['https://old.invalid/repo.git'] }];
    context.dirtyFiles = 2;
    await render();
    await flush();
    await setSelect('Account, organization or namespace', 'alice');
    await click('Next');
    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('github');
    expect(container.textContent).toContain('2 uncommitted file changes');
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((e) => e.closest('label')?.textContent?.includes('Use as new primary'))
        ?.checked,
    ).toBe(false);
    expect(button('Open staging')).toBeTruthy();
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it('separates drafts when the authenticated identity of an existing connection changes', async () => {
    await render();
    await flush();
    await setText('Repository name', 'alice-draft');
    await act(async () => useHostingState.setState({ connections: [{ ...connection, username: 'carol', userId: '19' }] }));
    expect(container.querySelector('input')?.value).toBe('project');
    await act(async () => useHostingState.setState({ connections: [connection] }));
    expect(container.querySelector('input')?.value).toBe('alice-draft');
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it('allows create and connect for unborn repositories', async () => {
    context.branches = [];
    context.tags = [];
    await render();
    await flush();
    await setSelect('Account, organization or namespace', 'alice');
    await click('Next');
    await click('Review selection');
    expect(button('Create and connect')).toBeTruthy();
    await click('Create and connect');
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it('requires a branch for detached HEAD and opens the existing sidebar branch creation workflow', async () => {
    context.snapshot.branch = '';
    context.branches = [];
    await render();
    await flush();
    await setSelect('Account, organization or namespace', 'alice');
    await click('Next');
    expect(container.textContent).toContain('Detached HEAD: choose a local branch');
    expect(button('Review selection').disabled).toBe(true);
    await click('Create branch');
    expect(mocks.showBranchCreator).toHaveBeenCalledWith(true);
    expect(mocks.request.mock.calls.some(([op]) => op === 'preparePublication')).toBe(false);
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it('shows persisted setup failure and resumes without uploading the confirmed refs again', async () => {
    const original = mocks.request.getMockImplementation()!;
    let failed = false;
    mocks.request.mockImplementation(async (op, input) => {
      if (op === 'connectPublication' && failed) return saved;
      if (op === 'finishPublication') {
        if (input.inspectOnly && failed) return { ...saved!, stage: 'uploaded' };
        if (!input.inspectOnly && !failed) {
          failed = true;
          saved = { ...saved!, stage: 'setup-pending', updatedAt: '2026-10-08T10:00:00.000Z' };
          context = { ...context, publications: [saved] };
          throw new Error('Default branch update failed');
        }
      }
      return original(op, input);
    });
    await render();
    await flush();
    await setSelect('Account, organization or namespace', 'alice');
    await click('Next');
    await click('Review selection');
    await click('Create and publish');
    expect(container.textContent).toContain('Upload verified · Setup pending');
    expect(mocks.notifications.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'error', msg: 'Default branch update failed' }));
    await click('Resume publication');
    expect(mocks.transfer).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Repository published');
  });
  it('never shows a success or continues publication after cancelled creation', async () => {
    let resolve!: (value: RepositoryPublication) => void;
    await render();
    await flush();
    await setSelect('Account, organization or namespace', 'alice');
    await click('Next');
    await click('Review selection');
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((op, input) =>
      op === 'connectPublication'
        ? new Promise<RepositoryPublication>((done) => {
            resolve = done;
          })
        : original(op, input),
    );
    await act(async () => {
      button('Create and publish').click();
    });
    await click('Cancel');
    await act(async () => resolve({ ...saved!, stage: 'created', repository: hosted }));
    await flush();
    expect(mocks.transfer).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.some(([op]) => op === 'finishPublication')).toBe(false);
    expect(mocks.notifications.publish).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });
});
