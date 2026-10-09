// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { HostingConnection } from '@/types/hostingDtos';
import { RemoteEndpointAuthentication } from './RemoteEndpointAuthentication';

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
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
  const bindButton = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Bind account to this endpoint'))!;
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
