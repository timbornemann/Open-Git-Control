// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitRemoteSnapshotDto, RemoteMutation } from '@/types/remoteTransfers';
import { RemoteConfigurationView } from './RemoteConfigurationView';

const mocks = vi.hoisted(() => ({ transfer: vi.fn(), hosting: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mocks.transfer }, hostingClient: { request: mocks.hosting } }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en, t: (key: string) => key }) }));
let current: GitRemoteSnapshotDto;
let root: Root, host: HTMLDivElement;
const render = (repoPath = 'C:/repo') => act(async () => root.render(createElement(RemoteConfigurationView, { repoPath })));
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text)!;
const input = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const click = (text: string) =>
  act(async () => {
    expect(button(text)).toBeTruthy();
    button(text).click();
  });
const change = (field: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
const submit = (field: HTMLInputElement) =>
  act(async () => {
    field.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
const mutations = () => mocks.transfer.mock.calls.filter(([operation]) => operation === 'editRemote');
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  current = {
    repoPath: 'C:/repo',
    branch: 'main',
    upstream: { remote: 'origin', branch: 'main' },
    defaultPushRemote: 'origin',
    supportsPushUrlIsolation: true,
    remotes: [{ name: 'origin', fetchUrls: ['https://forge.example/team/repo.git'], pushUrls: ['https://push.example/team/repo.git'] }],
  };
  mocks.hosting.mockReset().mockResolvedValue([]);
  mocks.transfer.mockReset().mockImplementation(async (operation, data) => {
    if (operation === 'getRemotes') return structuredClone({ ...current, repoPath: data.repoPath });
    if (operation === 'getPreferences') return {};
    if (operation === 'getPullConfiguration') return { branch: 'main', rebase: null, fastForward: null, mergeOptions: null };
    if (operation === 'editRemote') {
      const mutation = data.mutation as RemoteMutation;
      if (mutation.action === 'add') current.remotes.push({ name: mutation.name, fetchUrls: [mutation.url!], pushUrls: [mutation.url!] });
      if (mutation.action === 'set-url')
        current.remotes.find((remote) => remote.name === mutation.name)!.fetchUrls = [mutation.url!.replace(/^forge:/, 'https://forge.example/')];
      return structuredClone(current);
    }
    throw new Error(`Unexpected transfer: ${operation}`);
  });
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('direct remote configuration editing', () => {
  it('opens the add form from Transfers and adds further remotes with unused name suggestions', async () => {
    await render();
    expect(input('New remote name').closest('[hidden]')).not.toBeNull();
    await click('Add remote');
    let name = input('New remote name');
    expect(name.closest('[hidden]')).toBeNull();
    expect(name.closest('details')?.open).toBe(true);
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe('backup');
    change(input('New remote URL'), 'https://forge.example/team/second.git');
    await submit(name);
    expect(mocks.transfer).toHaveBeenCalledWith('editRemote', {
      repoPath: 'C:/repo',
      mutation: { action: 'add', name: 'backup', url: 'https://forge.example/team/second.git' },
    });
    name = input('New remote name');
    expect(name.value).toBe('backup2');
    expect(input('New remote URL').value).toBe('');
    change(input('New remote URL'), 'git@forge.example:team/third.git');
    await submit(name);
    expect(current.remotes.map((remote) => remote.name)).toEqual(['origin', 'backup', 'backup2']);
    expect(input('New remote name').value).toBe('backup3');
    expect(current.upstream).toEqual({ remote: 'origin', branch: 'main' });
    expect(current.defaultPushRemote).toBe('origin');
    expect(mocks.hosting.mock.calls.every(([operation]) => operation === 'connections')).toBe(true);
    expect(mocks.transfer.mock.calls.some(([operation]) => ['fetch', 'pull', 'planPush', 'executePush'].includes(operation))).toBe(false);
  });

  it('edits the address without opening advanced settings, preserves push URLs and reflects canonical Git URLs', async () => {
    await render();
    await click('Connections & accounts');
    let field = input('Fetch URL for origin');
    expect(field.closest('details')).toBeNull();
    expect(field.closest('[hidden]')).toBeNull();
    change(field, '  forge:team/renamed.git  ');
    await submit(field);
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0][1].mutation).toEqual({ action: 'set-url', name: 'origin', url: 'forge:team/renamed.git' });
    field = input('Fetch URL for origin');
    expect(field.value).toBe('https://forge.example/team/renamed.git');
    expect(field.closest('form')?.querySelector('button')?.disabled).toBe(true);
    expect(current.remotes[0].pushUrls).toEqual(['https://push.example/team/repo.git']);
    await submit(field);
    change(field, '   ');
    await submit(field);
    expect(mutations()).toHaveLength(1);
    expect(current.upstream).toEqual({ remote: 'origin', branch: 'main' });
  });

  it('does not carry an open add form or address draft into another repository', async () => {
    await render('C:/one');
    await click('Add remote');
    change(input('New remote URL'), 'https://forge.example/private/draft.git');
    await render('C:/two');
    expect(input('New remote name').closest('details')?.open).toBe(false);
    expect(input('New remote URL').value).toBe('');
    expect(mutations()).toHaveLength(0);
  });
});
