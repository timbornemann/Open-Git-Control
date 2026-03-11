import { useEffect, useMemo, useState } from 'react';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import { ConfirmDialogState } from '../layoutTypes';

type Params = {
  triggerRefresh: () => void;
  setConfirmDialog: (state: ConfirmDialogState | null) => void;
  setGitActionToast: (toast: { msg: string; isError: boolean }) => void;
  onRepoActivated: () => void;
  onNoActiveRepo: () => void;
  language: AppLanguage;
};

type RepoMetaEntry = {
  lastOpened: number;
  pinned: boolean;
};

export const useWorkspaceDomain = ({
  triggerRefresh,
  setConfirmDialog,
  setGitActionToast,
  onRepoActivated,
  onNoActiveRepo,
  language,
}: Params) => {
  const [activeTab, setActiveTab] = useState<'repos' | 'github' | 'settings'>('repos');
  const [openRepos, setOpenRepos] = useState<string[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [repoMeta, setRepoMeta] = useState<Record<string, RepoMetaEntry>>({});
  const [reposLoaded, setReposLoaded] = useState(false);

  const tr = (deText: string, enText: string) => trByLanguage(language, deText, enText);

  const sortedOpenRepos = useMemo(() => {
    const withMeta = openRepos.map((path) => ({
      path,
      pinned: repoMeta[path]?.pinned || false,
      lastOpened: repoMeta[path]?.lastOpened || 0,
      name: (path.split(/[\\/]/).pop() || path).toLowerCase(),
    }));

    withMeta.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      if (a.lastOpened !== b.lastOpened) {
        return b.lastOpened - a.lastOpened;
      }
      return a.name.localeCompare(b.name);
    });

    return withMeta.map((entry) => entry.path);
  }, [openRepos, repoMeta]);

  const touchRepo = (repoPath: string) => {
    setRepoMeta((prev) => ({
      ...prev,
      [repoPath]: {
        pinned: prev[repoPath]?.pinned || false,
        lastOpened: Date.now(),
      },
    }));
  };

  useEffect(() => {
    const loadStored = async () => {
      if (!window.electronAPI) return;
      try {
        const data = await window.electronAPI.getStoredRepos();
        if (data.repos.length > 0) {
          const paths = data.repos.map((r) => r.path);
          const meta: Record<string, RepoMetaEntry> = {};
          for (const repo of data.repos) {
            meta[repo.path] = {
              lastOpened: Number.isFinite(repo.lastOpened) ? repo.lastOpened : Date.now(),
              pinned: Boolean(repo.pinned),
            };
          }

          setRepoMeta(meta);
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

    const repos = sortedOpenRepos.map((path) => ({
      path,
      lastOpened: repoMeta[path]?.lastOpened || Date.now(),
      pinned: repoMeta[path]?.pinned || false,
    }));

    window.electronAPI.setStoredRepos({
      repos,
      activeRepo,
    });
  }, [sortedOpenRepos, repoMeta, activeRepo, reposLoaded]);

  const handleSwitchRepo = async (repoPath: string) => {
    if (!window.electronAPI || repoPath === activeRepo) return;
    await window.electronAPI.setRepoPath(repoPath);
    setActiveRepo(repoPath);
    touchRepo(repoPath);
    onRepoActivated();
    triggerRefresh();
  };

  const handleCloseRepo = async (repoPath: string) => {
    const next = openRepos.filter((r) => r !== repoPath);
    setOpenRepos(next);
    setRepoMeta((prev) => {
      const clone = { ...prev };
      delete clone[repoPath];
      return clone;
    });

    if (activeRepo === repoPath) {
      if (next.length > 0) {
        const sortedNext = [...next].sort((a, b) => {
          const aPinned = repoMeta[a]?.pinned || false;
          const bPinned = repoMeta[b]?.pinned || false;
          if (aPinned !== bPinned) return aPinned ? -1 : 1;
          return (repoMeta[b]?.lastOpened || 0) - (repoMeta[a]?.lastOpened || 0);
        });
        const newActive = sortedNext[0];
        if (window.electronAPI) {
          await window.electronAPI.setRepoPath(newActive);
        }
        setActiveRepo(newActive);
        touchRepo(newActive);
        onRepoActivated();
        triggerRefresh();
      } else {
        setActiveRepo(null);
        onNoActiveRepo();
      }
    }
  };

  const ensureRepoPresent = (repoPath: string) => {
    setOpenRepos((prev) => (prev.includes(repoPath) ? prev : [...prev, repoPath]));
    setRepoMeta((prev) => ({
      ...prev,
      [repoPath]: {
        pinned: prev[repoPath]?.pinned || false,
        lastOpened: Date.now(),
      },
    }));
  };

  const handleOpenFolder = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.openDirectory();
      if (result && result.isRepo) {
        ensureRepoPresent(result.path);
        await window.electronAPI.setRepoPath(result.path);
        setActiveRepo(result.path);
        onRepoActivated();
        triggerRefresh();
      } else if (result && !result.isRepo) {
        setConfirmDialog({
          variant: 'confirm',
          title: tr('Git-Repository initialisieren?', 'Initialize Git repository?'),
          message: tr('Das ausgewählte Verzeichnis ist noch kein Git-Repository.', 'The selected directory is not a Git repository yet.'),
          contextItems: [
            { label: tr('Pfad', 'Path'), value: result.path },
            { label: tr('Aktion', 'Action'), value: 'git init' },
          ],
          irreversible: false,
          consequences: tr('Es wird ein .git-Verzeichnis angelegt und das Verzeichnis als Repository vorbereitet.', 'A .git directory will be created and the folder prepared as repository.'),
          confirmLabel: tr('Repository initialisieren', 'Initialize repository'),
          onConfirm: async () => {
            const initResult = await window.electronAPI.gitInit(result.path);
            if (initResult.success) {
              ensureRepoPresent(result.path);
              await window.electronAPI.setRepoPath(result.path);
              setActiveRepo(result.path);
              onRepoActivated();
              setGitActionToast({ msg: tr('Neues Git-Repository initialisiert.', 'Initialized new Git repository.'), isError: false });
              triggerRefresh();
            } else {
              setGitActionToast({ msg: initResult.error || tr('Fehler bei git init.', 'Error during git init.'), isError: true });
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
    ensureRepoPresent(repoPath);
    await window.electronAPI.setRepoPath(repoPath);
    setActiveRepo(repoPath);
    onRepoActivated();
    triggerRefresh();
  };

  const toggleRepoPin = (repoPath: string) => {
    setRepoMeta((prev) => ({
      ...prev,
      [repoPath]: {
        pinned: !prev[repoPath]?.pinned,
        lastOpened: prev[repoPath]?.lastOpened || Date.now(),
      },
    }));
  };

  return {
    activeTab,
    setActiveTab,
    openRepos: sortedOpenRepos,
    repoMeta,
    setOpenRepos,
    activeRepo,
    setActiveRepo,
    handleSwitchRepo,
    handleCloseRepo,
    handleOpenFolder,
    addOpenRepo,
    toggleRepoPin,
  };
};
