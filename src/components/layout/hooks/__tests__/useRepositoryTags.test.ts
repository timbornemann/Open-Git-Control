// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { transferClient } from '@/services/hostingClient';
import { TAG_REFERENCE_STATUS_FORMAT } from '@/utils/tagConflicts';
import { useRepositoryTags } from '../useRepositoryTags';

vi.mock('@/data/resourceHooks', () => ({ useCachedResult: () => ({}) }));

let root: Root;
const params = () => ({
  activeRepo: '/repo/mixed',
  refreshTrigger: 0,
  currentBranch: 'main',
  trackedRemoteName: null,
  language: 'en' as const,
  setGitActionToast: vi.fn(),
  runGitCommand: vi.fn().mockResolvedValue(true),
  setConfirmDialog: vi.fn(),
  setInputDialog: vi.fn(),
  onNavigateToCommit: vi.fn(),
});
async function renderTags(input: Parameters<typeof useRepositoryTags>[0]) {
  let current!: ReturnType<typeof useRepositoryTags>;
  function Harness() {
    current = useRepositoryTags(input);
    return null;
  }
  await act(async () => {
    root.render(createElement(Harness));
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  });
  return () => current;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(transferClient, 'request').mockResolvedValue({ fetchRemote: 'private' });
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repo, operation) => ({
    success: true,
    data: operation === 'tag' ? 'release\n' : `refs/tags/release\0${'a'.repeat(40)}\0\nrefs/ogc/remote-tags/private/release\0${'b'.repeat(40)}\0`,
  }));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe('repository tag source selection', () => {
  it('shows tracked conflicts from the saved fetch source before auto-fetch has resolved an upstream', async () => {
    const current = await renderTags(params());
    expect(current().tags).toEqual(['release']);
    expect(current().tagConflicts).toEqual(['release']);
    expect(gitClient.runGitCommandForRepo).toHaveBeenCalledWith(
      '/repo/mixed',
      'forEachRef',
      TAG_REFERENCE_STATUS_FORMAT,
      'refs/tags',
      'refs/ogc/remote-tags/private/',
    );
    expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalledWith('/repo/mixed', 'adoptRemoteTag', 'private', 'release');
  });

  it('uses the saved fetch source for an explicitly confirmed conflict replacement instead of a different upstream', async () => {
    const input = { ...params(), trackedRemoteName: 'backup' };
    const current = await renderTags(input);
    await current().handleDeleteTag('release');
    const dialog = input.setConfirmDialog.mock.calls[0][0];
    await dialog.onConfirm();
    expect(input.runGitCommand.mock.calls[1][0]).toEqual(['adoptRemoteTag', 'private', 'release']);
    expect(input.runGitCommand.mock.calls[1][3]).toEqual({ expectedRepoPath: '/repo/mixed' });
  });
});
