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
  const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label);
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
    vi.useRealTimers();
  });

  it('shows only host and identity, and adopts the account only after explicit confirmation', async () => {
    await render();
    await openCli();
    expect(document.body.textContent).toContain('Use this GitHub CLI account:');
    expect(document.body.textContent).toContain(identity.username);
    expect(document.body.textContent).toContain(identity.host);
    expect(mocks.request).toHaveBeenCalledWith('inspectCliLogin', { connectionId: account.id });
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'loginWithCli')).toBe(false);
    expect([...document.body.querySelectorAll<HTMLInputElement>('input[type="password"]')].every((input) => input.value === '')).toBe(true);
    expect(mocks.request.mock.calls.map(([operation]) => operation)).toEqual(['connections', 'saveConnection', 'inspectCliLogin', 'connections']);
    await click(button('Connect this account'));
    expect(mocks.request).toHaveBeenCalledWith('loginWithCli', { connectionId: account.id, expectedUsername: identity.username });
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'saveConnection')).toHaveLength(1);
    expect(button('Connect this account')).toBeUndefined();
    expect(useHostingState.getState().connections[0]).toMatchObject({ username: identity.username, authenticated: true });
  });

  it('opens a new account dialog only when requested and cancels without saving a connection', async () => {
    await render();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(button('Add connection'));
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add connection');
    expect(document.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('');
    await click(button('Cancel'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.request.mock.calls.map(([operation]) => operation)).toEqual(['connections']);
  });

  it('closes a successful Device Flow dialog and retains the newly verified account', async () => {
    vi.useFakeTimers();
    accounts = [{ ...account, oauth: { clientId: 'desktop-client', redirectUri: 'http://127.0.0.1:42873/oauth/callback' } }];
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (operation, input) => {
      if (operation === 'startDeviceLogin')
        return { deviceCode: 'temporary-device-code', userCode: 'ABCD-1234', verificationUri: account.baseUrl + '/login/device', interval: 5, expiresIn: 600 };
      if (operation === 'pollDeviceLogin') {
        accounts = [{ ...accounts[0], username: identity.username, authenticated: true, hasCredentials: true }];
        return { status: 'success' };
      }
      return normal(operation, input);
    });
    await render();
    await click(button('Edit'));
    await click(button('Sign in in browser'));
    expect(document.body.textContent).toContain('ABCD-1234');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mocks.request).toHaveBeenCalledWith('pollDeviceLogin', { connectionId: account.id, deviceCode: 'temporary-device-code' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(useHostingState.getState().connections[0]).toMatchObject({ username: identity.username, authenticated: true });
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'cancelAuth')).toBe(false);
  });

  it('cancels a displayed preview and invalidates its main-process authorization', async () => {
    await render();
    await openCli();
    await click(button('Cancel'));
    expect(mocks.request).toHaveBeenCalledWith('cancelAuth', { connectionId: account.id });
    expect(document.body.textContent).not.toContain('Use this GitHub CLI account:');
    expect(button('Connect this account')).toBeUndefined();
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'loginWithCli')).toBe(false);
  });

  it('does not revive a cancelled preview when CLI inspection completes late', async () => {
    const pending = deferred<typeof identity>();
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((operation, input) => (operation === 'inspectCliLogin' ? pending.promise : normal(operation, input)));
    await render();
    await openCli();
    expect(document.body.textContent).toContain('Preparing connection');
    await click(button('Cancel'));
    await act(async () => pending.resolve(identity));
    expect(button('Connect this account')).toBeUndefined();
    expect(document.body.textContent).not.toContain('Use this GitHub CLI account:');
    expect(document.body.textContent).not.toContain('Preparing connection');
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
    await click(button('Cancel'));
    await act(async () => adoption.resolve({ ...account, username: identity.username, authenticated: true, hasCredentials: true }));
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'connections')).toHaveLength(connectionsReads);
    expect(useHostingState.getState().connections[0].authenticated).toBe(false);
    expect(button('Connect this account')).toBeUndefined();
  });
});
