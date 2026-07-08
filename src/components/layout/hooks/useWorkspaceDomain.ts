import { useEffect, useMemo, useRef, useState } from 'react';
import type { RepoSortByDto } from '@/global';
import { translateFromCatalog, type AppLanguage, type TranslationVariables } from '@/i18n';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { AppTabId } from '@/components/layout/sidebar/AppSidebar.types';

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

const toRepoName = (repoPath: string): string => (repoPath.split(/[\\/]/).pop() || repoPath).toLowerCase();

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

const sortRepoPaths = (repoPaths: string[], metaMap: Record<string, RepoMetaEntry>, sortBy: RepoSortByDto): string[] => {
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

export const useWorkspaceDomain = ({ triggerRefresh, setConfirmDialog, setGitActionToast, onRepoActivated, onNoActiveRepo, language }: Params) => {
  const [activeTab, setActiveTab] = useState<AppTabId>('localRepos');
  const [openRepos, setOpenRepos] = useState<string[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [repoMeta, setRepoMeta] = useState<Record<string, RepoMetaEntry>>({});
  const [repoSortBy, setRepoSortBy] = useState<RepoSortByDto>(DEFAULT_REPO_SORT_BY);
  const [reposLoaded, setReposLoaded] = useState(false);
  const repoOperationSequenceRef = useRef(0);

  const t = (key: string, variables?: TranslationVariables) => translateFromCatalog(language, key, variables);

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
      if (!appClient.isAvailable()) return;
      const operationId = ++repoOperationSequenceRef.current;
      try {
        const data = await appClient.getStoredRepos();
        if (repoOperationSequenceRef.current !== operationId) {
          setReposLoaded(true);
          return;
        }
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
          await appClient.setRepoPath(active);
          if (repoOperationSequenceRef.current === operationId) {
            setActiveRepo(active);
          }
        } else {
          await appClient.clearRepoPath();
          if (repoOperationSequenceRef.current === operationId) {
            setActiveRepo(null);
            onNoActiveRepo();
          }
        }
      } catch (e) {
        console.error(e);
      }
      setReposLoaded(true);
    };
    loadStored();
  }, []);

  useEffect(() => {
    if (!reposLoaded || !appClient.isAvailable()) return;

    const now = Date.now();
    const repos = sortedOpenRepos.map((repoPath) => ({
      path: repoPath,
      lastOpened: normalizeTimestamp(repoMeta[repoPath]?.lastOpened, now),
      pinned: Boolean(repoMeta[repoPath]?.pinned),
      createdAt: normalizeTimestamp(repoMeta[repoPath]?.createdAt, now),
    }));

    void appClient.setStoredRepos({
      repos,
      activeRepo,
      sortBy: repoSortBy,
    });
  }, [sortedOpenRepos, repoMeta, activeRepo, repoSortBy, reposLoaded]);

  const handleSwitchRepo = async (repoPath: string) => {
    if (!appClient.isAvailable() || repoPath === activeRepo) return;
    const operationId = ++repoOperationSequenceRef.current;
    await appClient.setRepoPath(repoPath);
    if (repoOperationSequenceRef.current !== operationId) return;
    setActiveRepo(repoPath);
    touchRepo(repoPath);
    onRepoActivated();
    triggerRefresh();
  };

  const handleCloseRepo = async (repoPath: string) => {
    const operationId = ++repoOperationSequenceRef.current;
    const next = openRepos.filter((r) => r !== repoPath);
    const nextMeta = { ...repoMeta };
    delete nextMeta[repoPath];

    setOpenRepos(next);
    setRepoMeta(nextMeta);

    if (activeRepo === repoPath) {
      if (next.length > 0) {
        const sortedNext = sortRepoPaths(next, nextMeta, repoSortBy);
        const newActive = sortedNext[0];
        if (appClient.isAvailable()) {
          await appClient.setRepoPath(newActive);
        }
        if (repoOperationSequenceRef.current !== operationId) return;
        setActiveRepo(newActive);
        touchRepo(newActive);
        onRepoActivated();
        triggerRefresh();
      } else {
        if (appClient.isAvailable()) {
          await appClient.clearRepoPath();
        }
        if (repoOperationSequenceRef.current !== operationId) return;
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
    if (!appClient.isAvailable()) return;
    try {
      const result = await appClient.openDirectory();
      if (result && result.isRepo) {
        const operationId = ++repoOperationSequenceRef.current;
        ensureRepoPresent(result.path);
        await appClient.setRepoPath(result.path);
        if (repoOperationSequenceRef.current !== operationId) return;
        setActiveRepo(result.path);
        onRepoActivated();
        triggerRefresh();
      } else if (result && !result.isRepo) {
        setConfirmDialog({
          variant: 'confirm',
          title: t('generated.components.layout.hooks.useworkspacedomain.initialize_git_repository_0ba2d2a1'),
          message: t('generated.components.layout.hooks.useworkspacedomain.the_selected_directory_is_not_a_git_repository_yet_4d2a99bd'),
          contextItems: [
            { label: t('generated.components.layout.hooks.useworkspacedomain.path_f9011584'), value: result.path },
            { label: t('generated.components.staging_area.useconflictresolver.action_ba062410'), value: 'git init' },
          ],
          irreversible: false,
          consequences: t('generated.components.layout.hooks.useworkspacedomain.a_git_directory_will_be_created_and_the_folder_prepared_8a4dacda'),
          confirmLabel: t('generated.components.layout.hooks.useworkspacedomain.initialize_repository_540255ad'),
          onConfirm: async () => {
            const initResult = await gitClient.gitInit(result.path);
            if (initResult.success) {
              const operationId = ++repoOperationSequenceRef.current;
              ensureRepoPresent(result.path);
              await appClient.setRepoPath(result.path);
              if (repoOperationSequenceRef.current !== operationId) return;
              setActiveRepo(result.path);
              onRepoActivated();
              setGitActionToast({ msg: t('generated.components.layout.hooks.useworkspacedomain.initialized_new_git_repository_058c91a4'), isError: false });
              triggerRefresh();
            } else {
              setGitActionToast({
                msg: initResult.error || t('generated.components.layout.hooks.useworkspacedomain.error_during_git_init_0313550f'),
                isError: true,
              });
            }
          },
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addOpenRepo = async (repoPath: string) => {
    if (!appClient.isAvailable()) return;
    const operationId = ++repoOperationSequenceRef.current;
    ensureRepoPresent(repoPath);
    await appClient.setRepoPath(repoPath);
    if (repoOperationSequenceRef.current !== operationId) return;
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
