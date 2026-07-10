import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { buildAddRemoteDialog, buildRemoveRemoteDialog, buildRenameRemoteDialog, buildSetRemoteUrlDialog } from './repositoryDomainDialogs';
import type { RepositoryRemote } from './repositoryDomainTypes';

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  language: AppLanguage;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
};

const parseRemotes = (rawRemoteOutput: string): { hasOrigin: boolean; remotes: RepositoryRemote[] } => {
  const lines = rawRemoteOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const remotes: RepositoryRemote[] = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length >= 2 && !seen.has(parts[0])) {
      seen.add(parts[0]);
      remotes.push({ name: parts[0], url: parts[1] });
    }
  }

  return {
    hasOrigin: lines.some((line) => line.startsWith('origin')),
    remotes,
  };
};

export const useRepositoryRemotes = ({ activeRepo, refreshTrigger, language, runGitCommand, setConfirmDialog, setInputDialog }: Params) => {
  const [remotes, setRemotes] = useState<RepositoryRemote[]>([]);
  const [hasRemoteOrigin, setHasRemoteOrigin] = useState<boolean | null>(null);
  const { t, tr } = useLanguageTranslations(language);
  const activeRepoRef = useRef(activeRepo);

  useEffect(() => {
    activeRepoRef.current = activeRepo;
  }, [activeRepo]);

  const runRemoteMutation = useCallback(
    async (repoAtDialogOpen: string | null, args: string[], successMsg: string) => {
      // A dialog can be confirmed after the user switched repositories. Do not
      // retarget a destructive remote mutation to the new active repository.
      if (!repoAtDialogOpen || activeRepoRef.current !== repoAtDialogOpen) return false;
      return runGitCommand(args, successMsg);
    },
    [runGitCommand],
  );

  useEffect(() => {
    if (!activeRepo || !gitClient.isAvailable()) {
      setHasRemoteOrigin(null);
      setRemotes([]);
      return;
    }

    let cancelled = false;
    const checkRemote = async () => {
      try {
        const result = await gitClient.runGitCommand('remote', '-v');
        if (cancelled) return;
        if (!result.success) return;

        const rawRemoteOutput = String(result.data || '');
        if (!rawRemoteOutput.trim()) {
          setHasRemoteOrigin(false);
          setRemotes([]);
          return;
        }

        const parsed = parseRemotes(rawRemoteOutput);
        setHasRemoteOrigin(parsed.hasOrigin);
        setRemotes(parsed.remotes);
      } catch {
        // Keep the last known remote configuration during transient refresh failures.
      }
    };

    checkRemote();
    return () => {
      cancelled = true;
    };
  }, [activeRepo, refreshTrigger]);

  const handleAddRemote = async () => {
    const repoAtDialogOpen = activeRepo;
    setInputDialog(
      buildAddRemoteDialog({
        activeRepo,
        t,
        tr,
        onAdd: async (name, url) => {
          await runRemoteMutation(repoAtDialogOpen, gitClient.buildAddRemoteArgs(name, url), tr(`Remote "${name}" hinzugefügt.`, `Added remote "${name}".`));
        },
      }),
    );
  };

  const handleRemoveRemote = async (remoteName: string) => {
    const repoAtDialogOpen = activeRepo;
    setConfirmDialog(
      buildRemoveRemoteDialog({
        activeRepo,
        remoteName,
        t,
        tr,
        onRemove: async () => {
          await runRemoteMutation(
            repoAtDialogOpen,
            gitClient.buildRemoveRemoteArgs(remoteName),
            tr(`Remote "${remoteName}" entfernt.`, `Removed remote "${remoteName}".`),
          );
        },
      }),
    );
  };

  const handleRenameRemote = async (remoteName: string) => {
    const repoAtDialogOpen = activeRepo;
    setInputDialog(
      buildRenameRemoteDialog({
        remoteName,
        t,
        tr,
        onRename: async (newName) => {
          await runRemoteMutation(
            repoAtDialogOpen,
            gitClient.buildRenameRemoteArgs(remoteName, newName),
            tr(`Remote umbenannt: "${remoteName}" -> "${newName}".`, `Renamed remote: "${remoteName}" -> "${newName}".`),
          );
        },
      }),
    );
  };

  const handleSetRemoteUrl = async (remoteName: string, currentUrl: string) => {
    const repoAtDialogOpen = activeRepo;
    setInputDialog(
      buildSetRemoteUrlDialog({
        remoteName,
        currentUrl,
        t,
        tr,
        onSetUrl: async (url) => {
          await runRemoteMutation(
            repoAtDialogOpen,
            gitClient.buildSetRemoteUrlArgs(remoteName, url),
            tr(`URL für "${remoteName}" aktualisiert.`, `Updated URL for "${remoteName}".`),
          );
        },
      }),
    );
  };

  return {
    remotes,
    setRemotes,
    hasRemoteOrigin,
    setHasRemoteOrigin,
    handleAddRemote,
    handleRemoveRemote,
    handleRenameRemote,
    handleSetRemoteUrl,
  };
};
