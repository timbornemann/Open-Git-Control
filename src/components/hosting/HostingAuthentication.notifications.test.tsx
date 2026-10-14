// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostingConnectionEditor } from './HostingConnectionEditor';
import { HostingConnections } from './HostingConnections';
import { useHostingState } from './hostingState';
import type { HostingConnection } from '@/types/hostingDtos';

const mocks = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn(), close: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => mocks.toast }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));
const account: HostingConnection = {
  id: 'private-forgejo',
  provider: 'forgejo',
  label: 'Private Forgejo',
  baseUrl: 'https://172.24.3.20',
  apiBaseUrl: 'https://172.24.3.20/api/v1',
  username: null,
  userId: null,
  authenticated: false,
  hasCredentials: true,
  oauth: { clientId: 'desktop', redirectUri: 'http://127.0.0.1:42873/oauth/callback' },
};
const tlsReason = "The TLS certificate for https://172.24.3.20 is not trusted. Install the server's root CA certificate.";
let root: Root;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label)!;
const start = async (method: 'token' | 'browser') => {
  if (method === 'browser') await act(async () => button('Sign in in browser').click());
  else {
    await act(async () => button('Token').click());
    const token = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(token, 'private-token');
      token.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.body.appendChild(document.createElement('div')));
  mocks.toast.mockReset();
  mocks.close.mockReset();
  useHostingState.setState({ connections: [account], selected: null, revision: 0, connectionEditorRequest: null });
  mocks.request.mockReset().mockImplementation(async (operation) => {
    if (operation === 'connections') return [account];
    if (operation === 'saveConnection') return account;
    if (operation === 'cancelAuth') return true;
    throw new Error(tlsReason);
  });
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});
const renderEditor = () => act(async () => root.render(createElement(HostingConnectionEditor, { connection: account, onClose: mocks.close })));

describe('hosting authentication feedback', () => {
  it.each(['token', 'browser'] as const)('shows the %s failure and reason through the application toast without closing the editor', async (method) => {
    await renderEditor();
    await start(method);
    expect(mocks.request).toHaveBeenCalledWith(method === 'token' ? 'login' : 'loginBrowser', expect.objectContaining({ connectionId: account.id }));
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(`Hosting sign-in failed: ${tlsReason}`, true);
    expect(document.querySelector('.hosting-error')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it.each(['token', 'browser'] as const)('still completes a successful %s login', async (method) => {
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((operation, ...args) =>
      ['login', 'loginBrowser'].includes(operation) ? Promise.resolve(account) : normal(operation, ...args),
    );
    await renderEditor();
    await start(method);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('discards a failed OAuth exchange that arrives after the user cancels', async () => {
    let reject!: (error: Error) => void;
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((operation, ...args) =>
      operation === 'loginBrowser'
        ? new Promise((_resolve, rejectPromise) => {
            reject = rejectPromise;
          })
        : normal(operation, ...args),
    );
    await renderEditor();
    await start('browser');
    await act(async () => button('Cancel').click());
    await act(async () => reject(new Error(tlsReason)));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith('cancelAuth', { connectionId: account.id });
  });

  it('reports connection verification failures through the same toast system', async () => {
    await act(async () => root.render(createElement(HostingConnections)));
    await act(async () => button('Verify connection').click());
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(`Hosting operation failed: ${tlsReason}`, true);
    expect(document.querySelector('.hosting-error')).toBeNull();
  });
});
