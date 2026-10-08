// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostingConnectionEditor } from '../HostingConnectionEditor';
import type { HostingConnection } from '@/types/hostingDtos';
import { useSystemTools } from '@/app/state/systemToolsStore';

const task = vi.hoisted(() => ({ busy: false, run: vi.fn(), cancel: vi.fn(), setError: vi.fn(), error: null }));
vi.mock('../useHostingTask', () => ({ useHostingTask: () => task }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));
const account: HostingConnection = {
  id: 'selected-account',
  provider: 'forgejo',
  label: 'My forge',
  baseUrl: 'https://forge.example',
  apiBaseUrl: 'https://forge.example/api/v1',
  username: null,
  userId: null,
  hasCredentials: false,
  authenticated: false,
};
describe('sign-in prerequisites', () => {
  let root: Root;
  let host: HTMLDivElement;
  const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label)!;
  const render = (connection = account) => act(() => root.render(createElement(HostingConnectionEditor, { connection, onClose: vi.fn() })));
  const change = (field: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    task.busy = false;
    task.run.mockClear();
    useSystemTools.setState({ status: null, dialogOpen: false });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useSystemTools.setState({ status: null, dialogOpen: false });
  });
  it('opens and focuses the OAuth client field without starting or saving an authentication', () => {
    render();
    const login = button('Sign in in browser');
    expect(login.disabled).toBe(true);
    expect(document.body.textContent).toContain('Browser sign-in requires an OAuth client ID / consumer key.');
    act(() => {
      login.click();
      button('Configure OAuth').click();
    });
    const details = document.querySelector('details')!;
    const field = [...details.querySelectorAll('label')].find((label) => label.textContent?.includes('OAuth Client ID'))!.querySelector('input')!;
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(field);
    change(field, '   ');
    expect(button('Sign in in browser').disabled).toBe(true);
    change(field, 'desktop-client');
    expect(button('Sign in in browser').disabled).toBe(false);
    expect(button('Configure OAuth')).toBeUndefined();
    expect(task.run).not.toHaveBeenCalled();
  });
  it('identifies a missing callback rather than a missing client ID', () => {
    render({ ...account, oauth: { clientId: 'configured', redirectUri: '' } });
    expect(button('Sign in in browser').disabled).toBe(true);
    expect(document.body.textContent).toContain('Browser sign-in requires the registered callback URL.');
    act(() => button('Configure OAuth').click());
    const field = document.activeElement as HTMLInputElement;
    expect(field.closest('label')?.textContent).toContain('Registered callback URL');
    change(field, 'http://127.0.0.1:42873/oauth/callback');
    expect(button('Sign in in browser').disabled).toBe(false);
    expect(task.run).not.toHaveBeenCalled();
  });
  it('requires explicit administrator callback approval and only focuses the setting', () => {
    render({ ...account, provider: 'bitbucket-data-center', oauth: { clientId: 'configured', redirectUri: 'http://127.0.0.1:42873/oauth/callback' } });
    act(() => button('Configure OAuth').click());
    const checkbox = document.activeElement as HTMLInputElement;
    expect(checkbox.type).toBe('checkbox');
    expect(checkbox.checked).toBe(false);
    expect(button('Sign in in browser').disabled).toBe(true);
    act(() => checkbox.click());
    expect(button('Sign in in browser').disabled).toBe(false);
    expect(task.run).not.toHaveBeenCalled();
  });
  it('opens optional tool management for unavailable CLI and does not require a callback for device login', () => {
    useSystemTools.setState({
      status: {
        platform: 'win32',
        checkedAt: 1,
        installation: null,
        tools: [{ id: 'github-cli', state: 'missing', required: false, downloadUrl: '', instructionsUrl: '' }],
      },
    });
    render({ ...account, provider: 'github', oauth: { clientId: 'configured', redirectUri: '' } });
    expect(button('Sign in in browser').disabled).toBe(false);
    expect(button('GitHub CLI').disabled).toBe(true);
    act(() => button('Open tools').click());
    expect(useSystemTools.getState()).toMatchObject({ dialogOpen: true, selectedTool: 'github-cli' });
    expect(task.run).not.toHaveBeenCalled();
    act(() => useSystemTools.setState({ status: null }));
    expect(button('GitHub CLI').disabled).toBe(false);
  });
  it('keeps operation locks without presenting unavailable configuration actions while busy', () => {
    task.busy = true;
    render();
    expect(button('Sign in in browser').disabled).toBe(true);
    expect(button('Configure OAuth')).toBeUndefined();
    expect(document.body.textContent).toContain('Preparing connection');
  });
});
