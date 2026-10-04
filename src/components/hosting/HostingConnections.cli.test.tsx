// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostingConnection } from '@/types/hostingDtos';
import { HostingConnections } from './HostingConnections';
import { useHostingState } from './hostingState';

const mocks = vi.hoisted(() => ({ request: vi.fn<(operation: string, input?: unknown) => Promise<unknown>>() }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/services/appClient', () => ({ appClient: { openExternalUrl: vi.fn() } }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));

const account: HostingConnection = {
  id: 'enterprise-account',
  provider: 'github',
  label: 'Corporate GitHub',
  baseUrl: 'https://github.corp.example',
  apiBaseUrl: 'https://github.corp.example/api/v3',
  username: null,
  userId: null,
  authenticated: false,
  hasCredentials: false,
};
const identity = { username: 'actual-cli-user', host: 'github.corp.example' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('GitHub CLI account preview', () => {
  let host: HTMLDivElement;
  let root: Root;
  let accounts: HostingConnection[];
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label);
  const click = async (element: Element | undefined) => {
    expect(element).toBeTruthy();
    await act(async () => (element as HTMLElement).click());
  };
  const openCli = async () => {
    await click(button('Edit'));
    await click(button('GitHub CLI'));
  };
  const render = () => act(async () => root.render(createElement(HostingConnections)));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    accounts = [{ ...account }];
    useHostingState.setState({ connections: [], selected: null, section: 'connections', connectionFilter: '', revision: 0 });
    mocks.request.mockReset().mockImplementation(async (operation, input) => {
      if (operation === 'connections') return accounts;
      if (operation === 'saveConnection') return { ...account, ...(input as Record<string, unknown>) };
      if (operation === 'inspectCliLogin') return identity;
      if (operation === 'cancelAuth') return true;
      if (operation === 'loginWithCli') {
        accounts = [{ ...account, username: identity.username, userId: 'verified-user-id', authenticated: true, hasCredentials: true }];
        return accounts[0];
      }
      throw new Error(`The UI must not read CLI tokens or invoke unexpected operations: ${operation}`);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('shows only host and identity, and adopts the account only after explicit confirmation', async () => {
    await render();
    await openCli();
    expect(host.textContent).toContain('Use this GitHub CLI account:');
    expect(host.textContent).toContain(identity.username);
    expect(host.textContent).toContain(identity.host);
    expect(mocks.request).toHaveBeenCalledWith('inspectCliLogin', { connectionId: account.id });
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'loginWithCli')).toBe(false);
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="password"]')].every((input) => input.value === '')).toBe(true);
    expect(mocks.request.mock.calls.map(([operation]) => operation)).toEqual(['connections', 'saveConnection', 'inspectCliLogin', 'connections']);
    await click(button('Connect this account'));
    expect(mocks.request).toHaveBeenCalledWith('loginWithCli', { connectionId: account.id, expectedUsername: identity.username });
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'saveConnection')).toHaveLength(1);
    expect(button('Connect this account')).toBeUndefined();
    expect(useHostingState.getState().connections[0]).toMatchObject({ username: identity.username, authenticated: true });
  });

  it('cancels a displayed preview and invalidates its main-process authorization', async () => {
    await render();
    await openCli();
    await click(button('Cancel / new account'));
    expect(mocks.request).toHaveBeenCalledWith('cancelAuth', { connectionId: account.id });
    expect(host.textContent).not.toContain('Use this GitHub CLI account:');
    expect(button('Connect this account')).toBeUndefined();
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'loginWithCli')).toBe(false);
  });

  it('does not revive a cancelled preview when CLI inspection completes late', async () => {
    const pending = deferred<typeof identity>();
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((operation, input) => (operation === 'inspectCliLogin' ? pending.promise : normal(operation, input)));
    await render();
    await openCli();
    expect(host.textContent).toContain('Preparing connection');
    await click(button('Cancel / new account'));
    await act(async () => pending.resolve(identity));
    expect(button('Connect this account')).toBeUndefined();
    expect(host.textContent).not.toContain('Use this GitHub CLI account:');
    expect(host.textContent).not.toContain('Preparing connection');
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'loginWithCli')).toBe(false);
  });

  it('ignores a late adoption result after cancellation instead of restoring the old account view', async () => {
    const adoption = deferred<HostingConnection>();
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((operation, input) => (operation === 'loginWithCli' ? adoption.promise : normal(operation, input)));
    await render();
    await openCli();
    await click(button('Connect this account'));
    const connectionsReads = mocks.request.mock.calls.filter(([operation]) => operation === 'connections').length;
    await click(button('Cancel / new account'));
    await act(async () => adoption.resolve({ ...account, username: identity.username, authenticated: true, hasCredentials: true }));
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'connections')).toHaveLength(connectionsReads);
    expect(useHostingState.getState().connections[0].authenticated).toBe(false);
    expect(button('Connect this account')).toBeUndefined();
  });
});
