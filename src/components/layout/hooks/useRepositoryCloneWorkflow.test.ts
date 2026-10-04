// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import { hostingClient } from '@/services/hostingClient';
import { useRepositoryCloneWorkflow } from './useRepositoryCloneWorkflow';
import type { HostedRepository } from '@/types/hostingDtos';

const repository: HostedRepository = {
  ref: { connectionId: 'forgejo-private', repositoryId: '12', fullPath: 'team/repository' },
  name: 'repository',
  fullName: 'team/repository',
  private: true,
  cloneUrl: 'https://forge.example/team/repository.git',
  sshUrl: 'ssh://git@forge.example/team/repository.git',
  htmlUrl: 'https://forge.example/team/repository',
  description: null,
  defaultBranch: 'main',
  fork: false,
};
describe('provider-independent repository cloning', () => {
  let root: Root;
  let workflow: ReturnType<typeof useRepositoryCloneWorkflow>;
  const onRepoCloned = vi.fn();
  const setActiveTab = vi.fn();
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement('div'));
    onRepoCloned.mockReset().mockResolvedValue(true);
    setActiveTab.mockReset();
    vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(appClient, 'selectProjectParentDirectory').mockResolvedValue('C:/Clones');
    vi.spyOn(gitClient, 'gitClone').mockResolvedValue({ success: true, repoPath: 'C:/Clones/repository' });
    vi.spyOn(gitClient, 'onCloneProgress').mockReturnValue(vi.fn());
    const Harness = () => {
      workflow = useRepositoryCloneWorkflow({ onRepoCloned, setActiveTab, t: (key) => key });
      return null;
    };
    act(() => root.render(createElement(Harness)));
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.restoreAllMocks();
  });

  it('resolves the selected account before cloning and never uses the ambient GitHub session', async () => {
    const request = vi.spyOn(hostingClient, 'request').mockResolvedValueOnce(repository).mockResolvedValueOnce({ path: 'C:/Clones/repository' });
    await act(async () => {
      expect(await workflow.cloneRepository(repository.cloneUrl, { connectionId: 'forgejo-private' })).toBe(true);
    });
    expect(request).toHaveBeenNthCalledWith(1, 'resolveRepository', { connectionId: 'forgejo-private', url: repository.cloneUrl });
    expect(request).toHaveBeenNthCalledWith(2, 'clone', { repository: repository.ref, targetDir: 'C:/Clones', targetName: undefined, useSsh: false });
    expect(gitClient.gitClone).not.toHaveBeenCalled();
    expect(onRepoCloned).toHaveBeenCalledWith('C:/Clones/repository');
    expect(setActiveTab).toHaveBeenCalledWith('repo');
  });

  it('does not fall back to unrelated credentials when the selected account cannot resolve the URL', async () => {
    const request = vi.spyOn(hostingClient, 'request').mockResolvedValueOnce(null);
    await act(async () => {
      expect(await workflow.cloneRepository(repository.cloneUrl, { connectionId: 'wrong-account' })).toBe(false);
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(gitClient.gitClone).not.toHaveBeenCalled();
    expect(onRepoCloned).not.toHaveBeenCalled();
    expect(workflow.cloneError).toContain('selected hosting account');
  });

  it('supports ordinary Git URLs without a hosting account and only navigates after activation', async () => {
    const request = vi.spyOn(hostingClient, 'request');
    onRepoCloned.mockResolvedValue(false);
    await act(async () => {
      expect(await workflow.cloneRepository('ssh://git@other.example/team/repository.git')).toBe(false);
    });
    expect(gitClient.gitClone).toHaveBeenCalledWith('ssh://git@other.example/team/repository.git', 'C:/Clones', undefined);
    expect(request).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(workflow.cloneFinished).toBe(true);
  });
});
