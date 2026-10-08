// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostingRepositoryForms } from '../HostingRepositoryForms';
import { useHostingState } from '../hostingState';
import type { HostingConnection } from '@/types/hostingDtos';

const mocks = vi.hoisted(() => ({ run: vi.fn(), request: vi.fn(), close: vi.fn() }));
vi.mock('../useHostingTask', () => ({ useHostingTask: () => ({ busy: false, run: mocks.run, error: null }) }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (value: { activeRepo: null }) => unknown) => select({ activeRepo: null }),
  useUIStore: () => undefined,
}));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => vi.fn() }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));
const account: HostingConnection = {
  id: 'account',
  provider: 'bitbucket-cloud',
  label: 'Work account',
  baseUrl: 'https://bitbucket.org',
  apiBaseUrl: 'https://api.bitbucket.org/2.0',
  authenticated: true,
  hasCredentials: true,
  username: 'person',
  userId: 'user',
};

describe('hosting creation requirements', () => {
  let root: Root;
  let host: HTMLDivElement;
  const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label)!;
  const render = () => act(async () => root.render(createElement(HostingRepositoryForms, { mode: 'create', onClose: mocks.close })));
  const change = async (field: HTMLInputElement | HTMLSelectElement, value: string) =>
    act(async () => {
      const prototype = field.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new window.Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    useHostingState.setState({ connections: [], connectionFilter: '', selected: null, section: 'repositories' });
    mocks.request.mockImplementation(async (_operation, input) => ({
      items: input.parent ? [{ id: 'project', projectKey: 'P', label: 'Project' }] : [{ id: 'workspace', namespace: 'workspace', label: 'Workspace' }],
      nextCursor: null,
    }));
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useHostingState.setState({ connections: [] });
  });
  it('guides an account-less creation to account configuration and never creates a repository', async () => {
    await render();
    expect(button('Create repository').disabled).toBe(true);
    expect(document.body.textContent).toContain('Connect a hosting account first.');
    act(() => button('Connect account').click());
    expect(useHostingState.getState().section).toBe('connections');
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('focuses each missing value and requires an explicit Bitbucket project', async () => {
    useHostingState.setState({ connections: [account] });
    await render();
    act(() => button('Complete field').click());
    expect(document.activeElement?.tagName).toBe('SELECT');
    await change(document.activeElement as HTMLSelectElement, account.id);
    expect(document.body.textContent).toContain('Enter a repository name.');
    act(() => button('Complete field').click());
    expect((document.activeElement as HTMLInputElement).placeholder).toBe('my-project');
    await change(document.activeElement as HTMLInputElement, 'project-name');
    expect(document.body.textContent).toContain('workspace for creation.');
    act(() => button('Complete field').click());
    expect(document.activeElement?.getAttribute('data-creation-field')).toBe('namespace');
    await change(document.activeElement as HTMLSelectElement, 'workspace');
    expect(document.body.textContent).toContain('Select a Bitbucket project explicitly.');
    expect(button('Create repository').disabled).toBe(true);
    act(() => button('Complete field').click());
    expect(document.activeElement?.getAttribute('data-creation-field')).toBe('project');
    await change(document.activeElement as HTMLSelectElement, 'P');
    expect(button('Create repository').disabled).toBe(false);
    expect(button('Complete field')).toBeUndefined();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
