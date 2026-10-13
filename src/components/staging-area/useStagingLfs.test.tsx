// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { useStagingLfs } from './useStagingLfs';
import type { GitLfsStatus, TrackWithGitLfsRequest } from '@/shared/ipc/gitLfs';

afterEach(() => vi.restoreAllMocks());
describe('repository-bound LFS status and checked actions', () => {
  it('sends a large file list in one bounded request instead of repeatedly loading the index', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const inspection = vi.spyOn(gitClient, 'getGitLfsStatus').mockResolvedValue({ success: true, data: { available: true, files: [] } });
    const status = {
      staged: Array.from({ length: 2000 }, (_, index) => ({ path: `file-${index}.txt`, status: 'A', x: 'A', y: ' ' })),
      unstaged: [],
      untracked: [],
    };
    const track = async () => true;
    const root = createRoot(document.createElement('div'));
    const Harness = () => {
      useStagingLfs('C:/repo/bulk', status, track);
      return null;
    };
    try {
      await act(async () => root.render(createElement(Harness)));
      expect(inspection).toHaveBeenCalledOnce();
      expect(inspection.mock.calls[0][0].files).toHaveLength(2000);
    } finally {
      act(() => root.unmount());
    }
  });
  it('ignores late responses from another repository and tracks the checked source/version', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let resolveOld!: (result: { success: true; data: GitLfsStatus }) => void;
    const old = new Promise<{ success: true; data: GitLfsStatus }>((resolve) => {
      resolveOld = resolve;
    });
    const state = {
      path: 'design.psd',
      source: 'staged' as const,
      bytes: 18 * 1024 * 1024,
      eligible: true,
      configured: false,
      pointer: false,
      needsRestage: false,
      recommendation: 'asset' as const,
    };
    const inspection = vi
      .spyOn(gitClient, 'getGitLfsStatus')
      .mockReturnValueOnce(old)
      .mockResolvedValue({ success: true, data: { available: true, files: [{ ...state, version: 'repo-b-index' }] } });
    const track = vi.fn(async (_request: TrackWithGitLfsRequest) => true);
    let repo = 'C:/a';
    let current!: ReturnType<typeof useStagingLfs>;
    const status = { staged: [{ path: state.path, x: 'A', y: ' ' }], unstaged: [], untracked: [] };
    const Hook = () => {
      current = useStagingLfs(repo, status, track);
      return null;
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(Hook)));
      repo = 'C:/b';
      await act(async () => root.render(createElement(Hook)));
      await act(async () => resolveOld({ success: true, data: { available: false, files: [{ ...state, version: 'old-index' }] } }));
      expect(current.available).toBe(true);
      expect(current.stateFor(state.path, 'staged')?.version).toBe('repo-b-index');
      expect(current.stateFor(state.path, 'unstaged')).toBeUndefined();
      await current.track(status.staged[0], 'staged', 'file');
      expect(track).toHaveBeenCalledWith({ repoPath: 'C:/b', path: state.path, source: 'staged', scope: 'file', expectedVersion: 'repo-b-index' });
      expect(current.recommendationTitle({ ...state, version: 'version' })).toContain('18 MiB');
      expect(inspection).toHaveBeenCalledTimes(2);
    } finally {
      act(() => root.unmount());
    }
  });
});
