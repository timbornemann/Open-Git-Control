// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import { useGithubCloneWorkflow } from './useGithubCloneWorkflow';

describe('repository clone activation', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(appClient, 'selectDirectory').mockResolvedValue('C:/Clones');
    vi.spyOn(gitClient, 'gitClone').mockResolvedValue({ success: true, repoPath: 'C:/Clones/example' });
    vi.spyOn(gitClient, 'onCloneProgress').mockReturnValue(vi.fn());
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('opens the repo tab only when the cloned repository was activated', async () => {
    const setActiveTab = vi.fn();
    const onRepoCloned = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    let workflow!: ReturnType<typeof useGithubCloneWorkflow>;
    const Harness = () => {
      workflow = useGithubCloneWorkflow({ onRepoCloned, setActiveTab, t: (key) => key });
      return null;
    };
    act(() => root.render(createElement(Harness)));

    let cancelled = false;
    await act(async () => {
      cancelled = await workflow.cloneRepository('https://github.com/team/example.git');
    });
    expect(cancelled).toBe(false);
    expect(setActiveTab).not.toHaveBeenCalled();

    let activated = false;
    await act(async () => {
      activated = await workflow.cloneRepository('https://github.com/team/example.git');
    });
    expect(activated).toBe(true);
    expect(setActiveTab).toHaveBeenCalledWith('repo');
    expect(onRepoCloned).toHaveBeenCalledWith('C:/Clones/example');
  });
});
