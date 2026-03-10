import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { BranchInfo, RemoteSyncState } from '../../../types/git';
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

  const getRemoteBranchShortName = useCallback((branchName: string) => (
    branchName.replace(/^remotes\/[^/]+\//, '')
  ), []);

  const formatLastFetchedAt = useCallback((timestamp: number | null) => {
    if (!timestamp) return 'Noch nicht aktualisiert';
    return `Zuletzt aktualisiert: ${new Date(timestamp).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`;
  }, []);

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
    setActiveGitActionLabel('Fetch wird ausgefuehrt...');
    setRemoteSync(prev => ({ ...prev, isFetching: true, lastFetchError: null }));

    try {
      const result = await window.electronAPI.runGitCommand('fetch', '--all', '--prune', '--tags', '--quiet');
      if (result.success) {
        setRemoteSync(prev => ({ ...prev, isFetching: false, lastFetchedAt: Date.now(), lastFetchError: null }));
        triggerRefresh();
        if (showToast) {
          setGitActionToast({ msg: 'Remote aktualisiert.', isError: false });
        }
        return true;
      }

      const errorMessage = String(result.error || 'Remote konnte nicht aktualisiert werden.');
      setRemoteSync(prev => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
      if (showToast) {
        setGitActionToast({ msg: errorMessage, isError: true });
      }
      return false;
    } catch (e: any) {
      const errorMessage = e?.message || 'Remote konnte nicht aktualisiert werden.';
      setRemoteSync(prev => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
      if (showToast) {
        setGitActionToast({ msg: errorMessage, isError: true });
      }
      return false;
    } finally {
      isRemoteFetchRunningRef.current = false;
      setActiveGitActionLabel(current => (current === 'Fetch wird ausgefuehrt...' ? null : current));
    }
  }, [activeRepo, isGitActionRunningRef, setActiveGitActionLabel, setGitActionToast, triggerRefresh]);

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
    await runGitCommand(['checkout', '-b', name], `Branch "${name}" erstellt.`);
  };

  const handleDeleteBranch = async (branchName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Branch loeschen?',
      message: 'Der lokale Branch wird entfernt.',
      contextItems: [
        { label: 'Branch', value: branchName },
        { label: 'Aktiver Branch', value: currentBranch || '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Wenn der Branch nicht auf dem Remote liegt, kann Arbeit verloren gehen.',
      confirmLabel: 'Branch loeschen',
      onConfirm: async () => {
        await runGitCommand(['branch', '-d', branchName], `Branch "${branchName}" geloescht.`);
      },
    });
  };

  const handleMergeBranch = async (branchName: string) => {
    setConfirmDialog({
      variant: 'confirm',
      title: 'Branch mergen?',
      message: 'Der ausgewaehlte Branch wird in den aktuellen Branch gemergt.',
      contextItems: [
        { label: 'Quelle', value: branchName },
        { label: 'Ziel', value: currentBranch || '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Es kann zu Konflikten kommen. Bei Erfolg entsteht ggf. ein neuer Merge-Commit.',
      confirmLabel: 'Merge starten',
      onConfirm: async () => {
        await runGitCommand(['merge', branchName], `Branch "${branchName}" gemergt.`);
      },
    });
  };

  const handleRenameBranch = async (oldName: string) => {
    setInputDialog({
      title: 'Branch umbenennen',
      message: 'Gib den neuen Namen fuer den Branch ein.',
      fields: [
        {
          id: 'newName',
          label: 'Neuer Branch-Name',
          defaultValue: oldName,
          required: true,
          helperText: 'Der Name darf nicht leer sein und sollte eindeutig sein.',
        },
      ],
      contextItems: [{ label: 'Bisheriger Name', value: oldName }],
      irreversible: false,
      consequences: 'Lokale Referenzen werden aktualisiert. Remotes muessen ggf. separat angepasst werden.',
      confirmLabel: 'Umbenennen',
      onSubmit: async (values) => {
        const newName = (values.newName || '').trim();
        if (!newName || newName === oldName) return;
        await runGitCommand(['branch', '-m', oldName, newName], `Branch umbenannt: "${oldName}" -> "${newName}".`);
      },
    });
  };

  const handleCreateTag = async () => {
    setInputDialog({
      title: 'Tag erstellen',
      message: 'Lege einen neuen Tag an.',
      fields: [
        { id: 'name', label: 'Tag-Name', placeholder: 'v1.2.3', required: true },
        { id: 'message', label: 'Tag-Nachricht (optional)', placeholder: 'Release-Notiz' },
      ],
      contextItems: [{ label: 'Branch', value: currentBranch || '(unbekannt)' }],
      irreversible: false,
      consequences: 'Annotierte Tags speichern zusaetzlich Metadaten und Nachricht.',
      confirmLabel: 'Tag erstellen',
      onSubmit: async (values) => {
        const name = (values.name || '').trim();
        if (!name) return;
        const msg = (values.message || '').trim();
        if (msg) {
          await runGitCommand(['tag', '-a', name, '-m', msg], `Tag "${name}" erstellt.`);
        } else {
          await runGitCommand(['tag', name], `Tag "${name}" erstellt.`);
        }
      },
    });
  };

  const handleDeleteTag = async (tagName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Tag loeschen?',
      message: 'Der Tag wird lokal entfernt.',
      contextItems: [{ label: 'Tag', value: tagName }],
      irreversible: false,
      consequences: 'Falls der Tag bereits gepusht wurde, bleibt er auf dem Remote bestehen bis zum expliziten Entfernen.',
      confirmLabel: 'Tag loeschen',
      onConfirm: async () => {
        await runGitCommand(['tag', '-d', tagName], `Tag "${tagName}" geloescht.`);
      },
    });
  };

  const handlePushTags = async () => {
    await runGitCommand(['push', '--tags'], 'Tags gepusht.');
  };

  const handleAddRemote = async () => {
    setInputDialog({
      title: 'Remote hinzufuegen',
      message: 'Verbinde dieses Repository mit einem weiteren Remote.',
      fields: [
        { id: 'name', label: 'Remote-Name', placeholder: 'origin', required: true },
        { id: 'url', label: 'Remote-URL', placeholder: 'https://github.com/owner/repo.git', required: true, type: 'url' },
      ],
      contextItems: [{ label: 'Repository', value: activeRepo ? (activeRepo.split(/[\\/]/).pop() || activeRepo) : '(unbekannt)' }],
      irreversible: false,
      consequences: 'Der Remote wird in der lokalen Git-Konfiguration gespeichert.',
      confirmLabel: 'Remote speichern',
      onSubmit: async (values) => {
        const name = (values.name || '').trim();
        const url = (values.url || '').trim();
        if (!name || !url) return;
        await runGitCommand(['remote', 'add', name, url], `Remote "${name}" hinzugefuegt.`);
      },
    });
  };

  const handleRemoveRemote = async (remoteName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: 'Remote entfernen?',
      message: 'Der Remote wird aus der lokalen Konfiguration entfernt.',
      contextItems: [
        { label: 'Remote', value: remoteName },
        { label: 'Repository', value: activeRepo ? (activeRepo.split(/[\\/]/).pop() || activeRepo) : '(unbekannt)' },
      ],
      irreversible: false,
      consequences: 'Push/Pull ueber diesen Remote ist danach nicht mehr moeglich, bis er erneut angelegt wird.',
      confirmLabel: 'Remote entfernen',
      onConfirm: async () => {
        await runGitCommand(['remote', 'remove', remoteName], `Remote "${remoteName}" entfernt.`);
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
        title: 'Remote wird aktualisiert...',
        detail: 'Fetch laeuft gerade.',
        color: '#7cb8ff',
        backgroundColor: 'rgba(31, 111, 235, 0.14)',
        borderColor: 'rgba(31, 111, 235, 0.28)',
      };
    }

    if (remoteSync.lastFetchError) {
      return {
        title: 'Remote-Check fehlgeschlagen',
        detail: remoteSync.lastFetchError,
        color: '#f85149',
        backgroundColor: 'rgba(248, 81, 73, 0.14)',
        borderColor: 'rgba(248, 81, 73, 0.28)',
      };
    }

    if (hasRemoteOrigin === false) {
      return {
        title: 'Kein Remote konfiguriert',
        detail: 'Dieses Repository hat noch kein Remote.',
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (remoteSync.lastFetchedAt === null) {
      return {
        title: 'Remote noch nicht geprueft',
        detail: 'Noch kein erfolgreicher Fetch fuer dieses Repository.',
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (!remoteSync.hasUpstream) {
      return {
        title: 'Kein Tracking-Branch',
        detail: 'Der aktuelle lokale Branch tracked keinen Remote-Branch.',
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.ahead > 0 && remoteSync.behind > 0) {
      return {
        title: 'Lokal und Remote sind unterschiedlich',
        detail: `Lokal ${remoteSync.ahead} voraus, Remote ${remoteSync.behind} voraus.`,
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.behind > 0) {
      return {
        title: `Remote ist ${remoteSync.behind} Commit${remoteSync.behind === 1 ? '' : 's'} voraus`,
        detail: 'Der Remote hat neuere Commits als dein lokaler Branch.',
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    if (remoteSync.ahead > 0) {
      return {
        title: `Lokal ist ${remoteSync.ahead} Commit${remoteSync.ahead === 1 ? '' : 's'} voraus`,
        detail: 'Deine lokalen Commits wurden noch nicht gepusht.',
        color: '#7cb8ff',
        backgroundColor: 'rgba(31, 111, 235, 0.14)',
        borderColor: 'rgba(31, 111, 235, 0.28)',
      };
    }

    if (remoteOnlyBranches.length > 0) {
      return {
        title: `${remoteOnlyBranches.length} zusaetzl. Remote-Branch${remoteOnlyBranches.length === 1 ? '' : 'es'}`,
        detail: 'Auf dem Remote gibt es weitere Branches.',
        color: '#d2a922',
        backgroundColor: 'rgba(210, 169, 34, 0.14)',
        borderColor: 'rgba(210, 169, 34, 0.28)',
      };
    }

    return {
      title: 'Remote ist aktuell',
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




