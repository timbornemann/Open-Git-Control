import { useEffect, useMemo, useState } from 'react';
import { RepoSortByDto } from '../../../global';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import { ConfirmDialogState } from '../layoutTypes';
import { AppTabId } from '../sidebar/AppSidebar.types';

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
  createdAt: number;
};

type SortableRepo = {
  path: string;
  pinned: boolean;
  lastOpened: number;
  createdAt: number;
  name: string;
};

const DEFAULT_REPO_SORT_BY: RepoSortByDto = 'lastOpenedDesc';

const toRepoName = (repoPath: string): string => (
  (repoPath.split(/[\\/]/).pop() || repoPath).toLowerCase()
);

const normalizeTimestamp = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
};

const compareBySortPreference = (a: SortableRepo, b: SortableRepo, sortBy: RepoSortByDto): number => {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }

  const nameAscCompare = a.name.localeCompare(b.name);

  if (sortBy === 'nameAsc') {
    if (nameAscCompare !== 0) return nameAscCompare;
  } else if (sortBy === 'nameDesc') {
    if (nameAscCompare !== 0) return -nameAscCompare;
  } else if (sortBy === 'createdAtDesc') {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  } else if (sortBy === 'createdAtAsc') {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  } else if (a.lastOpened !== b.lastOpened) {
    return b.lastOpened - a.lastOpened;
  }

  if (a.lastOpened !== b.lastOpened) {
    return b.lastOpened - a.lastOpened;
  }
  if (a.createdAt !== b.createdAt) {
    return b.createdAt - a.createdAt;
  }
  if (nameAscCompare !== 0) {
    return nameAscCompare;
  }
  return a.path.localeCompare(b.path);
};

const sortRepoPaths = (
  repoPaths: string[],
  metaMap: Record<string, RepoMetaEntry>,
  sortBy: RepoSortByDto,
): string[] => {
  const withMeta: SortableRepo[] = repoPaths.map((repoPath) => {
    const now = Date.now();
    const repoMeta = metaMap[repoPath];
    const lastOpened = normalizeTimestamp(repoMeta?.lastOpened, now);
    const createdAt = normalizeTimestamp(repoMeta?.createdAt, lastOpened);
    return {
      path: repoPath,
      pinned: Boolean(repoMeta?.pinned),
      lastOpened,
      createdAt,
      name: toRepoName(repoPath),
    };
  });

  withMeta.sort((a, b) => compareBySortPreference(a, b, sortBy));
  return withMeta.map((entry) => entry.path);
};

export const useWorkspaceDomain = ({
  triggerRefresh,
  setConfirmDialog,
  setGitActionToast,
  onRepoActivated,
  onNoActiveRepo,
  language,
}: Params) => {
  const [activeTab, setActiveTab] = useState<AppTabId>('localRepos');
  const [openRepos, setOpenRepos] = useState<string[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [repoMeta, setRepoMeta] = useState<Record<string, RepoMetaEntry>>({});
  const [repoSortBy, setRepoSortBy] = useState<RepoSortByDto>(DEFAULT_REPO_SORT_BY);
  const [reposLoaded, setReposLoaded] = useState(false);

  const tr = (deText: string, enText: string) => trByLanguage(language, deText, enText);

  const sortedOpenRepos = useMemo(() => {
    return sortRepoPaths(openRepos, repoMeta, repoSortBy);
  }, [openRepos, repoMeta, repoSortBy]);

  const touchRepo = (repoPath: string) => {
    const now = Date.now();
    setRepoMeta((prev) => ({
      ...prev,
      [repoPath]: {
        pinned: prev[repoPath]?.pinned || false,
        lastOpened: now,
        createdAt: prev[repoPath]?.createdAt || now,
      },
    }));
  };

  useEffect(() => {
    const loadStored = async () => {
      if (!window.electronAPI) return;
      try {
        const data = await window.electronAPI.getStoredRepos();
        setRepoSortBy(data.sortBy || DEFAULT_REPO_SORT_BY);

        if (data.repos.length > 0) {
          const paths = data.repos.map((r) => r.path);
          const meta: Record<string, RepoMetaEntry> = {};
          for (const repo of data.repos) {
            const lastOpened = normalizeTimestamp(repo.lastOpened, Date.now());
            meta[repo.path] = {
              lastOpened,
              pinned: Boolean(repo.pinned),
              createdAt: normalizeTimestamp(repo.createdAt, lastOpened),
            };
          }

          setRepoMeta(meta);
          setOpenRepos(paths);

          const active = data.activeRepo && paths.includes(data.activeRepo) ? data.activeRepo : paths[0];
          await window.electronAPI.setRepoPath(active);
          setActiveRepo(active);
        } else {
          await window.electronAPI.clearRepoPath();
          setActiveRepo(null);
          onNoActiveRepo();
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

    const now = Date.now();
    const repos = sortedOpenRepos.map((repoPath) => ({
      path: repoPath,
      lastOpened: normalizeTimestamp(repoMeta[repoPath]?.lastOpened, now),
      pinned: Boolean(repoMeta[repoPath]?.pinned),
      createdAt: normalizeTimestamp(repoMeta[repoPath]?.createdAt, now),
    }));

    window.electronAPI.setStoredRepos({
      repos,
      activeRepo,
      sortBy: repoSortBy,
    });
  }, [sortedOpenRepos, repoMeta, activeRepo, repoSortBy, reposLoaded]);

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
    const nextMeta = { ...repoMeta };
    delete nextMeta[repoPath];

    setOpenRepos(next);
    setRepoMeta(nextMeta);

    if (activeRepo === repoPath) {
      if (next.length > 0) {
        const sortedNext = sortRepoPaths(next, nextMeta, repoSortBy);
        const newActive = sortedNext[0];
        if (window.electronAPI) {
          await window.electronAPI.setRepoPath(newActive);
        }
        setActiveRepo(newActive);
        touchRepo(newActive);
        onRepoActivated();
        triggerRefresh();
      } else {
        if (window.electronAPI) {
          await window.electronAPI.clearRepoPath();
        }
        setActiveRepo(null);
        onNoActiveRepo();
      }
    }
  };

  const ensureRepoPresent = (repoPath: string) => {
    const now = Date.now();
    setOpenRepos((prev) => (prev.includes(repoPath) ? prev : [...prev, repoPath]));
    setRepoMeta((prev) => ({
      ...prev,
      [repoPath]: {
        pinned: prev[repoPath]?.pinned || false,
        lastOpened: now,
        createdAt: prev[repoPath]?.createdAt || now,
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
    const now = Date.now();
    setRepoMeta((prev) => ({
      ...prev,
      [repoPath]: {
        pinned: !prev[repoPath]?.pinned,
        lastOpened: normalizeTimestamp(prev[repoPath]?.lastOpened, now),
        createdAt: normalizeTimestamp(prev[repoPath]?.createdAt, now),
      },
    }));
  };

  const handleSetRepoSortBy = (sortBy: RepoSortByDto) => {
    setRepoSortBy(sortBy);
  };

  return {
    activeTab,
    setActiveTab,
    openRepos: sortedOpenRepos,
    repoMeta,
    setOpenRepos,
    activeRepo,
    setActiveRepo,
    repoSortBy,
    setRepoSortBy: handleSetRepoSortBy,
    handleSwitchRepo,
    handleCloseRepo,
    handleOpenFolder,
    addOpenRepo,
    toggleRepoPin,
  };
};
