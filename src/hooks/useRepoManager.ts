import { useCallback, useEffect, useState } from 'react';

type Params = {
  onRepoChanged?: () => void;
  onRepoCleared?: () => void;
  onToastSuccess?: (msg: string) => void;
  onToastError?: (msg: string) => void;
};

export const useRepoManager = ({ onRepoChanged, onRepoCleared, onToastSuccess, onToastError }: Params) => {
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
      } catch (error) {
        console.error(error);
      }
      setReposLoaded(true);
    };
    loadStored();
  }, []);

  useEffect(() => {
    if (!reposLoaded || !window.electronAPI) return;
    window.electronAPI.setStoredRepos({
      repos: openRepos.map(path => ({ path, lastOpened: Date.now(), pinned: false })),
      activeRepo,
    });
  }, [openRepos, activeRepo, reposLoaded]);

  const handleSwitchRepo = useCallback(async (repoPath: string) => {
    if (!window.electronAPI || repoPath === activeRepo) return;
    await window.electronAPI.setRepoPath(repoPath);
    setActiveRepo(repoPath);
    onRepoChanged?.();
  }, [activeRepo, onRepoChanged]);

  const handleCloseRepo = useCallback(async (repoPath: string) => {
    const next = openRepos.filter(r => r !== repoPath);
    setOpenRepos(next);
    if (activeRepo === repoPath) {
      if (next.length > 0) {
        const nextActive = next[0];
        if (window.electronAPI) {
          await window.electronAPI.setRepoPath(nextActive);
        }
        setActiveRepo(nextActive);
        onRepoChanged?.();
      } else {
        setActiveRepo(null);
        onRepoCleared?.();
      }
    }
  }, [activeRepo, onRepoChanged, onRepoCleared, openRepos]);

  const handleOpenFolder = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.openDirectory();
      if (!result) return;

      if (result.isRepo) {
        if (!openRepos.includes(result.path)) {
          setOpenRepos(prev => [...prev, result.path]);
        }
        await window.electronAPI.setRepoPath(result.path);
        setActiveRepo(result.path);
        onRepoChanged?.();
        return;
      }

      if (confirm('Das ausgewählte Verzeichnis ist kein Git-Repository.\nMöchtest du hier ein neues Repository initialisieren?')) {
        const initResult = await window.electronAPI.gitInit(result.path);
        if (initResult.success) {
          if (!openRepos.includes(result.path)) {
            setOpenRepos(prev => [...prev, result.path]);
          }
          await window.electronAPI.setRepoPath(result.path);
          setActiveRepo(result.path);
          onToastSuccess?.('Neues Git-Repository initialisiert.');
          onRepoChanged?.();
        } else {
          onToastError?.(initResult.error || 'Fehler bei git init.');
        }
      }
    } catch (error) {
      console.error(error);
    }
  }, [onRepoChanged, onToastError, onToastSuccess, openRepos]);

  const addOpenRepo = useCallback((repoPath: string) => {
    setOpenRepos(prev => (prev.includes(repoPath) ? prev : [...prev, repoPath]));
  }, []);

  return {
    openRepos,
    activeRepo,
    setActiveRepo,
    addOpenRepo,
    handleOpenFolder,
    handleSwitchRepo,
    handleCloseRepo,
  };
};

