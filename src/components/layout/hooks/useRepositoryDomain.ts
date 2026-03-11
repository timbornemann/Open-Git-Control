import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { BranchInfo, RemoteSyncState } from '../../../types/git';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import { ConfirmDialogState, InputDialogState, BranchContextMenuState, RemoteStatusInfo } from '../layoutTypes';

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

  const formatLastFetchedAt = useCallback((timestamp: number | null) => {
    if (!timestamp) return tr('Noch nicht aktualisiert', 'Not updated yet');
    const locale = language === 'en' ? 'en-US' : 'de-DE';
    return tr('Zuletzt aktualisiert', 'Last updated') + ': ' + new Date(timestamp).toLocaleTimeString(locale, {
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

          const head = parsedBranches.find((b: BranchInfo) => b.isHead)?.name ?? '';
          setCurrentBranch(head);
          setBranches(parsedBranches);
        } else {
          setCurrentBranch('');
          setBranches([]);
        }
      } catch {
        setCurrentBranch('');
        setBranches([]);
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
        const { success, data } = await window.electronAPI.runGitCommand('status', '-sb');
        if (!success || !data) {
          setRemoteSync(prev => ({ ...prev, ahead: 0, behind: 0, hasUpstream: false }));
          return;
        }

        const header = String(data).split('\n')[0]?.trim() ?? '';
        const aheadMatch = header.match(/ahead (\d+)/);
        const behindMatch = header.match(/behind (\d+)/);

        setRemoteSync(prev => ({
          ...prev,
          ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
          behind: behindMatch ? Number(behindMatch[1]) : 0,
          hasUpstream: header.includes('...'),
        }));
      } catch {
        setRemoteSync(prev => ({ ...prev, ahead: 0, behind: 0, hasUpstream: false }));
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
        if (!r.success || !r.data) {
          setHasRemoteOrigin(false);
          setRemotes([]);
          return;
        }
        const lines = String(r.data)
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
        setHasRemoteOrigin(false);
        setRemotes([]);
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
    setRemoteSync(prev => ({ ...prev, isFetching: true, lastFetchError: null }));

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

    refreshRemoteState();
    const intervalId = window.setInterval(() => {
      refreshRemoteState();
    }, autoFetchIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [activeRepo, autoFetchIntervalMs, refreshRemoteState]);

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setIsCreatingBranch(false);
    setNewBranchName('');
    await runGitCommand(['checkout', '-b', name], tr(`Branch "${name}" erstellt.`, `Created branch "${name}".`));
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
        await runGitCommand(['branch', '-d', branchName], tr(`Branch "${branchName}" gelöscht.`, `Deleted branch "${branchName}".`));
      },
    });
  };

  const handleMergeBranch = async (branchName: string) => {
    setConfirmDialog({
      variant: 'confirm',
      title: tr('Branch mergen?', 'Merge branch?'),
      message: tr('Der ausgewählte Branch wird in den aktuellen Branch gemergt.', 'The selected branch will be merged into the current branch.'),
      contextItems: [
        { label: tr('Quelle', 'Source'), value: branchName },
        { label: tr('Ziel', 'Target'), value: currentBranch || tr('(unbekannt)', '(unknown)') },
      ],
      irreversible: false,
      consequences: tr('Es kann zu Konflikten kommen. Bei Erfolg entsteht ggf. ein neuer Merge-Commit.', 'Conflicts may occur. On success, a new merge commit may be created.'),
      confirmLabel: tr('Merge starten', 'Start merge'),
      onConfirm: async () => {
        await runGitCommand(['merge', branchName], tr(`Branch "${branchName}" gemergt.`, `Merged branch "${branchName}".`));
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

  const localBranchNames = new Set(
    branches
      .filter(branch => branch.scope === 'local')
      .map(branch => branch.name)
  );

  const remoteOnlyBranches = branches.filter(branch => (
    branch.scope === 'remote' && !localBranchNames.has(getRemoteBranchShortName(branch.name))
  ));

  const remoteStatus: RemoteStatusInfo = (() => {
    if (remoteSync.isFetching) {
      return {
        title: tr('Remote wird aktualisiert...', 'Updating remote...'),
        detail: tr('Fetch läuft gerade.', 'Fetch is running.'),
        color: '#7cb8ff',
        backgroundColor: 'rgba(31, 111, 235, 0.14)',
        borderColor: 'rgba(31, 111, 235, 0.28)',
      };
    }

    if (remoteSync.lastFetchError) {
      return {
        title: tr('Remote-Check fehlgeschlagen', 'Remote check failed'),
        detail: remoteSync.lastFetchError,
        color: '#f85149',
        backgroundColor: 'rgba(248, 81, 73, 0.14)',
        borderColor: 'rgba(248, 81, 73, 0.28)',
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
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.ahead > 0 && remoteSync.behind > 0) {
      return {
        title: tr('Lokal und Remote sind unterschiedlich', 'Local and remote diverged'),
        detail: tr(`Lokal ${remoteSync.ahead} voraus, Remote ${remoteSync.behind} voraus.`, `Local ahead by ${remoteSync.ahead}, remote ahead by ${remoteSync.behind}.`),
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.behind > 0) {
      return {
        title: tr(`Remote ist ${remoteSync.behind} Commit${remoteSync.behind === 1 ? '' : 's'} voraus`, `Remote is ahead by ${remoteSync.behind} commit${remoteSync.behind === 1 ? '' : 's'}`),
        detail: tr('Der Remote hat neuere Commits als dein lokaler Branch.', 'Remote has newer commits than your local branch.'),
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.ahead > 0) {
      return {
        title: tr(`Lokal ist ${remoteSync.ahead} Commit${remoteSync.ahead === 1 ? '' : 's'} voraus`, `Local is ahead by ${remoteSync.ahead} commit${remoteSync.ahead === 1 ? '' : 's'}`),
        detail: tr('Deine lokalen Commits wurden noch nicht gepusht.', 'Your local commits have not been pushed yet.'),
        color: '#7cb8ff',
        backgroundColor: 'rgba(31, 111, 235, 0.14)',
        borderColor: 'rgba(31, 111, 235, 0.28)',
      };
    }

    if (remoteOnlyBranches.length > 0) {
      return {
        title: tr(`${remoteOnlyBranches.length} zusätzl. Remote-Branch${remoteOnlyBranches.length === 1 ? '' : 'es'}`, `${remoteOnlyBranches.length} additional remote branch${remoteOnlyBranches.length === 1 ? '' : 'es'}`),
        detail: tr('Auf dem Remote gibt es weitere Branches.', 'There are more branches on the remote.'),
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    return {
      title: tr('Remote ist aktuell', 'Remote is up to date'),
      detail: formatLastFetchedAt(remoteSync.lastFetchedAt),
      color: '#3fb950',
      backgroundColor: 'rgba(63, 185, 80, 0.14)',
      borderColor: 'rgba(63, 185, 80, 0.28)',
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
    handlePushTags,
    handleAddRemote,
    handleRemoveRemote,
  };
};
