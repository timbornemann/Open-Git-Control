// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedRepositoryRef, RepositoryEndpoint } from '@/types/hostingDtos';
import { useReleaseTarget } from '../useReleaseTarget';
import { useHostingState } from '@/components/hosting/hostingState';

const mocks = vi.hoisted(() => ({ request: vi.fn(), local: null as unknown, accounts: { loading: false, error: null as string | null } }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/components/hosting/useHostingConnections', () => ({ useHostingConnections: () => mocks.accounts }));
vi.mock('@/components/hosting/useRepositoryHosting', () => ({ useRepositoryHosting: () => mocks.local }));
const first: RepositoryEndpoint = {
  remoteName: 'origin',
  url: 'https://forge.example/team/repo.git',
  repository: { connectionId: 'first', repositoryId: '42', fullPath: 'team/repo' },
};
const second: RepositoryEndpoint = {
  remoteName: 'backup',
  url: 'https://github.com/team/repo.git',
  repository: { connectionId: 'second', repositoryId: '42', fullPath: 'team/repo' },
};
let root: Root;
let hook: ReturnType<typeof useReleaseTarget>;
function Harness({ requested = null }: { requested?: HostedRepositoryRef | null }) {
  hook = useReleaseTarget('C:/repo', requested);
  return null;
}
const render = async (requested?: HostedRepositoryRef | null) => act(async () => root.render(createElement(Harness, { requested })));
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  mocks.accounts = { loading: false, error: null };
  mocks.local = { endpoints: [first], repository: null, remoteName: '', loading: false, error: null };
  mocks.request
    .mockReset()
    .mockImplementation(async (operation: string, input: { repository: HostedRepositoryRef }) =>
      operation === 'repository' ? { ref: input.repository } : { releases: 'native' },
    );
  useHostingState.setState({ connections: [] });
});
afterEach(() => act(() => root.unmount()));

describe('release target selection', () => {
  it('does not declare a missing target until accounts and endpoint discovery have both completed', async () => {
    mocks.local = { ...(mocks.local as object), endpoints: [], loading: false };
    mocks.accounts.loading = true;
    await render();
    expect(hook.loading).toBe(true);
    expect(hook.missingTarget).toBe(false);
    mocks.accounts.loading = false;
    mocks.local = { ...(mocks.local as object), loading: true };
    await render();
    expect(hook.missingTarget).toBe(false);
    mocks.local = { ...(mocks.local as object), loading: false };
    await render();
    expect(hook.missingTarget).toBe(true);
    mocks.accounts.error = 'Account access denied';
    await render();
    expect(hook.missingTarget).toBe(false);
    expect(hook.error).toBe('Account access denied');
  });

  it('automatically uses one distinct target and requires a choice for multiple unconfigured targets', async () => {
    mocks.local = {
      ...(mocks.local as object),
      endpoints: [first, { ...first, repository: { fullPath: 'team/repo', repositoryId: '42', connectionId: 'first' } }],
    };
    await render();
    expect(hook.endpoint).toEqual(first);
    expect(hook.choices).toHaveLength(1);
    mocks.local = { ...(mocks.local as object), endpoints: [first, second] };
    await render();
    expect(hook.endpoint).toBeNull();
    expect(hook.missingTarget).toBe(false);
    await act(async () => hook.choose(second));
    expect(hook.repository?.ref).toEqual(second.repository);
    mocks.local = { ...(mocks.local as object), endpoints: [first] };
    await render();
    expect(hook.endpoint).toBeNull();
    expect(hook.repository).toBeNull();
    expect(hook.missingTarget).toBe(true);
  });

  it('honors the configured local target while an explicit hosting request never falls back to another account or namespace', async () => {
    mocks.local = { ...(mocks.local as object), endpoints: [first, second], repository: { ref: second.repository }, remoteName: 'backup' };
    await render();
    expect(hook.endpoint).toEqual(second);
    await render(first.repository);
    expect(hook.endpoint).toEqual(first);
    await render({ ...first.repository!, fullPath: 'other/repo' });
    expect(hook.endpoint).toBeNull();
    await render({ ...first.repository!, connectionId: 'other-account' });
    expect(hook.endpoint).toBeNull();
  });

  it('changes scope for endpoint URL edits and discards metadata that arrives after a target change', async () => {
    let resolve!: (value: unknown) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await render();
    const originalScope = hook.scope;
    mocks.local = { ...(mocks.local as object), endpoints: [second] };
    await render();
    await act(async () => resolve({ ref: first.repository }));
    expect(hook.repository?.ref).toEqual(second.repository);
    mocks.local = { ...(mocks.local as object), endpoints: [{ ...second, url: 'ssh://git@github.com/team/repo.git' }] };
    const priorScope = hook.scope;
    await render();
    expect(hook.scope).not.toBe(priorScope);
    expect(hook.scope).not.toBe(originalScope);
  });
});
