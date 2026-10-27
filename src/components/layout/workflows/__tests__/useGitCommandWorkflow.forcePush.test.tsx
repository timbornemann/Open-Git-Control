// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitCommandWorkflow } from '../useGitCommandWorkflow';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import { gitClient } from '@/services/gitClient';

const lease = `--force-with-lease=refs/heads/main:${'a'.repeat(40)}`;
const prepared = ['push', '--no-follow-tags', lease, 'origin', 'refs/heads/main:refs/heads/main'];
let root: Root, current: ReturnType<typeof useGitCommandWorkflow>;
let input: Parameters<typeof useGitCommandWorkflow>[0];
function Harness() {
  current = useGitCommandWorkflow(input);
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
  input = {
    workspace: { activeRepo: '/repo', addOpenRepo: vi.fn(), setActiveTab: vi.fn() },
    settings: { language: 'en', confirmDangerousOps: true, defaultBranch: 'main', secretScanBeforePushEnabled: false },
    onUpdateSettings: vi.fn(),
    triggerRefresh: vi.fn(),
    setConfirmDialog: vi.fn(),
    setGitActionToast: vi.fn(),
    setConflictResolverPath: vi.fn(),
  };
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repo, command) => ({
    success: true,
    data: command === 'prepareForcePush' ? JSON.stringify(prepared) : command === 'remote' ? 'origin' : '',
  }));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});
async function render() {
  await act(async () => root.render(createElement(Harness)));
}
async function run() {
  let result = false;
  await act(async () => {
    result = await current.runGitCommand(['push', '--force-with-lease'], 'Pushed');
  });
  return result;
}
function lastDialog(): ConfirmDialogState {
  return vi.mocked(input.setConfirmDialog).mock.calls.at(-1)![0] as ConfirmDialogState;
}
const commands = (name: string) => vi.mocked(gitClient.runGitCommandForRepo).mock.calls.filter(([, command]) => command === name);

describe('force push workflow', () => {
  it('pins the lease before confirmation and reuses it when the user approves', async () => {
    await render();
    expect(await run()).toBe(false);
    expect(commands('prepareForcePush')).toEqual([['/repo', 'prepareForcePush', '--force-with-lease']]);
    expect(commands('push')).toEqual([]);
    const dialog = lastDialog();
    expect(dialog.contextItems).toEqual(expect.arrayContaining([expect.objectContaining({ value: expect.stringContaining(lease) })]));
    await act(async () => {
      await dialog.onConfirm?.();
    });
    expect(commands('prepareForcePush')).toHaveLength(1);
    expect(commands('push')).toEqual([['/repo', 'push', ...prepared.slice(1)]]);
    expect(current.isGitActionRunningRef.current).toBe(false);
    expect(input.triggerRefresh).toHaveBeenCalled();
  });

  it('still pins the lease when dangerous-operation confirmations are disabled', async () => {
    input.settings.confirmDangerousOps = false;
    await render();
    expect(await run()).toBe(true);
    expect(commands('prepareForcePush')).toHaveLength(1);
    expect(commands('push')).toEqual([['/repo', 'push', ...prepared.slice(1)]]);
    expect(input.setConfirmDialog).not.toHaveBeenCalled();
  });

  it('does not push or open confirmation when preparation fails and releases the workflow lock', async () => {
    vi.mocked(gitClient.runGitCommandForRepo).mockImplementation(async (_repo, command) =>
      command === 'prepareForcePush' ? { success: false, error: 'Cannot read push references.' } : { success: true, data: 'origin' },
    );
    await render();
    expect(await run()).toBe(false);
    expect(commands('push')).toEqual([]);
    expect(input.setConfirmDialog).not.toHaveBeenCalled();
    expect(input.setGitActionToast).toHaveBeenCalledWith({ msg: 'Cannot read push references.', isError: true });
    expect(current.isGitActionRunningRef.current).toBe(false);
  });

  it('keeps the fixed lease through the subsequent secret-scan confirmation', async () => {
    input.settings.secretScanBeforePushEnabled = true;
    vi.spyOn(gitClient, 'scanPushSecrets').mockResolvedValue({
      success: true,
      data: {
        scanned: true,
        strictness: 'medium',
        notes: [],
        stats: { checkedLines: 1, stagedLines: 0, toPushLines: 1, tagLines: 0 },
        findings: [{ id: 'secret', ruleId: 'token', severity: 'high', source: 'to-push', filePath: '.env', lineNumber: 1, contextLine: '[REDACTED_SECRET]' }],
      },
    });
    vi.spyOn(gitClient, 'approveSecretScanPush').mockResolvedValue({ success: true, data: true });
    await render();
    await run();
    await act(async () => {
      await lastDialog().onConfirm?.();
    });
    expect(commands('push')).toEqual([]);
    expect(gitClient.scanPushSecrets).toHaveBeenCalledWith(expect.objectContaining({ repoPath: '/repo', pushArgs: prepared.slice(1) }));
    await act(async () => {
      await lastDialog().onConfirm?.();
    });
    expect(gitClient.approveSecretScanPush).toHaveBeenCalledWith(prepared.slice(1), '/repo');
    expect(commands('prepareForcePush')).toHaveLength(1);
    expect(commands('push')).toEqual([['/repo', 'push', ...prepared.slice(1)]]);
  });

  it('abandons preparation if the user switches repositories while it runs', async () => {
    let finish!: (value: { success: true; data: string }) => void;
    vi.mocked(gitClient.runGitCommandForRepo).mockImplementation(async (_repo, command) =>
      command === 'prepareForcePush'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { success: true, data: 'origin' },
    );
    await render();
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = current.runGitCommand(['push', '--force-with-lease'], 'Pushed');
    });
    input = { ...input, workspace: { ...input.workspace, activeRepo: '/other' } };
    await render();
    await act(async () => {
      finish({ success: true, data: JSON.stringify(prepared) });
      await pending;
    });
    expect(commands('push')).toEqual([]);
    expect(input.setConfirmDialog).not.toHaveBeenCalled();
    expect(current.isGitActionRunningRef.current).toBe(false);
  });
});
