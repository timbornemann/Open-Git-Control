// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { useSystemTools } from '@/app/state/systemToolsStore';
import type { GitLfsFileState, GitLfsStatus } from '@/shared/ipc/gitLfs';
import { useStagingLfs } from './useStagingLfs';
import type { FileEntry } from '@/utils/gitParsing';

let root: Root, current: ReturnType<typeof useStagingLfs>, repo: string;
const file = (path: string, version = path): GitLfsFileState => ({
  path,
  version,
  source: 'staged',
  bytes: 12,
  configured: false,
  eligible: true,
  pointer: false,
  needsRestage: false,
});
const entry = (path: string) => ({ path, x: 'A', y: ' ' });
const statusFor = (...paths: string[]): { staged: FileEntry[]; unstaged: FileEntry[]; untracked: FileEntry[] } => ({
  staged: paths.map(entry),
  unstaged: [],
  untracked: [],
});
const response = (...files: GitLfsFileState[]) => ({ success: true as const, data: { available: true, files } });
let status: ReturnType<typeof statusFor>;
function Harness() {
  current = useStagingLfs(repo, status, async () => true);
  return null;
}
const render = () => act(async () => root.render(createElement(Harness)));
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  repo = 'C:/incremental';
  status = statusFor('one', 'two');
  root = createRoot(document.createElement('div'));
  useSystemTools.setState({ status: null });
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  useSystemTools.setState({ status: null });
});

describe('incremental LFS renderer refreshes', () => {
  it('retains individual state identities and updates only changed results without skipping fresh validation', async () => {
    const inspect = vi.spyOn(gitClient, 'getGitLfsStatus').mockResolvedValue(response(file('one'), file('two')));
    await render();
    const first = current.stateFor('one', 'staged'),
      second = current.stateFor('two', 'staged');
    status = statusFor('one', 'two');
    await render();
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(current.stateFor('one', 'staged')).toBe(first);
    expect(current.stateFor('two', 'staged')).toBe(second);
    inspect.mockResolvedValue(response(file('one', 'changed'), file('two')));
    status = statusFor('one', 'two');
    await render();
    expect(current.stateFor('one', 'staged')).not.toBe(first);
    expect(current.stateFor('two', 'staged')).toBe(second);
  });

  it('coalesces rapid status changes behind one in-flight read and uses only the latest requested list', async () => {
    let finish!: (result: { success: true; data: GitLfsStatus }) => void;
    const pending = new Promise<{ success: true; data: GitLfsStatus }>((resolve) => {
      finish = resolve;
    });
    const inspect = vi
      .spyOn(gitClient, 'getGitLfsStatus')
      .mockReturnValueOnce(pending)
      .mockResolvedValue(response(file('latest')));
    await render();
    for (const name of ['intermediate', 'older', 'latest']) {
      status = statusFor(name);
      await render();
    }
    expect(inspect).toHaveBeenCalledTimes(1);
    await act(async () => finish(response(file('one'), file('two'))));
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(inspect.mock.calls[1][0].files).toEqual([{ path: 'latest', source: 'staged' }]);
    expect(current.stateFor('latest', 'staged')).toBeDefined();
    expect(current.stateFor('one', 'staged')).toBeUndefined();
  });

  it('keeps the checked preview visible during refresh, prunes removed entries and preserves partial-staging sources', async () => {
    const both = [file('one'), { ...file('one', 'working'), source: 'unstaged' as const }];
    const inspect = vi.spyOn(gitClient, 'getGitLfsStatus').mockResolvedValue(response(...both));
    status = { staged: [entry('one')], unstaged: [entry('one')], untracked: [] };
    await render();
    const staged = current.stateFor('one', 'staged');
    let finish!: (result: ReturnType<typeof response>) => void;
    inspect.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    status = statusFor('one');
    await render();
    expect(current.stateFor('one', 'staged')).toBe(staged);
    expect(current.available).toBe(true);
    await act(async () => finish(response(file('one'))));
    expect(current.stateFor('one', 'staged')).toBe(staged);
    expect(current.stateFor('one', 'unstaged')).toBeUndefined();
  });

  it('does not delay another repository behind an old read or expose the old response', async () => {
    let finish!: (result: ReturnType<typeof response>) => void;
    const inspect = vi
      .spyOn(gitClient, 'getGitLfsStatus')
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValue(response(file('new')));
    await render();
    repo = 'C:/other';
    status = statusFor('new');
    await render();
    expect(inspect).toHaveBeenCalledTimes(2);
    await act(async () => finish(response(file('old'))));
    expect(current.stateFor('new', 'staged')).toBeDefined();
    expect(current.stateFor('old', 'staged')).toBeUndefined();
  });

  it('rechecks a changed LFS executable/version even when availability and working-tree membership stay the same', async () => {
    const inspect = vi.spyOn(gitClient, 'getGitLfsStatus').mockResolvedValue(response(file('one'), file('two')));
    const tools = (version: string) => ({
      platform: 'win32' as const,
      checkedAt: 1,
      installation: null,
      tools: [{ id: 'git-lfs' as const, required: false, state: 'available' as const, version, executable: 'git-lfs', downloadUrl: '', instructionsUrl: '' }],
    });
    useSystemTools.setState({ status: tools('1') });
    await render();
    await act(async () => useSystemTools.setState({ status: tools('2') }));
    expect(inspect).toHaveBeenCalledTimes(2);
  });
});
