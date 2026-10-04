import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostingClient, HostingRequestError, transferClient } from '../hostingClient';
import { queryClient } from '@/data/queryClient';

const hostingRequest = vi.fn();
const remoteTransferRequest = vi.fn();
beforeEach(() => {
  queryClient.clear();
  hostingRequest.mockReset();
  remoteTransferRequest.mockReset();
  vi.stubGlobal('window', { electronAPI: { hosting: { hostingRequest }, transfers: { remoteTransferRequest } } });
});
afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});
const repository = (connectionId: string) => ({ connectionId, repositoryId: '7', fullPath: 'group/sub/repo' });
describe('hosting client identity and lifecycle', () => {
  it('separates identical repository ids on different accounts and namespaces', async () => {
    hostingRequest.mockImplementation(async (_operation, input) => ({ success: true, data: input.repository }));
    const first = await hostingClient.request('repository', { repository: repository('one') });
    const second = await hostingClient.request('repository', { repository: repository('two') });
    const third = await hostingClient.request('repository', { repository: { ...repository('one'), fullPath: 'other/repo' } });
    expect(first.ref ?? first).not.toEqual(second.ref ?? second);
    expect(third).toMatchObject({ fullPath: 'other/repo' });
    await hostingClient.request('repository', { repository: repository('one') });
    expect(hostingRequest).toHaveBeenCalledTimes(3);
  });
  it('rejects an old response after logout while retaining other account caches', async () => {
    let finish!: (value: unknown) => void;
    hostingRequest.mockImplementation((operation, input) =>
      operation === 'repository' && input.repository.connectionId === 'race'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ success: true, data: true }),
    );
    await hostingClient.request('repository', { repository: repository('other') });
    const old = hostingClient.request('repository', { repository: repository('race') });
    const rejected = expect(old).rejects.toBeDefined();
    await hostingClient.request('logout', { connectionId: 'race' });
    finish({ success: true, data: { name: 'old account' } });
    await rejected;
    const calls = hostingRequest.mock.calls.length;
    await hostingClient.request('repository', { repository: repository('other') });
    expect(hostingRequest).toHaveBeenCalledTimes(calls);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .some((query) => JSON.stringify(query.queryKey).includes('old account')),
    ).toBe(false);
  });
  it('invalidates writes, accepts context-free lists and noncached logs', async () => {
    hostingRequest.mockResolvedValue({ success: true, data: [] });
    await hostingClient.request('connections', undefined);
    await hostingClient.request('repository', { repository: repository('write') });
    await hostingClient.request('dispatch', { repository: repository('write'), workflow: 'ci.yml', ref: 'main' });
    await hostingClient.request('repository', { repository: repository('write') });
    await hostingClient.request('logs', { repository: repository('write'), runId: '1' });
    await hostingClient.request('downloadArtifact', { repository: repository('write'), runId: '1', artifactId: '1' });
    await hostingClient.request('startDeviceLogin', { connectionId: 'write' });
    await hostingClient.request('saveConnection', { id: 'write', label: 'one', provider: 'github', baseUrl: 'https://github.com' });
    expect(hostingRequest).toHaveBeenCalledTimes(8);
  });
  it('rejects an old account-list snapshot after a connection logs out', async () => {
    let finish!: (value: unknown) => void;
    hostingRequest.mockImplementation((operation) =>
      operation === 'connections'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ success: true, data: true }),
    );
    const pending = hostingClient.request('connections', undefined);
    const rejected = expect(pending).rejects.toThrow('account changed');
    await hostingClient.request('logout', { connectionId: 'list-race' });
    finish({ success: true, data: [{ authenticated: true }] });
    await rejected;
  });
  it.each(['success', 'pending'])('invalidates account snapshots only after device login %s', async (status) => {
    let finish!: (value: unknown) => void;
    hostingRequest.mockImplementation((operation) =>
      operation === 'connections'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ success: true, data: { status } }),
    );
    const pending = hostingClient.request('connections', undefined);
    const assertion = status === 'success' ? expect(pending).rejects.toThrow('account changed') : expect(pending).resolves.toEqual([]);
    await hostingClient.request('pollDeviceLogin', { connectionId: 'device-race', deviceCode: 'code' });
    finish({ success: true, data: [] });
    await assertion;
  });
  it.each([
    [501, 'unsupported'],
    [405, 'unsupported'],
    [401, 'permission'],
    [403, 'permission'],
    [409, 'disabled'],
    [503, 'unavailable'],
    [429, 'unavailable'],
    [400, 'invalid'],
    [undefined, 'unavailable'],
  ])('preserves the failure category for %s', async (status, kind) => {
    hostingRequest.mockResolvedValue({ success: false, error: 'specific failure', status });
    await expect(hostingClient.request('capabilities', { connectionId: `error-${status}` })).rejects.toMatchObject({ message: 'specific failure', kind });
    expect(new HostingRequestError('test', status as number | undefined)).toBeInstanceOf(Error);
  });
  it('delegates typed transfers and exposes failures', async () => {
    remoteTransferRequest.mockResolvedValueOnce({ success: true, data: { output: 'done' } }).mockResolvedValueOnce({ success: false, error: 'rejected' });
    await expect(transferClient.request('fetch', { repoPath: '/repo', remote: 'forgejo' })).resolves.toEqual({ output: 'done' });
    expect(remoteTransferRequest).toHaveBeenCalledWith('fetch', { repoPath: '/repo', remote: 'forgejo' });
    await expect(transferClient.request('pull', { repoPath: '/repo', remote: 'forgejo', branch: 'main', mode: 'ff-only' })).rejects.toThrow('rejected');
  });
  it.each([
    ['feature_disabled', 'disabled'],
    ['head_changed', 'invalid'],
    ['asset_exists', 'invalid'],
  ])('distinguishes a disabled feature from a conflicting revision: %s', async (code, kind) => {
    hostingRequest.mockResolvedValue({ success: false, error: 'specific reason', status: 409, code });
    await expect(hostingClient.request('capabilities', { connectionId: `reason-${code}` })).rejects.toMatchObject({ kind });
  });
});
