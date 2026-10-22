import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRepositoryActions } from './createAppRepositoryActions';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';
import { invalidateResources } from '@/data/clientCache';
import {
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from '@/components/working-directory/workingDirectoryNavigationGuard';
import { normalizeRepoPathKey } from '@/utils/repoPath';

vi.mock('@/components/hosting/remoteTransferDialogState', () => ({ requestRemoteTransfer: vi.fn() }));
vi.mock('@/data/clientCache', () => ({ invalidateResources: vi.fn() }));

function setup(activeRepo: string | null = 'C:/project') {
  const state = {
    activeRepo,
    handleOpenFolder: vi.fn().mockResolvedValue(undefined),
    handleCloneByUrl: vi.fn(),
    setGitActionToast: vi.fn(),
    triggerRefresh: vi.fn(),
    setActiveTab: vi.fn(),
    isBranchPanelCollapsed: true,
    toggleBranchPanelCollapsed: vi.fn(),
    setIsCreatingBranch: vi.fn(),
  };
  const revealSidebar = vi.fn();
  const actions = createAppRepositoryActions({ state, revealSidebar, tr: (_de, en) => en });
  return { actions, state, revealSidebar };
}

afterEach(() => {
  vi.clearAllMocks();
  resetWorkingDirectoryNavigationGuardForTests();
});

describe('repository commands shared by shortcuts and palette', () => {
  it('opens the existing folder and clone workflows without an active repository', () => {
    const { state, actions } = setup(null);
    actions.open();
    actions.clone();
    expect(state.handleOpenFolder).toHaveBeenCalledOnce();
    expect(state.handleCloneByUrl).toHaveBeenCalledOnce();
    expect(state.setGitActionToast).not.toHaveBeenCalled();
  });
  it.each(['fetch', 'pull', 'push'] as const)('opens the existing %s dialog for the active repository', (mode) => {
    setup().actions[mode]();
    expect(requestRemoteTransfer).toHaveBeenCalledExactlyOnceWith({ repoPath: 'C:/project', mode });
  });
  it('refreshes cached local data and all repository views without starting a transfer', () => {
    const { state, actions } = setup();
    actions.refresh();
    expect(invalidateResources).toHaveBeenCalledExactlyOnceWith('git', normalizeRepoPathKey('C:/project'));
    expect(state.triggerRefresh).toHaveBeenCalledOnce();
    expect(requestRemoteTransfer).not.toHaveBeenCalled();
    expect(state.setActiveTab).not.toHaveBeenCalled();
  });
  it.each(['refresh', 'createBranch', 'fetch', 'pull', 'push'] as const)('explains the missing repository for %s', (id) => {
    const { state, actions, revealSidebar } = setup(null);
    actions[id]();
    expect(state.setGitActionToast).toHaveBeenCalledExactlyOnceWith({ msg: 'Please open a repository first.', isError: true });
    expect(state.setIsCreatingBranch).not.toHaveBeenCalled();
    expect(requestRemoteTransfer).not.toHaveBeenCalled();
    expect(invalidateResources).not.toHaveBeenCalled();
    expect(revealSidebar).not.toHaveBeenCalled();
  });
  it('reveals the branch input only after the unsaved-file guard allows navigation', () => {
    const guard = vi.fn();
    setActiveWorkingDirectoryNavigationGuard(guard);
    const { state, actions, revealSidebar } = setup();
    actions.createBranch();
    expect(state.setIsCreatingBranch).not.toHaveBeenCalled();
    expect(revealSidebar).not.toHaveBeenCalled();
    guard.mock.calls[0][1]();
    expect(state.setActiveTab).toHaveBeenCalledExactlyOnceWith('repo');
    expect(revealSidebar).toHaveBeenCalledOnce();
    expect(state.toggleBranchPanelCollapsed).toHaveBeenCalledOnce();
    expect(state.setIsCreatingBranch).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('does not open the branch input when navigation is cancelled', () => {
    setActiveWorkingDirectoryNavigationGuard((_target, _proceed, cancel) => cancel?.());
    const { state, actions, revealSidebar } = setup();
    actions.createBranch();
    expect(state.setActiveTab).not.toHaveBeenCalled();
    expect(state.setIsCreatingBranch).not.toHaveBeenCalled();
    expect(revealSidebar).not.toHaveBeenCalled();
  });
});
