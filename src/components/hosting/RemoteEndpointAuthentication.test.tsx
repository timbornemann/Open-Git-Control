// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { HostingConnection } from '@/types/hostingDtos';
import { RemoteEndpointAuthentication } from './RemoteEndpointAuthentication';
import type { RemotePreferences } from '@/types/remoteTransfers';

let root: Root | undefined;
const account = {
  id: 'personal',
  provider: 'github',
  label: 'Personal GitHub',
  username: 'alice',
  baseUrl: 'https://github.com',
  apiBaseUrl: 'https://api.github.com',
  authenticated: true,
  hasCredentials: true,
} as HostingConnection;
const url = 'https://github.com/team/project.git';
const repository = { connectionId: account.id, repositoryId: '1', fullPath: 'team/project' };
const callbacks = () => ({ bind: vi.fn(), setCredentialMode: vi.fn(), unbind: vi.fn() });
const button = (host: Element, text: string) => [...host.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text)!;
const renderAccess = async (preferences: RemotePreferences = {}, connections = [account], urls = [url]) => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const actions = callbacks();
  await act(async () =>
    root!.render(
      createElement(I18nProvider, {
        language: 'en',
        children: createElement(RemoteEndpointAuthentication, {
          remote: { name: 'origin', fetchUrls: [urls[0]], pushUrls: urls },
          preferences,
          connections,
          disabled: false,
          ...actions,
        }),
      }),
    ),
  );
  return { host, ...actions };
};
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

it('acknowledges browser sign-in without implying that an unbound working remote needs setup', async () => {
  const { host, bind, setCredentialMode, unbind } = await renderAccess();
  expect(host.textContent).toContain('Signed in to the app: Personal GitHub · alice');
  expect(host.textContent).toContain('Existing Git access');
  expect(host.textContent).toContain('If fetch, pull and push work, there is nothing to set up here.');
  expect(host.textContent).toContain('Assigning it for Git transfers is optional.');
  expect(host.querySelector('input, select')).toBeNull();
  expect(host.textContent).not.toContain('Choose an app account');
  expect(host.textContent).not.toContain('Git access through app account');
  const edit = button(host, 'Change access');
  expect(edit.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(edit.getAttribute('aria-controls')!)).toBeTruthy();
  await act(async () => edit.click());
  expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe(account.id);
  expect(host.querySelector('input')).toBeNull();
  await act(async () => button(host, 'Done').click());
  expect(host.querySelector('select')).toBeNull();
  expect(bind).not.toHaveBeenCalled();
  expect(setCredentialMode).not.toHaveBeenCalled();
  expect(unbind).not.toHaveBeenCalled();
});

it('shows an assigned HTTPS app account as the Git access method without asking for repeated sign-in', async () => {
  const { host } = await renderAccess({ bindings: [{ remoteName: 'origin', url, repository }] });
  expect(host.textContent).toContain('Git access through app account');
  expect(host.textContent).toContain('Personal GitHub · alice · team/project');
  expect(host.textContent).toContain('No further details are needed here.');
  expect(host.querySelector('select, input')).toBeNull();
});

it('keeps explicit system authentication distinct from the signed-in app account', async () => {
  const { host } = await renderAccess({ bindings: [{ remoteName: 'origin', url, repository, credentialMode: 'system' }] });
  expect(host.textContent).toContain('Existing Git access');
  expect(host.textContent).not.toContain('Git access through app account');
});

it('explains SSH access even when the endpoint has an app repository assignment', async () => {
  const endpoint = 'git@github.com:team/project.git';
  const { host } = await renderAccess({ bindings: [{ remoteName: 'origin', url: endpoint, repository }] }, [account], [endpoint]);
  expect(host.textContent).toContain('SSH access');
  expect(host.textContent).toContain('This SSH address uses your SSH key or agent.');
  expect(host.textContent).not.toContain('Git access through app account');
});

it('does not present a required account picker when no app account is available', async () => {
  const { host } = await renderAccess({}, []);
  expect(host.textContent).toContain('Existing Git access');
  await act(async () => button(host, 'Change access').click());
  expect(host.querySelector('input, select')).toBeNull();
  expect(host.textContent).toContain('This is not required when Git/SSH access already works.');
  expect([...host.querySelectorAll('button')].map((candidate) => candidate.textContent)).not.toContain('Assign app account');
});

it('identifies an unavailable assigned account and keeps switching back to Git access possible', async () => {
  const { host, setCredentialMode, unbind } = await renderAccess({ bindings: [{ remoteName: 'origin', url, repository }] }, []);
  expect(host.textContent).toContain('This app account is signed out or no longer available.');
  expect(host.textContent).not.toContain('No further details are needed here.');
  await act(async () => button(host, 'Change access').click());
  await act(async () => {
    const select = host.querySelector('select')!;
    select.value = 'system';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(setCredentialMode).toHaveBeenCalledWith('origin', url, 'system');
  await act(async () => button(host, 'Remove account assignment').click());
  expect(unbind).toHaveBeenCalledWith('origin', url);
});

it('shows the effective access separately for fetch and push endpoints and only assigns on explicit request', async () => {
  const pushUrl = 'https://github.com/team/backup.git';
  const { host, bind } = await renderAccess({ bindings: [{ remoteName: 'origin', url, repository }] }, [account], [url, pushUrl]);
  const endpoints = host.querySelectorAll('.remote-configuration__endpoint-account');
  expect(endpoints).toHaveLength(2);
  expect(endpoints[0].textContent).toContain('Git access through app account');
  expect(endpoints[1].textContent).toContain('Existing Git access');
  await act(async () => button(host, 'Change access').click());
  expect(bind).not.toHaveBeenCalled();
  await act(async () => button(endpoints[1], 'Assign app account').click());
  expect(bind).toHaveBeenCalledExactlyOnceWith('origin', pushUrl, account.id, pushUrl);
});

it('keeps the chosen account and repository URL separate for each remote until binding is requested', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const bind = vi.fn();
  const setCredentialMode = vi.fn();
  const connections = ['one', 'two'].map((id) => ({
    id,
    provider: 'github',
    label: id,
    baseUrl: 'https://github.com',
    apiBaseUrl: 'https://api.github.com',
    authenticated: true,
    username: id,
  })) as HostingConnection[];
  await act(async () =>
    root!.render(
      createElement(I18nProvider, {
        language: 'en',
        children: ['primary', 'backup'].map((name) =>
          createElement(
            'article',
            { key: name, 'data-remote': name },
            createElement(RemoteEndpointAuthentication, {
              remote: { name, fetchUrls: ['git@alias:' + name + '.git'], pushUrls: ['git@alias:' + name + '.git'] },
              preferences: {},
              connections,
              disabled: false,
              bind,
              setCredentialMode,
            }),
          ),
        ),
      }),
    ),
  );
  const primary = host.querySelector<HTMLElement>('[data-remote="primary"]')!;
  const backup = host.querySelector<HTMLElement>('[data-remote="backup"]')!;
  const bindButton = (element: HTMLElement) => button(element, 'Assign app account');
  await act(async () => button(primary, 'Change access').click());
  await act(async () => button(backup, 'Change access').click());
  expect(bindButton(primary).disabled).toBe(true);
  const choose = async (element: HTMLElement, id: string) => {
    await act(async () => {
      const select = element.querySelector('select')!;
      select.value = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  await choose(primary, 'one');
  expect(bindButton(backup).disabled).toBe(true);
  await choose(backup, 'two');
  const url = primary.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(url, 'https://github.com/team/primary');
    url.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(bind).not.toHaveBeenCalled();
  expect(setCredentialMode).not.toHaveBeenCalled();
  await act(async () => bindButton(primary).click());
  expect(bind).toHaveBeenNthCalledWith(1, 'primary', 'git@alias:primary.git', 'one', 'https://github.com/team/primary');
  await act(async () => bindButton(backup).click());
  expect(bind).toHaveBeenNthCalledWith(2, 'backup', 'git@alias:backup.git', 'two', 'git@alias:backup.git');
});
