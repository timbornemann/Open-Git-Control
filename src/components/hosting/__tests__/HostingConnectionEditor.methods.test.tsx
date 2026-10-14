// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostingConnectionEditor } from '../HostingConnectionEditor';
import { useHostingState } from '../hostingState';
import type { HostingConnection, HostingConnectionInput } from '@/types/hostingDtos';

const mocks = vi.hoisted(() => ({ request: vi.fn(), close: vi.fn(), toast: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => mocks.toast }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));
const account: HostingConnection = {
  id: 'forge-account',
  provider: 'forgejo',
  label: 'My Forgejo',
  baseUrl: 'https://forge.example',
  apiBaseUrl: 'https://forge.example/api/v1',
  authenticated: false,
  hasCredentials: false,
  username: null,
  userId: null,
};
let root: Root;
let host: HTMLDivElement;
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label);
const field = (label: string) => [...document.body.querySelectorAll('label')].find((element) => element.textContent?.startsWith(label))?.querySelector('input');
const change = (input: HTMLInputElement | undefined | null, value: string) =>
  act(() => {
    expect(input).toBeTruthy();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
const click = async (label: string) => {
  expect(button(label)).toBeTruthy();
  await act(async () => button(label)!.click());
};
const render = (connection = account) => act(async () => root.render(createElement(HostingConnectionEditor, { connection, onClose: mocks.close })));
const savedInput = () => mocks.request.mock.calls.filter(([operation]) => operation === 'saveConnection').at(-1)![1] as HostingConnectionInput;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  mocks.close.mockReset();
  mocks.toast.mockReset();
  useHostingState.setState({ connections: [account], selected: null, revision: 0 });
  mocks.request.mockReset().mockImplementation(async (operation, input) => {
    if (operation === 'saveConnection') return { ...account, ...input };
    if (operation === 'connections') return [account];
    if (['login', 'loginBrowser'].includes(operation)) return { ...account, authenticated: true };
    if (operation === 'cancelAuth') return true;
    throw new Error(`Unexpected operation: ${operation}`);
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('distinct hosting sign-in methods', () => {
  it('shows only the chosen method and explains the secret required by confidential Forgejo applications', async () => {
    await render();
    expect(field('Token')).toBeTruthy();
    expect(field('OAuth Client ID')).toBeUndefined();
    expect(button('Sign in with token')?.disabled).toBe(true);
    expect(button('Sign in in browser')).toBeUndefined();
    await click('Browser (OAuth)');
    expect(field('Token')).toBeUndefined();
    expect(field('OAuth Client ID')).toBeTruthy();
    expect(field('Client Secret')?.type).toBe('password');
    expect(field('Registered callback URL')).toBeTruthy();
    expect(button('Sign in with token')).toBeUndefined();
    expect(document.body.textContent).toContain('If “Confidential client” is enabled in Forgejo');
  });

  it('submits browser login and the application secret even when a token was entered in the other method', async () => {
    await render();
    change(field('Token'), 'unused-personal-token');
    await click('Browser (OAuth)');
    change(field('OAuth Client ID'), 'forgejo-client');
    change(field('Client Secret'), 'application-secret');
    await click('Sign in in browser');
    expect(savedInput()).toMatchObject({ oauth: { clientId: 'forgejo-client' }, clientSecret: 'application-secret' });
    expect(JSON.stringify(savedInput())).not.toContain('unused-personal-token');
    expect(mocks.request).toHaveBeenCalledWith('loginBrowser', { connectionId: account.id });
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'login')).toBe(false);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('keeps token login independent of incomplete OAuth fields and an inactive client-secret draft', async () => {
    await render();
    await click('Browser (OAuth)');
    change(field('OAuth Client ID'), 'unused-browser-draft');
    change(field('Client Secret'), 'unused-application-secret');
    await click('Token');
    change(field('Token'), 'personal-access-token');
    await click('Sign in with token');
    expect(savedInput().clientSecret).toBeUndefined();
    expect(savedInput().oauth).toBeUndefined();
    expect(mocks.request).toHaveBeenCalledWith('login', {
      connectionId: account.id,
      token: 'personal-access-token',
      username: undefined,
      email: undefined,
    });
    expect(mocks.request.mock.calls.some(([operation]) => operation === 'loginBrowser')).toBe(false);
  });

  it('preserves existing OAuth settings while ignoring browser drafts during token sign-in', async () => {
    const oauth = { clientId: 'saved-client', redirectUri: 'http://127.0.0.1:42873/callback' };
    await render({ ...account, oauth });
    change(field('OAuth Client ID'), 'unsaved-client');
    change(field('Client Secret'), 'unsaved-application-secret');
    await click('Token');
    change(field('Token'), 'personal-access-token');
    await click('Sign in with token');
    expect(savedInput().oauth).toEqual(oauth);
    expect(savedInput().clientSecret).toBeUndefined();
  });

  it.each(['Token', 'Browser (OAuth)'])('preserves saving without authentication in %s mode', async (mode) => {
    await render();
    await click(mode);
    await click('Save without signing in');
    expect(mocks.request.mock.calls.map(([operation]) => operation)).toEqual(['saveConnection', 'connections']);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('keeps a saved application secret for a retry without requiring it to be entered again', async () => {
    let storedSecret: string | undefined;
    let attempts = 0;
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (operation, input) => {
      if (operation === 'saveConnection') storedSecret = input.clientSecret ?? storedSecret;
      if (operation === 'loginBrowser') {
        expect(storedSecret).toBe('application-secret');
        if (++attempts === 1) throw new Error('OAuth sign-in failed (400, invalid_grant). Start a new browser sign-in.');
      }
      return normal(operation, input);
    });
    await render();
    await click('Browser (OAuth)');
    change(field('OAuth Client ID'), 'forgejo-client');
    change(field('Client Secret'), 'application-secret');
    await click('Sign in in browser');
    expect(mocks.toast).toHaveBeenCalledOnce();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(field('Client Secret')?.value).toBe('');
    expect(field('Client Secret')?.placeholder).toBe('Leave blank to keep');
    await click('Sign in in browser');
    expect(savedInput().clientSecret).toBeUndefined();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
