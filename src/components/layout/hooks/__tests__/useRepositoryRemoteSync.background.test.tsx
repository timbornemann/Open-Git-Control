// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryRemoteSync } from '../useRepositoryRemoteSync';
import { gitClient } from '@/services/gitClient';
import { transferClient } from '@/services/hostingClient';
import { notifyRemoteSyncSuccess } from '@/data/remoteSyncEvents';
import { initialRemoteTransferState, useRemoteTransferState } from '@/components/hosting/remoteTransferState';

type Input = Parameters<typeof useRepositoryRemoteSync>[0];
const makeInput = (): Input => ({
  activeRepo: 'C:/repos/demo',
  refreshTrigger: 0,
  triggerRefresh: vi.fn(),
  autoFetchIntervalMs: 60_000,
  language: 'en',
  hasAnyRemote: true,
  remotes: [{ name: 'origin', url: 'https://github.com/acme/demo.git' }],
  setGitActionToast: vi.fn(),
  setActiveGitActionLabel: vi.fn(),
  isGitActionRunningRef: { current: false },
});
const deferred = () => {
  let resolve!: (value: { output: string; deferred?: true }) => void;
  const promise = new Promise<{ output: string; deferred?: true }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let root: Root | undefined;
const mount = async (initial: Input) => {
  let input = initial;
  let current!: ReturnType<typeof useRepositoryRemoteSync>;
  root = createRoot(document.createElement('div'));
  const Probe = () => {
    current = useRepositoryRemoteSync(input);
    return null;
  };
  await act(async () => {
    root!.render(createElement(Probe));
  });
  return {
    get current() {
      return current;
    },
    rerender: async (next: Input) => {
      input = next;
      await act(async () => {
        root!.render(createElement(Probe));
      });
    },
  };
};
const tick = async (ms = 5000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const fetchCalls = () => vi.mocked(transferClient.request).mock.calls.filter(([operation]) => operation === 'fetch');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  useRemoteTransferState.setState(initialRemoteTransferState());
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '# branch.head main\n# branch.upstream origin/main\n' });
  vi.spyOn(transferClient, 'request').mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '', deferred: true }));
});
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useRemoteTransferState.setState(initialRemoteTransferState());
});

describe('automatic fetch yielding and retry', () => {
  it('does not publish failure or success for a deferred fetch and retries after foreground work', async () => {
    const input = makeInput();
    const hook = await mount(input);
    expect(fetchCalls()).toEqual([['fetch', { repoPath: input.activeRepo, remote: 'origin', includeTags: true, background: true }]]);
    expect(hook.current.remoteSync).toMatchObject({ isFetching: false, lastFetchError: null, lastFetchedAt: null });
    expect(input.triggerRefresh).not.toHaveBeenCalled();
    expect(input.setGitActionToast).not.toHaveBeenCalled();
    expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalledWith(input.activeRepo, 'adoptRemoteTag', expect.anything(), expect.anything());

    input.isGitActionRunningRef.current = true;
    await tick();
    expect(fetchCalls()).toHaveLength(1);
    input.isGitActionRunningRef.current = false;
    useRemoteTransferState.setState({ busy: true });
    await tick();
    expect(fetchCalls()).toHaveLength(1);
    useRemoteTransferState.setState({ busy: false });
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '' }));
    await tick();
    expect(fetchCalls()).toHaveLength(2);
    expect(fetchCalls()[1][1]).toMatchObject({ includeTags: true, background: true });
    expect(hook.current.remoteSync).toMatchObject({ isFetching: false, lastFetchError: null, lastFetchedAt: expect.any(Number) });
    expect(input.triggerRefresh).toHaveBeenCalledOnce();
    await tick();
    expect(fetchCalls()).toHaveLength(2);
  });

  it('preserves the previous successful sync timestamp when the combined fetch yields', async () => {
    const input = makeInput();
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '' }));
    const hook = await mount(input);
    const fetchedAt = hook.current.remoteSync.lastFetchedAt;
    expect(fetchedAt).toEqual(expect.any(Number));
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '', deferred: true }));
    await tick(60_000);
    expect(fetchCalls()).toHaveLength(2);
    expect(hook.current.remoteSync).toMatchObject({ lastFetchedAt: fetchedAt, lastFetchError: null, isFetching: false });
    expect(input.triggerRefresh).toHaveBeenCalledOnce();
    expect(input.setGitActionToast).not.toHaveBeenCalled();
  });

  it('does not clear a genuine earlier network error until a complete retry succeeds', async () => {
    const input = makeInput();
    vi.mocked(transferClient.request).mockImplementation(async (operation) => {
      if (operation === 'getPreferences') return {};
      throw new Error('Offline');
    });
    const hook = await mount(input);
    expect(hook.current.remoteSync.lastFetchError).toBe('Offline');
    await tick(5000);
    expect(fetchCalls()).toHaveLength(1);
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '', deferred: true }));
    await tick(55_000);
    expect(hook.current.remoteSync.lastFetchError).toBe('Offline');
    expect(input.triggerRefresh).not.toHaveBeenCalled();
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '', refsChanged: false }));
    await tick();
    expect(hook.current.remoteSync.lastFetchError).toBeNull();
    expect(hook.current.remoteSync.lastFetchedAt).toEqual(expect.any(Number));
    expect(input.triggerRefresh).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps a manual fetch in the foreground and cancels the pending automatic retry (show toast: %s)', async (showToast) => {
    const input = makeInput();
    const hook = await mount(input);
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '' }));
    await act(async () => {
      expect(await hook.current.refreshRemoteState(showToast)).toBe(true);
    });
    expect(fetchCalls().slice(1)).toEqual([['fetch', { repoPath: input.activeRepo, remote: 'origin', includeTags: true }]]);
    if (showToast) expect(input.setGitActionToast).toHaveBeenCalledWith(expect.objectContaining({ isError: false }));
    else expect(input.setGitActionToast).not.toHaveBeenCalled();
    await tick();
    expect(fetchCalls()).toHaveLength(2);
  });

  it('ignores late deferred responses after a successful manual sync', async () => {
    const pending = deferred();
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : pending.promise));
    const input = makeInput();
    const hook = await mount(input);
    await act(async () => {
      notifyRemoteSyncSuccess(input.activeRepo!, 'origin');
    });
    const fetchedAt = hook.current.remoteSync.lastFetchedAt;
    await act(async () => {
      pending.resolve({ output: '', deferred: true });
    });
    await tick();
    expect(fetchCalls()).toHaveLength(1);
    expect(hook.current.remoteSync).toMatchObject({ lastFetchedAt: fetchedAt, lastFetchError: null, isFetching: false });
  });

  it('retains a deferred retry if automatic sync settings change during the in-flight fetch', async () => {
    const pending = deferred();
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : pending.promise));
    const input = makeInput();
    const hook = await mount(input);
    await hook.rerender({ ...input, autoFetchIntervalMs: 120_000 });
    await act(async () => {
      pending.resolve({ output: '', deferred: true });
    });
    expect(fetchCalls()).toHaveLength(1);
    await tick();
    expect(fetchCalls()).toHaveLength(2);
  });

  it('pauses retries while hidden and resumes when the window becomes visible', async () => {
    await mount(makeInput());
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await tick();
    expect(fetchCalls()).toHaveLength(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchCalls()).toHaveLength(2);
  });

  it('cleans up the pending retry on repository change and unmount', async () => {
    const input = makeInput();
    const hook = await mount(input);
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '' }));
    await hook.rerender({ ...input, activeRepo: 'C:/repos/other' });
    await tick();
    expect(fetchCalls().filter(([, options]) => options.repoPath === input.activeRepo)).toHaveLength(1);
    await act(async () => {
      root!.unmount();
    });
    root = undefined;
    await tick(60_000);
    expect(fetchCalls()).toHaveLength(2);
  });

  it('keeps repeated unchanged syncs out of repository refresh while updating successful check state and branch counts', async () => {
    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '', refsChanged: false }));
    vi.mocked(gitClient.runGitCommandForRepo).mockResolvedValue({
      success: true,
      data: '# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -3\n',
    });
    const input = makeInput();
    const hook = await mount(input);
    const first = hook.current.remoteSync.lastFetchedAt;
    expect(first).toEqual(expect.any(Number));
    await tick(60_000);
    expect(fetchCalls()).toHaveLength(2);
    expect(hook.current.remoteSync).toMatchObject({ isFetching: false, lastFetchError: null, ahead: 2, behind: 3, hasUpstream: true });
    expect(hook.current.remoteSync.lastFetchedAt).toBeGreaterThan(first!);
    expect(input.triggerRefresh).not.toHaveBeenCalled();
    expect(input.setGitActionToast).not.toHaveBeenCalled();

    vi.mocked(transferClient.request).mockImplementation(async (operation) => (operation === 'getPreferences' ? {} : { output: '', refsChanged: true }));
    await tick(60_000);
    expect(fetchCalls()).toHaveLength(3);
    expect(input.triggerRefresh).toHaveBeenCalledOnce();
  });
});
