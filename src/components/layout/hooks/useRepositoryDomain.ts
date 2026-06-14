import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { BranchInfo, GitMergeMode, GitSubmoduleInfo, RemoteSyncState } from '../../../types/git';
import { normalizeBranchRefForMerge, parseBranchSyncFromPorcelainV2, parseGitSubmoduleStatus } from '../../../utils/gitParsing';
import { validateBranchName } from '../../../utils/gitRefValidation';
import { isRemoteRepositoryMissingError } from '../../../utils/gitPushRecovery';
import { getLocale, trByLanguage, type AppLanguage } from '../../../i18n';
import { ConfirmDialogState, InputDialogState, BranchContextMenuState, RemoteStatusInfo } from '../layoutTypes';
import { formatTime } from '../../../utils/dateTime';

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  triggerRefresh: () => void;
  setGitActionToast: (toast: { msg: string; isError: boolean }) => void;
  setActiveGitActionLabel: Dispatch<SetStateAction<string | null>>;
  isGitActionRunningRef: MutableRefObject<boolean>;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  autoFetchIntervalMs: number;
  language: AppLanguage;
  onNavigateToCommit: (hash: string) => void;
};

export const useRepositoryDomain = ({
  activeRepo,
  refreshTrigger,
  triggerRefresh,
  setGitActionToast,
  setActiveGitActionLabel,
  isGitActionRunningRef,
  runGitCommand,
  setConfirmDialog,
  setInputDialog,
  autoFetchIntervalMs,
  language,
  onNavigateToCommit,
}: Params) => {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchContextMenu, setBranchContextMenu] = useState<BranchContextMenuState>(null);
  const newBranchInputRef = useRef<HTMLInputElement | null>(null);

  const [tags, setTags] = useState<string[]>([]);
  const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([]);
  const [hasRemoteOrigin, setHasRemoteOrigin] = useState<boolean | null>(null);
  const [submodules, setSubmodules] = useState<GitSubmoduleInfo[]>([]);

  const [remoteSync, setRemoteSync] = useState<RemoteSyncState>({
    isFetching: false,
    lastFetchedAt: null,
    lastFetchError: null,
    ahead: 0,
    behind: 0,
    hasUpstream: false,
  });

  const isRemoteFetchRunningRef = useRef(false);
  const tr = (deText: string, enText: string) => trByLanguage(language, deText, enText);

  const getRemoteBranchShortName = useCallback((branchName: string) => (
    branchName.replace(/^remotes\/[^/]+\//, '')
  ), []);

  const mergeModeArgs = useCallback((mode: GitMergeMode): string[] => {
    if (mode === 'noFf') return ['--no-ff'];
    if (mode === 'squash') return ['--squash'];
    if (mode === 'ffOnly') return ['--ff-only'];
    return [];
  }, []);

  const mergeModeLabel = useCallback((mode: GitMergeMode): string => {
    if (mode === 'noFf') return tr('Ohne Fast-Forward (--no-ff)', 'No fast-forward (--no-ff)');
    if (mode === 'squash') return tr('Squash-Merge (--squash)', 'Squash merge (--squash)');
    if (mode === 'ffOnly') return tr('Nur Fast-Forward (--ff-only)', 'Fast-forward only (--ff-only)');
    return tr('Standard', 'Default');
  }, [language]);

  const formatLastFetchedAt = useCallback((timestamp: number | null) => {
    if (!timestamp) return tr('Noch nicht aktualisiert', 'Not updated yet');
    const locale = getLocale(language);
    return tr('Zuletzt aktualisiert', 'Last updated') + ': ' + formatTime(timestamp, locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [language]);

  useEffect(() => {
    if (!activeRepo || !window.electronAPI) {
      setBranches([]);
      setCurrentBranch('');
      setHasRemoteOrigin(null);
      return;
    }

    const fetchBranches = async () => {
      try {
        const { success, data } = await window.electronAPI.runGitCommand('branch', '-a');
        if (success && data) {
          const lines = data.split('\n').filter((l: string) => l.trim().length > 0);
          const parsedBranches = lines
            .map((line: string): BranchInfo | null => {
              const isHead = line.startsWith('*');
              const name = line.replace('*', '').trim();
              if (name.includes(' -> ')) return null;

              const scope: BranchInfo['scope'] = name.startsWith('remotes/') ? 'remote' : 'local';
              return { name, isHead, scope };
            })
            .filter((branch: BranchInfo | null): branch is BranchInfo => branch !== null);

          const headRaw = parsedBranches.find((b: BranchInfo) => b.isHead)?.name ?? '';
          const head = /^\((HEAD detached|no branch)/i.test(headRaw) ? '' : headRaw;
          setCurrentBranch(head);
          setBranches(parsedBranches);
        }
      } catch {
        // Keep the last known branch list during transient refresh failures.
      }
    };
    fetchBranches();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    const fetchRemoteTracking = async () => {
      if (!activeRepo || !window.electronAPI) {
        setRemoteSync(prev => ({ ...prev, ahead: 0, behind: 0, hasUpstream: false }));
        return;
      }

      try {
        const { success, data } = await window.electronAPI.runGitCommand('status', '--porcelain=v2', '--branch');
        if (!success || !data) {
          return;
        }

        const parsed = parseBranchSyncFromPorcelainV2(String(data));

        setRemoteSync(prev => ({
          ...prev,
          ahead: parsed.ahead,
          behind: parsed.behind,
          hasUpstream: parsed.hasUpstream,
        }));
      } catch {
        // Keep the last known tracking state during transient refresh failures.
      }
    };

    fetchRemoteTracking();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    const checkRemote = async () => {
      if (!activeRepo || !window.electronAPI) {
        setHasRemoteOrigin(null);
        setRemotes([]);
        return;
      }
      try {
        const r = await window.electronAPI.runGitCommand('remote', '-v');
        if (!r.success) {
          return;
        }

        const rawRemoteOutput = String(r.data || '');
        if (!rawRemoteOutput.trim()) {
          setHasRemoteOrigin(false);
          setRemotes([]);
          return;
        }
        const lines = rawRemoteOutput
          .split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        const hasOrigin = lines.some(line => line.startsWith('origin'));
        setHasRemoteOrigin(hasOrigin);
        const seen = new Set<string>();
        const parsed: { name: string; url: string }[] = [];
        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2 && !seen.has(parts[0])) {
            seen.add(parts[0]);
            parsed.push({ name: parts[0], url: parts[1] });
          }
        }
        setRemotes(parsed);
      } catch {
        // Keep the last known remote configuration during transient refresh failures.
      }
    };
    checkRemote();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    if (!activeRepo || !window.electronAPI) {
      setTags([]);
      return;
    }
    const fetchTags = async () => {
      try {
        const { success, data } = await window.electronAPI.runGitCommand('tag', '-l');
        if (success && data) {
          setTags(
            String(data)
              .split('\n')
              .map((t: string) => t.trim())
              .filter((t: string) => t.length > 0)
          );
        } else {
          setTags([]);
        }
      } catch {
        setTags([]);
      }
    };
    fetchTags();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    if (isCreatingBranch && newBranchInputRef.current) {
      newBranchInputRef.current.focus();
    }
  }, [isCreatingBranch]);

  useEffect(() => {
    if (!branchContextMenu) return;
    const close = () => setBranchContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [branchContextMenu]);

  const refreshRemoteState = useCallback(async (showToast = false) => {
    if (!window.electronAPI || !activeRepo) return false;
    if (isRemoteFetchRunningRef.current || isGitActionRunningRef.current) return false;

    isRemoteFetchRunningRef.current = true;
    setActiveGitActionLabel(tr('Fetch wird ausgeführt...', 'Running fetch...'));
    setRemoteSync(prev => ({ ...prev, isFetching: true }));

    try {
      const result = await window.electronAPI.runGitCommand('fetch', '--all', '--prune', '--tags', '--quiet');
      if (result.success) {
        setRemoteSync(prev => ({ ...prev, isFetching: false, lastFetchedAt: Date.now(), lastFetchError: null }));
        triggerRefresh();
        if (showToast) {
          setGitActionToast({ msg: tr('Remote aktualisiert.', 'Remote updated.'), isError: false });
        }
        return true;
      }

      const errorMessage = String(result.error || tr('Remote konnte nicht aktualisiert werden.', 'Could not update remote.'));
      if (isRemoteRepositoryMissingError(errorMessage)) {
        const removeOriginResult = await window.electronAPI.runGitCommand('remote', 'remove', 'origin');
        const removeOriginError = String(removeOriginResult.error || '').trim();
        const originAlreadyMissing = /no such remote\s+'?origin'?/i.test(removeOriginError);

        if (removeOriginResult.success || originAlreadyMissing) {
          setHasRemoteOrigin(false);
          setRemotes((prev) => prev.filter((remote) => remote.name !== 'origin'));
          setRemoteSync((prev) => ({
            ...prev,
            isFetching: false,
            lastFetchedAt: null,
            lastFetchError: null,
            ahead: 0,
            behind: 0,
            hasUpstream: false,
          }));
          triggerRefresh();
          setGitActionToast({
            msg: tr(
              'GitHub-Repository nicht mehr vorhanden: origin wurde entfernt. Repository ist jetzt lokal/offline.',
              'GitHub repository no longer exists: origin was removed. Repository is now local/offline.',
            ),
            isError: false,
          });
          return true;
        }
      }
      setRemoteSync(prev => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
      if (showToast) {
        setGitActionToast({ msg: errorMessage, isError: true });
      }
      return false;
    } catch (e: any) {
      const errorMessage = e?.message || tr('Remote konnte nicht aktualisiert werden.', 'Could not update remote.');
      setRemoteSync(prev => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
      if (showToast) {
        setGitActionToast({ msg: errorMessage, isError: true });
      }
      return false;
    } finally {
      isRemoteFetchRunningRef.current = false;
      setActiveGitActionLabel(current => (current === tr('Fetch wird ausgeführt...', 'Running fetch...') ? null : current));
    }
  }, [activeRepo, isGitActionRunningRef, setActiveGitActionLabel, setGitActionToast, triggerRefresh, language]);

  useEffect(() => {
    if (!activeRepo) {
      setRemoteSync({
        isFetching: false,
        lastFetchedAt: null,
        lastFetchError: null,
        ahead: 0,
        behind: 0,
        hasUpstream: false,
      });
      return;
    }

    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refreshRemoteState();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshRemoteState();
      }
    };

    void refreshRemoteState();
    const intervalId = window.setInterval(() => {
      refreshIfVisible();
    }, autoFetchIntervalMs);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [activeRepo, autoFetchIntervalMs, refreshRemoteState]);


  useEffect(() => {
    const fetchSubmodules = async () => {
      if (!activeRepo || !window.electronAPI) {
        setSubmodules([]);
        return;
      }

      try {
        const response = await window.electronAPI.runGitCommand('submoduleStatus');
        if (!response.success) {
          setSubmodules([]);
          return;
        }

        const parsed = parseGitSubmoduleStatus(String(response.data || '')).map((item) => ({
          path: item.path,
          commit: item.commit,
          stateCode: item.stateCode,
          isDirty: item.isDirty,
          summary: item.summary,
        }));
        setSubmodules(parsed);
      } catch {
        setSubmodules([]);
      }
    };

    fetchSubmodules();
  }, [activeRepo, refreshTrigger]);

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    const branchNameError = validateBranchName(name);
    if (branchNameError) {
      setGitActionToast({
        msg: tr('Ungueltiger Branch-Name. Bitte Eingabe pruefen.', 'Invalid branch name. Please check the input.'),
        isError: true,
      });
      return;
    }
    setIsCreatingBranch(false);
    setNewBranchName('');
    const created = await runGitCommand(['checkout', '-b', name], tr(`Branch "${name}" erstellt.`, `Created branch "${name}".`));
    if (!created) return;

    if (!hasRemoteOrigin) {
      return;
    }

    await runGitCommand(
      ['push', '-u', 'origin', name],
      tr(`Branch "${name}" erstellt, auf origin veroeffentlicht und Upstream gesetzt.`, `Created branch "${name}", pushed to origin, and set upstream.`),
      tr(`Neuer Branch "${name}" wird auf origin veroeffentlicht...`, `Publishing new branch "${name}" to origin...`),
    );
  };

  const handleDeleteBranch = async (branchName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: tr('Branch löschen?', 'Delete branch?'),
      message: tr('Der lokale Branch wird entfernt.', 'The local branch will be removed.'),
      contextItems: [
        { label: tr('Branch', 'Branch'), value: branchName },
        { label: tr('Aktiver Branch', 'Active branch'), value: currentBranch || tr('(unbekannt)', '(unknown)') },
      ],
      irreversible: false,
      consequences: tr('Wenn der Branch nicht auf dem Remote liegt, kann Arbeit verloren gehen.', 'If the branch is not on remote, work may be lost.'),
      confirmLabel: tr('Branch löschen', 'Delete branch'),
      onConfirm: async () => {
        const ok = await runGitCommand(['branch', '-d', branchName], tr(`Branch "${branchName}" gelöscht.`, `Deleted branch "${branchName}".`));
        if (!ok) {
          setConfirmDialog({
            variant: 'danger',
            title: tr('Branch force-löschen?', 'Force-delete branch?'),
            message: tr('Der Branch ist noch nicht vollständig gemergt. Trotzdem löschen (--force)?', 'The branch is not fully merged yet. Delete anyway (--force)?'),
            contextItems: [{ label: tr('Branch', 'Branch'), value: branchName }],
            irreversible: true,
            consequences: tr('Commits die nur in diesem Branch liegen gehen unwiderruflich verloren.', 'Commits only in this branch will be permanently lost.'),
            confirmLabel: tr('Force-Delete', 'Force-delete'),
            onConfirm: async () => {
              await runGitCommand(['branch', '-D', branchName], tr(`Branch "${branchName}" force-gelöscht.`, `Force-deleted branch "${branchName}".`));
            },
          });
        }
      },
    });
  };

  const handleMergeBranch = async (branchName: string, mode: GitMergeMode = 'default') => {
    const mergeTarget = normalizeBranchRefForMerge(branchName);
    const flags = mergeModeArgs(mode);
    const cmdPreview = ['merge', ...flags, mergeTarget].join(' ');
    setConfirmDialog({
      variant: 'confirm',
      title: tr('Branch mergen?', 'Merge branch?'),
      message: tr('Der ausgewählte Branch wird in den aktuellen Branch gemergt.', 'The selected branch will be merged into the current branch.'),
      contextItems: [
        { label: tr('Quelle', 'Source'), value: branchName },
        { label: tr('Merge-Ziel (ref)', 'Merge ref'), value: mergeTarget },
        { label: tr('Modus', 'Mode'), value: mergeModeLabel(mode) },
        { label: tr('Ziel-Branch', 'Target branch'), value: currentBranch || tr('(unbekannt)', '(unknown)') },
        { label: tr('Befehl', 'Command'), value: `git ${cmdPreview}` },
      ],
      irreversible: false,
      consequences: tr('Es kann zu Konflikten kommen. Bei Erfolg entsteht ggf. ein neuer Merge-Commit.', 'Conflicts may occur. On success, a new merge commit may be created.'),
      confirmLabel: tr('Merge starten', 'Start merge'),
      onConfirm: async () => {
        await runGitCommand(
          ['merge', ...flags, mergeTarget],
          tr(`Branch "${mergeTarget}" gemergt.`, `Merged branch "${mergeTarget}".`),
        );
      },
    });
  };

  const handleRenameBranch = async (oldName: string) => {
    setInputDialog({
      title: tr('Branch umbenennen', 'Rename branch'),
      message: tr('Gib den neuen Namen für den Branch ein.', 'Enter the new branch name.'),
      fields: [
        {
          id: 'newName',
          label: tr('Neuer Branch-Name', 'New branch name'),
          defaultValue: oldName,
          required: true,
          helperText: tr('Der Name darf nicht leer sein und sollte eindeutig sein.', 'Name must not be empty and should be unique.'),
          validate: (value) => {
            const trimmed = value.trim();
            if (!trimmed || trimmed === oldName) return null;
            const errorCode = validateBranchName(trimmed);
            if (!errorCode) return null;
            if (errorCode === 'contains-space') {
              return tr('Branch-Name darf keine Leerzeichen enthalten.', 'Branch name must not contain spaces.');
            }
            return tr('Ungueltiger Branch-Name.', 'Invalid branch name.');
          },
        },
      ],
      contextItems: [{ label: tr('Bisheriger Name', 'Current name'), value: oldName }],
      irreversible: false,
      consequences: tr('Lokale Referenzen werden aktualisiert. Remotes müssen ggf. separat angepasst werden.', 'Local references are updated. Remotes may need separate updates.'),
      confirmLabel: tr('Umbenennen', 'Rename'),
      onSubmit: async (values) => {
        const newName = (values.newName || '').trim();
        if (!newName || newName === oldName) return;
        await runGitCommand(['branch', '-m', oldName, newName], tr(`Branch umbenannt: "${oldName}" -> "${newName}".`, `Renamed branch: "${oldName}" -> "${newName}".`));
      },
    });
  };

  const handleCreateTag = async () => {
    setInputDialog({
      title: tr('Tag erstellen', 'Create tag'),
      message: tr('Lege einen neuen Tag an.', 'Create a new tag.'),
      fields: [
        { id: 'name', label: tr('Tag-Name', 'Tag name'), placeholder: 'v1.2.3', required: true },
        { id: 'message', label: tr('Tag-Nachricht (optional)', 'Tag message (optional)'), placeholder: tr('Release-Notiz', 'Release note') },
      ],
      contextItems: [{ label: tr('Branch', 'Branch'), value: currentBranch || tr('(unbekannt)', '(unknown)') }],
      irreversible: false,
      consequences: tr('Annotierte Tags speichern zusätzlich Metadaten und Nachricht.', 'Annotated tags store additional metadata and message.'),
      confirmLabel: tr('Tag erstellen', 'Create tag'),
      onSubmit: async (values) => {
        const name = (values.name || '').trim();
        if (!name) return;
        const msg = (values.message || '').trim();
        if (msg) {
          await runGitCommand(['tag', '-a', name, '-m', msg], tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`));
        } else {
          await runGitCommand(['tag', name], tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`));
        }
      },
    });
  };

  const handleDeleteTag = async (tagName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: tr('Tag löschen?', 'Delete tag?'),
      message: tr('Der Tag wird lokal entfernt.', 'The tag will be removed locally.'),
      contextItems: [{ label: tr('Tag', 'Tag'), value: tagName }],
      irreversible: false,
      consequences: tr('Falls der Tag bereits gepusht wurde, bleibt er auf dem Remote bestehen bis zum expliziten Entfernen.', 'If already pushed, the tag remains on remote until explicitly removed there.'),
      confirmLabel: tr('Tag löschen', 'Delete tag'),
      onConfirm: async () => {
        await runGitCommand(['tag', '-d', tagName], tr(`Tag "${tagName}" gelöscht.`, `Deleted tag "${tagName}".`));
      },
    });
  };

  const handleSelectTag = useCallback(async (tagName: string) => {
    if (!activeRepo || !window.electronAPI) return;

    try {
      const tagRef = `refs/tags/${tagName}^{commit}`;
      const result = await window.electronAPI.runGitCommand('show', '--quiet', '--format=%H', tagRef);
      const hash = String(result.data || '').trim().split(/\s+/)[0] || '';

      if (!result.success || !/^[0-9a-f]{40}$/i.test(hash)) {
        setGitActionToast({
          msg: result.error || tr(`Commit fuer Tag "${tagName}" konnte nicht gefunden werden.`, `Could not find the commit for tag "${tagName}".`),
          isError: true,
        });
        return;
      }

      onNavigateToCommit(hash);
    } catch (error: any) {
      setGitActionToast({
        msg: error?.message || tr(`Tag "${tagName}" konnte nicht geoeffnet werden.`, `Could not open tag "${tagName}".`),
        isError: true,
      });
    }
  }, [activeRepo, onNavigateToCommit, setGitActionToast, language]);

  const handlePushTags = async () => {
    await runGitCommand(['push', '--tags'], tr('Tags gepusht.', 'Pushed tags.'));
  };

  const handleAddRemote = async () => {
    setInputDialog({
      title: tr('Remote hinzufügen', 'Add remote'),
      message: tr('Verbinde dieses Repository mit einem weiteren Remote.', 'Connect this repository to another remote.'),
      fields: [
        { id: 'name', label: tr('Remote-Name', 'Remote name'), placeholder: 'origin', required: true },
        { id: 'url', label: tr('Remote-URL', 'Remote URL'), placeholder: 'https://github.com/owner/repo.git', required: true, type: 'url' },
      ],
      contextItems: [{ label: tr('Repository', 'Repository'), value: activeRepo ? (activeRepo.split(/[\\/]/).pop() || activeRepo) : tr('(unbekannt)', '(unknown)') }],
      irreversible: false,
      consequences: tr('Der Remote wird in der lokalen Git-Konfiguration gespeichert.', 'Remote will be saved in local Git config.'),
      confirmLabel: tr('Remote speichern', 'Save remote'),
      onSubmit: async (values) => {
        const name = (values.name || '').trim();
        const url = (values.url || '').trim();
        if (!name || !url) return;
        await runGitCommand(['remote', 'add', name, url], tr(`Remote "${name}" hinzugefügt.`, `Added remote "${name}".`));
      },
    });
  };

  const handleRemoveRemote = async (remoteName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: tr('Remote entfernen?', 'Remove remote?'),
      message: tr('Der Remote wird aus der lokalen Konfiguration entfernt.', 'The remote will be removed from local configuration.'),
      contextItems: [
        { label: tr('Remote', 'Remote'), value: remoteName },
        { label: tr('Repository', 'Repository'), value: activeRepo ? (activeRepo.split(/[\\/]/).pop() || activeRepo) : tr('(unbekannt)', '(unknown)') },
      ],
      irreversible: false,
      consequences: tr('Push/Pull über diesen Remote ist danach nicht mehr möglich, bis er erneut angelegt wird.', 'Push/Pull via this remote will no longer be possible until re-added.'),
      confirmLabel: tr('Remote entfernen', 'Remove remote'),
      onConfirm: async () => {
        await runGitCommand(['remote', 'remove', remoteName], tr(`Remote "${remoteName}" entfernt.`, `Removed remote "${remoteName}".`));
      },
    });
  };


  const handleRenameRemote = async (remoteName: string) => {
    setInputDialog({
      title: tr('Remote umbenennen', 'Rename remote'),
      message: tr('Gib den neuen Namen für diesen Remote ein.', 'Enter the new name for this remote.'),
      fields: [
        { id: 'newName', label: tr('Neuer Remote-Name', 'New remote name'), defaultValue: remoteName, required: true },
      ],
      contextItems: [{ label: tr('Bisheriger Name', 'Current name'), value: remoteName }],
      irreversible: false,
      consequences: tr('Bestehende Push/Pull-Konfigurationen werden aktualisiert.', 'Existing push/pull configurations will be updated.'),
      confirmLabel: tr('Umbenennen', 'Rename'),
      onSubmit: async (values) => {
        const newName = (values.newName || '').trim();
        if (!newName || newName === remoteName) return;
        await runGitCommand(['remote', 'rename', remoteName, newName], tr(`Remote umbenannt: "${remoteName}" -> "${newName}".`, `Renamed remote: "${remoteName}" -> "${newName}".`));
      },
    });
  };

  const handleSetRemoteUrl = async (remoteName: string, currentUrl: string) => {
    setInputDialog({
      title: tr('Remote-URL ändern', 'Change remote URL'),
      message: tr('Gib die neue URL für diesen Remote ein.', 'Enter the new URL for this remote.'),
      fields: [
        { id: 'url', label: tr('Neue Remote-URL', 'New remote URL'), defaultValue: currentUrl, required: true, type: 'url' },
      ],
      contextItems: [
        { label: tr('Remote', 'Remote'), value: remoteName },
        { label: tr('Aktuelle URL', 'Current URL'), value: currentUrl },
      ],
      irreversible: false,
      consequences: tr('Push/Pull nutzen danach die neue URL.', 'Push/Pull will use the new URL afterwards.'),
      confirmLabel: tr('URL speichern', 'Save URL'),
      onSubmit: async (values) => {
        const url = (values.url || '').trim();
        if (!url || url === currentUrl) return;
        await runGitCommand(['remote', 'set-url', remoteName, url], tr(`URL für "${remoteName}" aktualisiert.`, `Updated URL for "${remoteName}".`));
      },
    });
  };

  const handleSubmoduleInitUpdate = async () => {
    await runGitCommand(['submoduleUpdateInitRecursive'], tr('Submodule initialisiert/aktualisiert.', 'Submodules initialized/updated.'));
  };

  const handleSubmoduleSync = async () => {
    await runGitCommand(['submoduleSyncRecursive'], tr('Submodule-URLs synchronisiert.', 'Submodule URLs synchronized.'));
  };

  const handleOpenSubmodule = async (submodulePath: string) => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openSubmodule(submodulePath);
    if (!result.success) {
      setGitActionToast({ msg: result.error || tr('Submodule konnte nicht geöffnet werden.', 'Could not open submodule.'), isError: true });
    }
  };

  const localBranchNames = new Set(
    branches
      .filter(branch => branch.scope === 'local')
      .map(branch => branch.name)
  );

  const remoteOnlyBranches = branches.filter(branch => (
    branch.scope === 'remote' && !localBranchNames.has(getRemoteBranchShortName(branch.name))
  ));

  const remoteStatus: RemoteStatusInfo = (() => {
    if (remoteSync.lastFetchError) {
      return {
        title: tr('Remote-Check fehlgeschlagen', 'Remote check failed'),
        detail: remoteSync.lastFetchError,
        color: 'var(--status-danger)',
        backgroundColor: 'var(--status-danger-soft)',
        borderColor: 'var(--status-danger-border)',
      };
    }

    if (hasRemoteOrigin === false) {
      return {
        title: tr('Kein Remote konfiguriert', 'No remote configured'),
        detail: tr('Dieses Repository hat noch kein Remote.', 'This repository has no remote yet.'),
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (remoteSync.lastFetchedAt === null) {
      return {
        title: tr('Remote noch nicht geprüft', 'Remote not checked yet'),
        detail: tr('Noch kein erfolgreicher Fetch für dieses Repository.', 'No successful fetch for this repository yet.'),
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (!remoteSync.hasUpstream) {
      return {
        title: tr('Kein Tracking-Branch', 'No tracking branch'),
        detail: tr('Der aktuelle lokale Branch tracked keinen Remote-Branch.', 'Current local branch does not track a remote branch.'),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.ahead > 0 && remoteSync.behind > 0) {
      return {
        title: tr('Lokal und Remote sind unterschiedlich', 'Local and remote diverged'),
        detail: tr(`Lokal ${remoteSync.ahead} voraus, Remote ${remoteSync.behind} voraus.`, `Local ahead by ${remoteSync.ahead}, remote ahead by ${remoteSync.behind}.`),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.behind > 0) {
      return {
        title: tr(`Remote ist ${remoteSync.behind} Commit${remoteSync.behind === 1 ? '' : 's'} voraus`, `Remote is ahead by ${remoteSync.behind} commit${remoteSync.behind === 1 ? '' : 's'}`),
        detail: tr('Der Remote hat neuere Commits als dein lokaler Branch.', 'Remote has newer commits than your local branch.'),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.ahead > 0) {
      return {
        title: tr(`Lokal ist ${remoteSync.ahead} Commit${remoteSync.ahead === 1 ? '' : 's'} voraus`, `Local is ahead by ${remoteSync.ahead} commit${remoteSync.ahead === 1 ? '' : 's'}`),
        detail: tr('Deine lokalen Commits wurden noch nicht gepusht.', 'Your local commits have not been pushed yet.'),
        color: 'var(--text-accent)',
        backgroundColor: 'var(--accent-primary-soft)',
        borderColor: 'var(--accent-primary-border)',
      };
    }

    if (remoteOnlyBranches.length > 0) {
      return {
        title: tr(`${remoteOnlyBranches.length} zusätzl. Remote-Branch${remoteOnlyBranches.length === 1 ? '' : 'es'}`, `${remoteOnlyBranches.length} additional remote branch${remoteOnlyBranches.length === 1 ? '' : 'es'}`),
        detail: tr('Auf dem Remote gibt es weitere Branches.', 'There are more branches on the remote.'),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    return {
      title: tr('Remote ist aktuell', 'Remote is up to date'),
      detail: formatLastFetchedAt(remoteSync.lastFetchedAt),
      color: 'var(--status-success)',
      backgroundColor: 'var(--status-success-soft)',
      borderColor: 'var(--status-success-border)',
    };
  })();

  return {
    branches,
    setBranches,
    currentBranch,
    setCurrentBranch,
    isCreatingBranch,
    setIsCreatingBranch,
    newBranchName,
    setNewBranchName,
    branchContextMenu,
    setBranchContextMenu,
    newBranchInputRef,
    tags,
    remotes,
    submodules,
    hasRemoteOrigin,
    setHasRemoteOrigin,
    remoteSync,
    remoteOnlyBranches,
    remoteStatus,
    refreshRemoteState,
    handleCreateBranch,
    handleDeleteBranch,
    handleMergeBranch,
    handleRenameBranch,
    handleCreateTag,
    handleDeleteTag,
    handleSelectTag,
    handlePushTags,
    handleAddRemote,
    handleRemoveRemote,
    handleRenameRemote,
    handleSetRemoteUrl,
    handleSubmoduleInitUpdate,
    handleSubmoduleSync,
    handleOpenSubmodule,
  };
};
