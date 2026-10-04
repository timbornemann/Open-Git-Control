// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedRepository, HostingConnection } from '@/types/hostingDtos';
import { migrateHostingPins, readHostingPins, repositoryPinKey, writeHostingPins } from './hostingPinStore';
import { useHostingState } from './hostingState';
const connection = (id: string, provider: HostingConnection['provider'] = 'github', host = 'https://github.com'): HostingConnection => ({
  id,
  provider,
  baseUrl: host,
  apiBaseUrl: `${host}/api`,
  label: id,
  authenticated: true,
  hasCredentials: true,
  username: 'tim',
  userId: '7',
});
const repo = (id: string): HostedRepository => ({
  ref: { connectionId: id, repositoryId: '42', fullPath: 'tim/repo' },
  fullName: 'tim/repo',
  name: 'repo',
  description: null,
  private: true,
  cloneUrl: 'https://github.com/tim/repo.git',
  htmlUrl: 'https://github.com/tim/repo',
  defaultBranch: 'main',
  fork: false,
});
beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
    clear: () => items.clear(),
  });
  useHostingState.setState({ connections: [], selected: null, section: 'repositories', connectionFilter: '', revision: 0 });
});
afterEach(() => vi.unstubAllGlobals());
describe('hosting navigation and pins', () => {
  it('keeps identical repository ids isolated and removes a signed-out selection', () => {
    const state = useHostingState.getState();
    state.setConnections([connection('github'), connection('forgejo', 'forgejo')]);
    state.select(repo('github'));
    expect(repositoryPinKey(repo('github'))).not.toBe(repositoryPinKey(repo('forgejo')));
    state.setConnections([connection('forgejo', 'forgejo')]);
    expect(useHostingState.getState().selected).toBeNull();
    state.navigate('ci');
    state.setConnectionFilter('forgejo');
    state.refresh();
    expect(useHostingState.getState()).toMatchObject({ section: 'ci', connectionFilter: 'forgejo', revision: 1 });
  });
  it('migrates matching legacy pins per page without repinning an intentional removal', () => {
    localStorage.setItem('ogc.githubPins.v1:github.com:tim', '[42,43]');
    const first = repo('github');
    const otherServer = repo('enterprise');
    const connections = [connection('github'), connection('forgejo', 'forgejo'), connection('enterprise', 'github', 'https://git.example.com')];
    expect(migrateHostingPins(connections, [first, repo('forgejo'), otherServer])).toEqual([repositoryPinKey(first)]);
    writeHostingPins([]);
    const second = { ...repo('github'), ref: { ...repo('github').ref, repositoryId: '43', fullPath: 'tim/later' } };
    expect(migrateHostingPins(connections, [first, second])).toEqual([repositoryPinKey(second)]);
    expect(migrateHostingPins(connections, [first, second])).toEqual([repositoryPinKey(second)]);
  });
  it('accepts corrupt storage and never imports unverified accounts', () => {
    localStorage.setItem('ogc.hostingPins.v1', '{bad');
    expect(readHostingPins()).toEqual([]);
    localStorage.setItem('ogc.hostingPins.v1', '{"x":42}');
    expect(readHostingPins()).toEqual([]);
    localStorage.setItem('ogc.githubPins.v1:github.com:tim', '[42]');
    expect(migrateHostingPins([{ ...connection('github'), authenticated: false }], [repo('github')])).toEqual([]);
    writeHostingPins(['one', 'one']);
    expect(readHostingPins()).toEqual(['one']);
  });
});
