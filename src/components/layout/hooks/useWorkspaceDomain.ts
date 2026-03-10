import { useEffect, useState } from 'react';
import { ConfirmDialogState } from '../layoutTypes';

type Params = {
  triggerRefresh: () => void;
  setConfirmDialog: (state: ConfirmDialogState | null) => void;
  setGitActionToast: (toast: { msg: string; isError: boolean }) => void;
  onRepoActivated: () => void;
  onNoActiveRepo: () => void;
};

export const useWorkspaceDomain = ({
  triggerRefresh,
  setConfirmDialog,
  setGitActionToast,
  onRepoActivated,
  onNoActiveRepo,
}: Params) => {
  const [activeTab, setActiveTab] = useState<'repos' | 'github'>('repos');
  const [openRepos, setOpenRepos] = useState<string[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [reposLoaded, setReposLoaded] = useState(false);

  useEffect(() => {
    const loadStored = async () => {
      if (!window.electronAPI) return;
      try {
        const data = await window.electronAPI.getStoredRepos();
        if (data.repos.length > 0) {
          const paths = data.repos.map(r => r.path);
          setOpenRepos(paths);
          const active = data.activeRepo && paths.includes(data.activeRepo) ? data.activeRepo : paths[0];
          await window.electronAPI.setRepoPath(active);
          setActiveRepo(active);
        }
      } catch (e) {
        console.error(e);
      }
      setReposLoaded(true);
    };
    loadStored();
  }, []);

  useEffect(() => {
    if (!reposLoaded || !window.electronAPI) return;
    window.electronAPI.setStoredRepos({
      repos: openRepos.map(p => ({ path: p, lastOpened: Date.now() })),
      activeRepo,
    });
  }, [openRepos, activeRepo, reposLoaded]);

  const handleSwitchRepo = async (repoPath: string) => {
    if (!window.electronAPI || repoPath === activeRepo) return;
    await window.electronAPI.setRepoPath(repoPath);
    setActiveRepo(repoPath);
    onRepoActivated();
    triggerRefresh();
  };

  const handleCloseRepo = async (repoPath: string) => {
    const next = openRepos.filter(r => r !== repoPath);
    setOpenRepos(next);
    if (activeRepo === repoPath) {
      if (next.length > 0) {
        const newActive = next[0];
        if (window.electronAPI) {
          await window.electronAPI.setRepoPath(newActive);
        }
        setActiveRepo(newActive);
        onRepoActivated();
        triggerRefresh();
      } else {
        setActiveRepo(null);
        onNoActiveRepo();
      }
    }
  };

  const handleOpenFolder = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.openDirectory();
      if (result && result.isRepo) {
        if (!openRepos.includes(result.path)) {
          setOpenRepos(prev => [...prev, result.path]);
        }
        await window.electronAPI.setRepoPath(result.path);
        setActiveRepo(result.path);
        onRepoActivated();
        triggerRefresh();
      } else if (result && !result.isRepo) {
        setConfirmDialog({
          variant: 'confirm',
          title: 'Git-Repository initialisieren?',
          message: 'Das ausgewaehlte Verzeichnis ist noch kein Git-Repository.',
          contextItems: [
            { label: 'Pfad', value: result.path },
            { label: 'Aktion', value: 'git init' },
          ],
          irreversible: false,
          consequences: 'Es wird ein .git-Verzeichnis angelegt und das Verzeichnis als Repository vorbereitet.',
          confirmLabel: 'Repository initialisieren',
          onConfirm: async () => {
            const initResult = await window.electronAPI.gitInit(result.path);
            if (initResult.success) {
              if (!openRepos.includes(result.path)) {
                setOpenRepos(prev => [...prev, result.path]);
              }
              await window.electronAPI.setRepoPath(result.path);
              setActiveRepo(result.path);
              onRepoActivated();
              setGitActionToast({ msg: 'Neues Git-Repository initialisiert.', isError: false });
              triggerRefresh();
            } else {
              setGitActionToast({ msg: initResult.error || 'Fehler bei git init.', isError: true });
            }
          },
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addOpenRepo = async (repoPath: string) => {
    if (!window.electronAPI) return;
    if (!openRepos.includes(repoPath)) {
      setOpenRepos(prev => [...prev, repoPath]);
    }
    await window.electronAPI.setRepoPath(repoPath);
    setActiveRepo(repoPath);
    onRepoActivated();
    triggerRefresh();
  };

  return {
    activeTab,
    setActiveTab,
    openRepos,
    setOpenRepos,
    activeRepo,
    setActiveRepo,
    handleSwitchRepo,
    handleCloseRepo,
    handleOpenFolder,
    addOpenRepo,
  };
};
