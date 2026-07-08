import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import { gitClient } from '../../../services/gitClient';
import { isWorkTreeRequiredError } from '../../../utils/gitPushRecovery';
import type { AppTabId } from '../sidebar/AppSidebar.types';
import type { ConfirmDialogState } from '../layoutTypes';

type Toast = { msg: string; isError: boolean };

type Params = {
  recoverBareRepoForPush: () => Promise<boolean>;
  setActiveTab: (tab: AppTabId) => void;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  language: AppLanguage;
};

export const useInitialCommitRecoveryWorkflow = ({
  recoverBareRepoForPush,
  setActiveTab,
  setConfirmDialog,
  setGitActionToast,
  language,
}: Params) => {
  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(language, deText, enText);
  }, [language]);
  const ensureInitialCommitForPush = useCallback(async (
    options: { skipBareRepoRecovery?: boolean } = {},
  ): Promise<boolean> => {
    if (!gitClient.isAvailable()) return false;

    const commitMessage = tr('Initial commit', 'Initial commit');
    const isIdentityMissingError = (message: string) => (
      /please tell me who you are/i.test(message)
      || /unable to auto-detect email address/i.test(message)
      || /user\.name/i.test(message)
      || /user\.email/i.test(message)
    );
    const isNothingToCommitError = (message: string) => (
      /nothing to commit/i.test(message)
      || /working tree clean/i.test(message)
    );

    const statusResult = await gitClient.getStatusPorcelain();
    const hasChanges = Boolean(statusResult.success && String(statusResult.data || '').trim().length > 0);

    if (hasChanges) {
      const addResult = await gitClient.stageAll();
      if (!addResult.success) {
        setGitActionToast({
          msg: addResult.error || tr('Konnte Aenderungen nicht automatisch stagen.', 'Could not stage changes automatically.'),
          isError: true,
        });
        return false;
      }
    }

    const commitResult = hasChanges
      ? await gitClient.commitMessage(commitMessage)
      : await gitClient.commitAllowEmpty(commitMessage);
    if (commitResult.success) {
      return true;
    }

    const commitError = String(commitResult.error || '');
    if (isNothingToCommitError(commitError)) {
      const emptyCommitResult = await gitClient.commitAllowEmpty(commitMessage);
      if (emptyCommitResult.success) {
        return true;
      }
      const emptyCommitError = String(emptyCommitResult.error || '');
      if (!options.skipBareRepoRecovery && isWorkTreeRequiredError(emptyCommitError)) {
        const recovered = await recoverBareRepoForPush();
        if (!recovered) {
          return false;
        }
        return ensureInitialCommitForPush({ skipBareRepoRecovery: true });
      }
      if (isIdentityMissingError(String(emptyCommitResult.error || ''))) {
        setActiveTab('repo');
        setGitActionToast({
          msg: tr(
            'Push konnte nicht automatisch vorbereitet werden: Git user.name/user.email fehlt. Bitte Git-Identity konfigurieren.',
            'Could not auto-prepare push: missing Git user.name/user.email. Please configure your Git identity.',
          ),
          isError: true,
        });
        return false;
      }
      setGitActionToast({
        msg: emptyCommitResult.error || tr('Automatischer Initial-Commit fehlgeschlagen.', 'Automatic initial commit failed.'),
        isError: true,
      });
      return false;
    }

    if (!options.skipBareRepoRecovery && isWorkTreeRequiredError(commitError)) {
      const recovered = await recoverBareRepoForPush();
      if (!recovered) {
        return false;
      }
      return ensureInitialCommitForPush({ skipBareRepoRecovery: true });
    }

    if (isIdentityMissingError(commitError)) {
      setActiveTab('repo');
      setGitActionToast({
        msg: tr(
          'Push konnte nicht automatisch vorbereitet werden: Git user.name/user.email fehlt. Bitte Git-Identity konfigurieren.',
          'Could not auto-prepare push: missing Git user.name/user.email. Please configure your Git identity.',
        ),
        isError: true,
      });
      return false;
    }

    setGitActionToast({
      msg: commitResult.error || tr('Automatischer Initial-Commit fehlgeschlagen.', 'Automatic initial commit failed.'),
      isError: true,
    });
    return false;
  }, [recoverBareRepoForPush, setActiveTab, setGitActionToast, tr]);

  const requestInitialCommitConfirmationIfNeeded = useCallback(async (
    params: {
      commandLabel: string;
      confirmLabel: string;
      onConfirm: () => Promise<void>;
    },
  ): Promise<boolean> => {
    if (!gitClient.isAvailable()) return false;

    let changedFiles: number | null = null;
    try {
      const statusResult = await gitClient.getStatusPorcelain();
      if (statusResult.success) {
        changedFiles = String(statusResult.data || '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .length;
      }
    } catch {
      changedFiles = null;
    }

    if (changedFiles === 0) {
      return false;
    }

    setActiveTab('repo');
    setConfirmDialog({
      variant: 'danger',
      title: tr('Initial-Commit mit allen lokalen Aenderungen?', 'Initial commit with all local changes?'),
      message: tr(
        'Dieses Repository hat noch keinen lokalen Commit. Zum Pushen muessten jetzt alle lokalen Aenderungen inklusive untracked Dateien gestaged und als Initial-Commit gespeichert werden.',
        'This repository has no local commit yet. To push it now, all local changes including untracked files would be staged and saved as the initial commit.',
      ),
      contextItems: [
        { label: tr('Befehl', 'Command'), value: params.commandLabel },
        {
          label: tr('Lokale Aenderungen', 'Local changes'),
          value: changedFiles === null
            ? tr('Status konnte nicht gelesen werden', 'Status could not be read')
            : tr(
              `${changedFiles} Datei${changedFiles === 1 ? '' : 'en'} betroffen`,
              `${changedFiles} file${changedFiles === 1 ? '' : 's'} affected`,
            ),
        },
        {
          label: tr('Automatischer Schritt', 'Automatic step'),
          value: 'git add -A && git commit -m "Initial commit"',
        },
      ],
      irreversible: false,
      consequences: tr(
        'Bitte pruefe vorher, ob keine lokalen Artefakte, Secrets oder versehentlich erzeugten Dateien im Working Tree liegen.',
        'Please check first that the working tree does not contain local artifacts, secrets, or accidentally generated files.',
      ),
      confirmLabel: params.confirmLabel,
      onConfirm: params.onConfirm,
    });
    return true;
  }, [setActiveTab, setConfirmDialog, tr]);


  return {
    ensureInitialCommitForPush,
    requestInitialCommitConfirmationIfNeeded,
  };
};
