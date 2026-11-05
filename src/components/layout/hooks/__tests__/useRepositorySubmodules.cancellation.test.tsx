// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelledError } from '@tanstack/react-query';
import { useRepositorySubmodules } from '../useRepositorySubmodules';

const { read, toast } = vi.hoisted(() => ({ read: vi.fn(), toast: vi.fn() }));
vi.mock('@/services/gitClient', () => ({ gitClient: { isAvailable: () => true, runGitCommandForRepo: read } }));
vi.mock('@/data/resourceHooks', () => ({ useCachedResult: () => ({ data: undefined }) }));
const firstRepo = '/practice/first',
  secondRepo = '/practice/second';
const firstHash = 'a'.repeat(40),
  secondHash = 'b'.repeat(40);
const result = (hash: string) => ({ success: true, data: ' ' + hash + ' packages/design (v1.0.0)\n' });
let root: Root, container: HTMLDivElement, pending: { resolve: (value: unknown) => void; reject: (cause: unknown) => void }[];
const runGitCommand = vi.fn();
function Harness({ repo, refresh }: { repo: string; refresh: number }) {
  const state = useRepositorySubmodules({ activeRepo: repo, refreshTrigger: refresh, language: 'en', setGitActionToast: toast, runGitCommand });
  return createElement('div', null, state.submodules.map((entry) => entry.commit).join(','));
}
const render = async (repo = firstRepo, refresh = 0) => {
  await act(async () => {
    root.render(createElement(Harness, { repo, refresh }));
  });
};
beforeEach(() => {
  pending = [];
  toast.mockReset();
  read.mockReset();
  read.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe('submodule reads superseded by cache invalidation', () => {
  it('retries a cancelled cold read and publishes its replacement without an error toast', async () => {
    await render();
    await act(async () => pending[0].reject(new CancelledError({ silent: true })));
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => pending[1].resolve(result(secondHash)));
    expect(container.textContent).toBe(secondHash);
    expect(toast).not.toHaveBeenCalled();
  });
  it('does not restart a cancelled read for the previous repository', async () => {
    await render();
    await render(secondRepo);
    await act(async () => {
      pending[0].reject(new CancelledError());
      pending[1].resolve(result(secondHash));
    });
    expect(read.mock.calls.map((args) => args[0])).toEqual([firstRepo, secondRepo]);
    expect(container.textContent).toBe(secondHash);
    expect(toast).not.toHaveBeenCalled();
  });
  it('does not publish a late result after a refresh supersedes it', async () => {
    await render();
    await render(firstRepo, 1);
    await act(async () => {
      pending[1].resolve(result(secondHash));
      pending[0].resolve(result(firstHash));
    });
    expect(container.textContent).toBe(secondHash);
    expect(toast).not.toHaveBeenCalled();
  });
  it.each(['IPC transport failed', 'CancelledError'])('still reports a genuine failure named %s', async (message) => {
    await render();
    await act(async () => pending[0].reject(new Error(message)));
    expect(toast).toHaveBeenCalledWith({ msg: message, isError: true });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
