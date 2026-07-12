import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import type { ToastMessage } from '@/types/git';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { appClient } from '@/services/appClient';
import { addFindingPathsToSecretScanAllowlistText } from '@/shared/secretScanAllowlist';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { GitStatusWithConflicts } from './types';
import { getCommitFormDraft, resetCommitFormDraft, updateCommitFormDraft } from './commitFormDraft';

type Params = {
  repoPath: string | null;
  status: GitStatusWithConflicts | null;
  setToast: (msg: ToastMessage | null) => void;
  refresh: () => Promise<void>;
  onRepoChanged?: () => void;
  onCommitsCreated?: () => void;
  settings: AppSettingsDto;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
};

export const useCommitForm = ({
  repoPath,
  status,
  setToast,
  refresh,
  onRepoChanged,
  onCommitsCreated,
  settings,
  setConfirmDialog,
  onUpdateSettings,
}: Params) => {
  const { t, tr } = useI18n();
  const [commitMsg, setCommitMsgState] = useState(() => getCommitFormDraft(repoPath, settings.commitTemplate).commitMsg);
  const [commitDescription, setCommitDescriptionState] = useState(() => getCommitFormDraft(repoPath, settings.commitTemplate).commitDescription);
  const [amendCommit, setAmendCommit] = useState(false);
  const [signoffCommit, setSignoffCommit] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const isCommittingRef = useRef(false);
  const repoGenerationRef = useRef(0);
  const nextCommitOperationIdRef = useRef(0);
  const activeCommitOperationIdRef = useRef<number | null>(null);
  const isSecretScanInProgressRef = useRef(false);

  useLayoutEffect(() => {
    repoGenerationRef.current += 1;
    activeCommitOperationIdRef.current = null;
    isCommittingRef.current = false;
    setIsCommitting(false);
    setAmendCommit(false);
  }, [repoPath]);

  const setCommitMsg = useCallback(
    (value: string) => {
      setCommitMsgState(value);
      updateCommitFormDraft(repoPath, { commitMsg: value }, settings.commitTemplate);
    },
    [repoPath, settings.commitTemplate],
  );

  const setCommitDescription = useCallback(
    (value: string) => {
      setCommitDescriptionState(value);
      updateCommitFormDraft(repoPath, { commitDescription: value }, settings.commitTemplate);
    },
    [repoPath, settings.commitTemplate],
  );

  useEffect(() => {
    const draft = getCommitFormDraft(repoPath, settings.commitTemplate);
    setCommitMsgState(draft.commitMsg);
    setCommitDescriptionState(draft.commitDescription);
  }, [repoPath, settings.commitTemplate]);

  useEffect(() => {
    setSignoffCommit(Boolean(settings.commitSignoffByDefault));
  }, [settings.commitSignoffByDefault]);

  useEffect(() => {
    if (settings.commitTemplate) {
      setCommitMsgState((current) => {
        if (current.trim()) return current;
        updateCommitFormDraft(repoPath, { commitMsg: settings.commitTemplate }, settings.commitTemplate);
        return settings.commitTemplate;
      });
    }
  }, [repoPath, settings.commitTemplate]);

  useEffect(() => {
    if (!amendCommit || !repoPath || !gitClient.isAvailable()) return;
    // Prefilling the form from HEAD is async. If the repository (or amend
    // toggle) changes before it resolves, discard the result so the old repo's
    // HEAD message cannot overwrite the new repo's commit form.
    let cancelled = false;
    void gitClient.runGitCommandForRepo(repoPath, 'show', '--format=%B', '-s', 'HEAD').then((r) => {
      if (cancelled) return;
      if (r.success && typeof r.data === 'string') {
        const lines = r.data.trimEnd().split('\n');
        setCommitMsg(lines[0] || '');
        setCommitDescription(lines.slice(2).join('\n'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [amendCommit, repoPath, setCommitDescription, setCommitMsg]);

  const commitPreparedChanges = useCallback(async () => {
    if (isCommittingRef.current || !repoPath || !commitMsg.trim() || !gitClient.isAvailable() || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: t('generated.components.staging_area.useaicommit.please_resolve_all_conflicts_first_9e29c688'), isError: true });
      return;
    }

    if (status.staged.length === 0 && !amendCommit) {
      setToast({ msg: t('generated.components.staging_area.usecommitform.please_stage_files_first_51f233fa'), isError: true });
      return;
    }

    const repoAtStart = repoPath;
    const repoGeneration = repoGenerationRef.current;
    const operationId = ++nextCommitOperationIdRef.current;
    const isCurrentOperation = () => repoGenerationRef.current === repoGeneration && activeCommitOperationIdRef.current === operationId;
    activeCommitOperationIdRef.current = operationId;
    isCommittingRef.current = true;
    setIsCommitting(true);
    try {
      const title = commitMsg.trim();
      const description = commitDescription.trim();
      const r = await gitClient.createCommit({
        repoPath: repoAtStart,
        title,
        description,
        amend: amendCommit,
        signoff: signoffCommit,
      });
      if (r.success) {
        const nextDraft = resetCommitFormDraft(repoAtStart, settings.commitTemplate || '');
        if (!isCurrentOperation()) return;
        setCommitMsgState(nextDraft.commitMsg);
        setCommitDescriptionState(nextDraft.commitDescription);
        setAmendCommit(false);
        setToast({ msg: t('generated.components.staging_area.usecommitform.commit_successful_155eebd2'), isError: false });
        if (onCommitsCreated) onCommitsCreated();
        else if (onRepoChanged) onRepoChanged();
        await refresh();
      } else {
        if (isCurrentOperation()) {
          setToast({ msg: r.error || t('generated.components.staging_area.usecommitform.commit_failed_5c16676c'), isError: true });
        }
      }
    } catch (e: any) {
      if (isCurrentOperation()) setToast({ msg: e.message, isError: true });
    } finally {
      if (activeCommitOperationIdRef.current === operationId) {
        activeCommitOperationIdRef.current = null;
        isCommittingRef.current = false;
        if (repoGenerationRef.current === repoGeneration) setIsCommitting(false);
      }
    }
  }, [
    commitMsg,
    status,
    amendCommit,
    setToast,
    t,
    commitDescription,
    signoffCommit,
    repoPath,
    settings.commitTemplate,
    onCommitsCreated,
    onRepoChanged,
    refresh,
  ]);

  const addFindingsToAllowlist = useCallback(
    async (findings: { filePath: string }[]) => {
      const update = addFindingPathsToSecretScanAllowlistText(settings.secretScanAllowlist, findings);
      if (update.addedPaths.length === 0) return true;
      try {
        if (!appClient.isAvailable()) throw new Error(tr('Die Einstellungen sind nicht verfuegbar.', 'Settings are unavailable.'));
        await onUpdateSettings({ secretScanAllowlist: update.allowlistText });
        const persisted = await appClient.getSettings();
        const remaining = addFindingPathsToSecretScanAllowlistText(
          persisted.secretScanAllowlist,
          update.addedPaths.map((filePath) => ({ filePath })),
        );
        if (remaining.addedPaths.length > 0) {
          throw new Error(tr('Die Secret-Scan-Allowlist wurde nicht gespeichert.', 'The secret scan allowlist was not saved.'));
        }
        return true;
      } catch (error: unknown) {
        setToast({
          msg:
            error instanceof Error
              ? error.message
              : tr('Die Secret-Scan-Allowlist konnte nicht gespeichert werden.', 'Could not save the secret scan allowlist.'),
          isError: true,
        });
        return false;
      }
    },
    [onUpdateSettings, setToast, settings.secretScanAllowlist, tr],
  );

  const handleCommit = useCallback(async () => {
    if (isSecretScanInProgressRef.current || isCommittingRef.current || !repoPath || !commitMsg.trim() || !gitClient.isAvailable() || !status) return;

    if (status.conflicts.length > 0) {
      setToast({ msg: t('generated.components.staging_area.useaicommit.please_resolve_all_conflicts_first_9e29c688'), isError: true });
      return;
    }

    if (status.staged.length === 0 && !amendCommit) {
      setToast({ msg: t('generated.components.staging_area.usecommitform.please_stage_files_first_51f233fa'), isError: true });
      return;
    }

    if (!settings.secretScanBeforeCommitEnabled) {
      await commitPreparedChanges();
      return;
    }

    const repoAtStart = repoPath;
    isSecretScanInProgressRef.current = true;
    setIsCommitting(true);
    try {
      const scan = await gitClient.scanCommitSecrets({ repoPath: repoAtStart });
      if (!scan.success) {
        setToast({
          msg: scan.error || tr('Der Secret-Scan vor dem Commit ist fehlgeschlagen.', 'The secret scan before the commit failed.'),
          isError: true,
        });
        return;
      }

      const findings = scan.data.findings || [];
      if (findings.length === 0) {
        await commitPreparedChanges();
        return;
      }

      const continueCommit = async () => {
        const approval = await gitClient.approveSecretScanCommit(repoAtStart);
        if (!approval.success) {
          setToast({
            msg: tr(
              'Der Repository-Zustand hat sich geaendert. Bitte fuehre den Secret-Scan erneut aus.',
              'The repository state changed. Run the secret scan again before committing.',
            ),
            isError: true,
          });
          return;
        }
        await commitPreparedChanges();
      };

      setConfirmDialog({
        variant: 'danger',
        title: tr('Moegliche Secrets vor dem Commit erkannt', 'Potential secrets detected before commit'),
        message: tr(
          `${findings.length} moegliche Secret-Treffer wurden in den gestagten Aenderungen gefunden.`,
          `${findings.length} potential secret hit(s) were found in the staged changes.`,
        ),
        contextItems: findings.slice(0, 8).map((finding, index) => ({
          label: tr(`Treffer ${index + 1}`, `Finding ${index + 1}`),
          value: `${finding.filePath}:${finding.lineNumber}  ${finding.contextLine}`,
        })),
        irreversible: true,
        consequences: tr(
          'Pruefe die Dateien vor dem Commit. Das Allowlisten einer Datei unterdrueckt kuenftige Treffer in dieser Datei.',
          'Review the files before committing. Allowlisting a file suppresses future findings in that file.',
        ),
        confirmLabel: tr('Trotzdem committen', 'Commit anyway'),
        secondaryActionLabel: tr('Dateien allowlisten und committen', 'Allowlist files and commit'),
        secondaryActionVariant: 'default',
        onSecondaryAction: async () => {
          if (!(await addFindingsToAllowlist(findings))) return;
          await continueCommit();
        },
        onConfirm: continueCommit,
      });
    } catch (error: unknown) {
      setToast({
        msg: error instanceof Error ? error.message : tr('Der Secret-Scan vor dem Commit ist fehlgeschlagen.', 'The secret scan before the commit failed.'),
        isError: true,
      });
    } finally {
      isSecretScanInProgressRef.current = false;
      if (!isCommittingRef.current) setIsCommitting(false);
    }
  }, [
    addFindingsToAllowlist,
    amendCommit,
    commitMsg,
    commitPreparedChanges,
    repoPath,
    setConfirmDialog,
    setToast,
    settings.secretScanBeforeCommitEnabled,
    status,
    t,
    tr,
  ]);

  return {
    commitMsg,
    setCommitMsg,
    commitDescription,
    setCommitDescription,
    amendCommit,
    setAmendCommit,
    signoffCommit,
    setSignoffCommit,
    isCommitting,
    handleCommit,
  };
};
