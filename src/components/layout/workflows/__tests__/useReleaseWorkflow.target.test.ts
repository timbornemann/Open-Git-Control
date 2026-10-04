import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseWorkflowFixture } from './releaseWorkflowFixture';
import { invalidateGithubCacheEpoch, resourceKey } from '@/data/clientCache';
import { queryClient } from '@/data/queryClient';
import { appClient } from '@/services/appClient';
import { githubClient } from '@/legacy/github/githubClient';

let fixture: Awaited<ReturnType<typeof releaseWorkflowFixture>>;
afterEach(() => {
  fixture?.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('release target confirmation', () => {
  it('publishes a synchronized target without asking', async () => {
    fixture = await releaseWorkflowFixture({ ahead: 0, canPush: false });
    await act(async () => fixture.workflow.handleCreateRelease());
    expect(fixture.dialog).toBeNull();
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({ targetInspection: { id: 'inspection-1', mode: 'remote' } }));
  });

  it('asks before any write and rejects double clicks during inspection and confirmation', async () => {
    fixture = await releaseWorkflowFixture();
    await act(async () => {
      await Promise.all([fixture.workflow.handleCreateRelease(), fixture.workflow.handleCreateRelease()]);
    });
    expect(fixture.inspect).toHaveBeenCalledOnce();
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.dialog).toMatchObject({ confirmLabel: 'Push and create release', secondaryActionLabel: 'Create without pushing' });
    expect(fixture.workflow.releasePhase).toBe('awaiting-decision');
    const dialog = fixture.dialog!;
    await act(async () => {
      await Promise.all([dialog.onConfirm(), dialog.onConfirm()]);
    });
    expect(fixture.create).toHaveBeenCalledOnce();
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({ targetInspection: { id: 'inspection-1', mode: 'push-local' } }));
  });

  it('allows an explicit remote-only release', async () => {
    fixture = await releaseWorkflowFixture();
    await act(async () => fixture.workflow.handleCreateRelease());
    await act(async () => fixture.dialog!.onSecondaryAction!());
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({ targetInspection: { id: 'inspection-1', mode: 'remote' } }));
  });

  it('cancels without clearing inputs and permits a fresh attempt', async () => {
    fixture = await releaseWorkflowFixture();
    await act(async () => fixture.workflow.handleCreateRelease());
    act(() => fixture.dialog!.onCancel!());
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.setReleaseFormState).not.toHaveBeenCalled();
    expect(fixture.workflow.releasePhase).toBe('idle');
    await act(async () => fixture.workflow.handleCreateRelease());
    expect(fixture.inspect).toHaveBeenCalledTimes(2);
  });

  it('preserves the form on a push/publication failure and resets progress', async () => {
    fixture = await releaseWorkflowFixture();
    const status = resourceKey('git', 'runGitCommandForRepo', ['C:/repos/project', 'status', '--porcelain=v2', '--branch']);
    const other = resourceKey('git', 'runGitCommandForRepo', ['C:/repos/other', 'status', '--porcelain=v2', '--branch']);
    queryClient.setQueryData(status, { success: true, data: 'old ahead count' });
    queryClient.setQueryData(other, { success: true, data: 'other repository' });
    fixture.create.mockResolvedValue({ success: false, error: 'Push rejected' });
    await act(async () => fixture.workflow.handleCreateRelease());
    await act(async () => fixture.dialog!.onConfirm());
    expect(fixture.setGitActionToast).toHaveBeenCalledWith({ msg: 'Push rejected', isError: true });
    expect(fixture.setReleaseFormState).not.toHaveBeenCalled();
    expect(fixture.setReleaseSubmitting).toHaveBeenLastCalledWith(false);
    expect(queryClient.getQueryState(status)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
  });

  it.each(['repository', 'account', 'branch'])('invalidates an open confirmation after a %s change', async (change) => {
    fixture = await releaseWorkflowFixture();
    await act(async () => fixture.workflow.handleCreateRelease());
    const dialog = fixture.dialog!;
    if (change === 'repository') await fixture.update({ activeRepo: 'C:/repos/other' });
    if (change === 'account') invalidateGithubCacheEpoch();
    if (change === 'branch') await fixture.update({ currentBranch: 'other' });
    await act(async () => dialog.onConfirm());
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('keeps the empty-notes confirmation before the target inspection', async () => {
    fixture = await releaseWorkflowFixture({}, '');
    await act(async () => fixture.workflow.handleCreateRelease());
    expect(fixture.inspect).not.toHaveBeenCalled();
    await act(async () => fixture.dialog!.onConfirm());
    expect(fixture.inspect).toHaveBeenCalledOnce();
    expect(fixture.dialog?.confirmLabel).toBe('Push and create release');
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('hides the remote-only action for an unpublished branch', async () => {
    fixture = await releaseWorkflowFixture({ remoteSha: null, canReleaseRemote: false });
    await act(async () => fixture.workflow.handleCreateRelease());
    expect(fixture.dialog?.onSecondaryAction).toBeUndefined();
  });

  it('offers only the remote release when pushing is unsafe', async () => {
    fixture = await releaseWorkflowFixture({ canPush: false, behind: 1, pushBlockedReason: 'Synchronize first' });
    await act(async () => fixture.workflow.handleCreateRelease());
    expect(fixture.dialog?.confirmLabel).toBe('Create without pushing');
    expect(fixture.dialog?.onSecondaryAction).toBeUndefined();
  });

  it('shows backend push and release progress for this submission', async () => {
    fixture = await releaseWorkflowFixture();
    await act(async () => fixture.workflow.handleCreateRelease());
    fixture.emit('pushing');
    expect(fixture.workflow.releasePhase).toBe('pushing');
    fixture.emit('creating');
    expect(fixture.workflow.releasePhase).toBe('creating');
  });

  it('preserves selected assets on failure and uploads them after the retry succeeds', async () => {
    fixture = await releaseWorkflowFixture();
    vi.spyOn(appClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(appClient, 'selectFiles').mockResolvedValue(['C:/build/app.zip']);
    const upload = vi.spyOn(githubClient, 'uploadReleaseAsset').mockResolvedValue({ success: true, data: { id: 1, name: 'app.zip', browserDownloadUrl: '' } });
    fixture.create.mockResolvedValueOnce({ success: false, error: 'Push succeeded, release failed' });
    await act(async () => fixture.workflow.addReleasePendingAssets());
    await act(async () => fixture.workflow.handleCreateRelease());
    await act(async () => fixture.dialog!.onConfirm());
    expect(fixture.workflow.releasePendingAssets).toEqual(['C:/build/app.zip']);
    expect(upload).not.toHaveBeenCalled();
    await act(async () => fixture.workflow.handleCreateRelease());
    await act(async () => fixture.dialog!.onConfirm());
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'C:/build/app.zip', releaseId: 1 }));
  });
});
