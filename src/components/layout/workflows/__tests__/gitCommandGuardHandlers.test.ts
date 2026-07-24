import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import { runSecretScanGuard } from '@/components/layout/workflows/gitCommandGuardHandlers';
import { gitClient } from '@/services/gitClient';

describe('secret scan renderer approval', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not start the push when main rejects a stale approval', async () => {
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    vi.spyOn(gitClient, 'scanPushSecrets').mockResolvedValue({
      success: true,
      data: {
        scanned: true,
        strictness: 'medium',
        findings: [
          {
            id: 'finding-1',
            ruleId: 'token',
            severity: 'high',
            source: 'to-push',
            filePath: '.env',
            lineNumber: 1,
            contextLine: '[REDACTED_SECRET]',
          },
        ],
        notes: [],
        stats: { checkedLines: 1, stagedLines: 0, toPushLines: 1, tagLines: 0 },
      },
    });
    const approve = vi.spyOn(gitClient, 'approveSecretScanPush').mockResolvedValue({ success: false });
    const runWithOptions = vi.fn();
    const setConfirmDialog = vi.fn();
    const setGitActionToast = vi.fn();
    const runtime = {
      isRepoCurrent: vi.fn(() => true),
      runRemoteAheadQuickFix: vi.fn(),
      runWithOptions,
      setConfirmDialog,
      setGitActionToast,
      t: (key: string) => key,
      tr: (_de: string, en: string) => en,
    } as any;

    await expect(
      runSecretScanGuard(
        {
          args: ['push', 'origin', 'main'],
          command: 'push',
          successMsg: 'pushed',
          repoPath: 'C:/repo',
        },
        runtime,
        false,
      ),
    ).resolves.toBe(true);

    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    await dialog.onConfirm?.();

    expect(approve).toHaveBeenCalledWith(['origin', 'main'], 'C:/repo');
    expect(runWithOptions).not.toHaveBeenCalled();
    expect(setGitActionToast).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
  });

  it('adds finding paths to the allowlist before continuing the approved push', async () => {
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    const findings = [
      {
        id: 'finding-1',
        ruleId: 'token',
        severity: 'high' as const,
        source: 'to-push' as const,
        filePath: '.env',
        lineNumber: 1,
        contextLine: '[REDACTED_SECRET]',
      },
    ];
    vi.spyOn(gitClient, 'scanPushSecrets').mockResolvedValue({
      success: true,
      data: {
        scanned: true,
        strictness: 'medium',
        findings,
        notes: [],
        stats: { checkedLines: 1, stagedLines: 0, toPushLines: 1, tagLines: 0 },
      },
    });
    const approve = vi.spyOn(gitClient, 'approveSecretScanPush').mockResolvedValue({ success: true });
    const addSecretScanFindingsToAllowlist = vi.fn().mockResolvedValue(true);
    const runWithOptions = vi.fn();
    const setConfirmDialog = vi.fn();
    const runtime = {
      isRepoCurrent: vi.fn(() => true),
      runRemoteAheadQuickFix: vi.fn(),
      runWithOptions,
      setConfirmDialog,
      setGitActionToast: vi.fn(),
      addSecretScanFindingsToAllowlist,
      t: (key: string) => key,
      tr: (_de: string, en: string) => en,
    } as any;

    await runSecretScanGuard(
      {
        args: ['push', 'origin', 'main'],
        command: 'push',
        successMsg: 'pushed',
        repoPath: 'C:/repo',
      },
      runtime,
      false,
    );

    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    expect(dialog.secondaryActionLabel).toBe('Allowlist files and push');
    await dialog.onSecondaryAction?.();

    expect(addSecretScanFindingsToAllowlist).toHaveBeenCalledWith(findings);
    expect(approve).toHaveBeenCalledWith(['origin', 'main'], 'C:/repo');
    expect(runWithOptions).toHaveBeenCalledWith(
      ['push', 'origin', 'main'],
      'pushed',
      undefined,
      expect.objectContaining({ expectedRepoPath: 'C:/repo', skipSecretScan: true }),
    );
  });

  it('retries a timed-out scan instead of offering an unscanned bypass', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    vi.spyOn(gitClient, 'scanPushSecrets').mockReturnValue(
      new Promise(() => {
        // Intentionally unresolved so the workflow's timeout wins the race.
      }),
    );
    vi.spyOn(gitClient, 'cancelSecretScan').mockResolvedValue({ success: true, cancelled: true });
    const approve = vi.spyOn(gitClient, 'approveSecretScanPush');
    const runWithOptions = vi.fn();
    const setConfirmDialog = vi.fn();
    const runtime = {
      isRepoCurrent: vi.fn(() => true),
      runRemoteAheadQuickFix: vi.fn(),
      runWithOptions,
      setConfirmDialog,
      setGitActionToast: vi.fn(),
      t: (key: string) => key,
      tr: (_de: string, en: string) => en,
    } as any;

    const guardResult = runSecretScanGuard(
      {
        args: ['push', 'origin', 'main'],
        command: 'push',
        successMsg: 'pushed',
        repoPath: 'C:/repo',
      },
      runtime,
      false,
    );
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(guardResult).resolves.toBe(true);

    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    expect(dialog.confirmLabel).toBe('Retry secret scan');
    await dialog.onConfirm?.();

    expect(approve).not.toHaveBeenCalled();
    expect(runWithOptions).toHaveBeenCalledWith(
      ['push', 'origin', 'main'],
      'pushed',
      undefined,
      expect.objectContaining({ expectedRepoPath: 'C:/repo', skipSecretScan: false }),
    );
  });

  it('allows a progressing scan to exceed the former fifteen-second deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    vi.spyOn(gitClient, 'scanPushSecrets').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                success: true,
                data: {
                  scanned: true,
                  strictness: 'medium',
                  findings: [],
                  notes: ['Scanned a large history.'],
                  stats: { checkedLines: 500, stagedLines: 0, toPushLines: 500, tagLines: 0 },
                },
              }),
            20_000,
          );
        }),
    );
    const cancel = vi.spyOn(gitClient, 'cancelSecretScan');
    const runtime = {
      isRepoCurrent: vi.fn(() => true),
      runRemoteAheadQuickFix: vi.fn(),
      runWithOptions: vi.fn(),
      setConfirmDialog: vi.fn(),
      setGitActionToast: vi.fn(),
      t: (key: string) => key,
      tr: (_de: string, en: string) => en,
    } as any;

    const guardResult = runSecretScanGuard(
      {
        args: ['push', 'origin', 'main'],
        command: 'push',
        successMsg: 'pushed',
        repoPath: 'C:/repo',
      },
      runtime,
      false,
    );
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(guardResult).resolves.toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(runtime.setConfirmDialog).not.toHaveBeenCalled();
  });

  it('shows a warning toast when the push source scan falls back to HEAD', async () => {
    vi.spyOn(gitClient, 'scanPushSecrets').mockResolvedValue({
      success: true,
      data: {
        scanned: true,
        strictness: 'medium',
        findings: [],
        notes: [],
        historyScanIncomplete: true,
        stats: { checkedLines: 1, stagedLines: 0, toPushLines: 1, tagLines: 0 },
      },
    });
    const runtime = {
      isRepoCurrent: vi.fn(() => true),
      runRemoteAheadQuickFix: vi.fn(),
      runWithOptions: vi.fn(),
      setConfirmDialog: vi.fn(),
      setGitActionToast: vi.fn(),
      t: (key: string) => key,
      tr: (_de: string, en: string) => en,
    } as any;

    await expect(
      runSecretScanGuard({ args: ['push', 'origin', 'main'], command: 'push', successMsg: 'pushed', repoPath: 'C:/repo' }, runtime, false),
    ).resolves.toBe(false);

    expect(runtime.setGitActionToast).toHaveBeenCalledWith(expect.objectContaining({ isError: true, msg: expect.stringContaining('could not be fully read') }));
  });
});
