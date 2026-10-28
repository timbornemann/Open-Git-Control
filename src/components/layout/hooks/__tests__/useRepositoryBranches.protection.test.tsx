// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryBranches } from '../useRepositoryBranches';
import { gitClient } from '@/services/gitClient';

vi.mock('@/data/resourceHooks', () => ({ useCachedResult: () => ({}) }));
let root: Root;
let current!: ReturnType<typeof useRepositoryBranches>;
const params = (activeRepo = '/repo') => ({
  activeRepo,
  refreshTrigger: 0,
  hasRemoteOrigin: true,
  language: 'en' as const,
  setGitActionToast: vi.fn(),
  runGitCommand: vi.fn().mockResolvedValue(true),
  triggerRefresh: vi.fn(),
  setConfirmDialog: vi.fn(),
  setInputDialog: vi.fn(),
});
let input: ReturnType<typeof params>;
function Harness() {
  current = useRepositoryBranches(input);
  return null;
}
async function render() {
  await act(async () => {
    root.render(createElement(Harness));
    for (let index = 0; index < 10; index++) await Promise.resolve();
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  input = params();
  root = createRoot(document.createElement('div'));
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repo, command, ...args) => {
    if (command === 'protectedBranches') return { success: true, data: 'main\nmaster\ntrunk' };
    if (command === 'branch' && args[0] === '-a') return { success: true, data: '* feature\n  main\n  master\n  trunk\n  finished\n' };
    return { success: true, data: 'Deleted branch finished' };
  });
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});
describe('local primary branch deletion workflow', () => {
  it.each(['main', 'master', 'trunk'])('blocks %s before opening any deletion confirmation', async (name) => {
    await render();
    expect(current.branches.find((branch) => branch.name === name)?.isProtected).toBe(true);
    await act(async () => current.handleDeleteBranch(name));
    expect(input.setConfirmDialog).not.toHaveBeenCalled();
    expect(input.setGitActionToast).toHaveBeenCalledWith({ msg: expect.stringContaining('protected'), isError: false });
    expect(vi.mocked(gitClient.runGitCommandForRepo).mock.calls.some(([, command, flag]) => command === 'branch' && ['-d', '-D'].includes(flag))).toBe(false);
  });
  it('handles fresh backend protection without offering a force-delete bypass', async () => {
    await render();
    await act(async () => current.handleDeleteBranch('finished'));
    const confirmation = input.setConfirmDialog.mock.calls[0][0];
    vi.mocked(gitClient.runGitCommandForRepo).mockResolvedValueOnce({ success: false, error: '[PROTECTED_BRANCH] Local primary branch cannot be deleted.' });
    await act(async () => confirmation.onConfirm());
    expect(input.setConfirmDialog).toHaveBeenCalledTimes(1);
    expect(input.runGitCommand).not.toHaveBeenCalled();
    expect(input.setGitActionToast).toHaveBeenLastCalledWith({ msg: expect.stringContaining('protected'), isError: false });
    expect(input.triggerRefresh).toHaveBeenCalledOnce();
  });
  it('still deletes a confirmed ordinary feature branch', async () => {
    await render();
    await act(async () => current.handleDeleteBranch('finished'));
    const confirmation = input.setConfirmDialog.mock.calls[0][0];
    await act(async () => confirmation.onConfirm());
    expect(gitClient.runGitCommandForRepo).toHaveBeenCalledWith('/repo', 'branch', '-d', 'finished');
    expect(input.setGitActionToast).toHaveBeenLastCalledWith({ msg: 'Deleted branch "finished".', isError: false });
  });
  it('does not execute an old confirmation after repository navigation', async () => {
    await render();
    await act(async () => current.handleDeleteBranch('finished'));
    const confirmation = input.setConfirmDialog.mock.calls[0][0];
    input = params('/another');
    await render();
    await act(async () => confirmation.onConfirm());
    expect(vi.mocked(gitClient.runGitCommandForRepo).mock.calls.some(([, command, flag]) => command === 'branch' && flag === '-d')).toBe(false);
  });
});
