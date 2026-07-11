import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RepoSortByDto } from '@/types/appDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { AppTabId } from '@/app/state/contracts';
import { normalizeRepoPathKey } from '@/utils/repoPath';

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
  const openReposRef = useRef(openRepos);
  const activeRepoRef = useRef(activeRepo);
  const repoMetaRef = useRef(repoMeta);
  const repoSortByRef = useRef(repoSortBy);
  const pendingStoredReposRef = useRef<{ paths: string[]; meta: Record<string, RepoMetaEntry> } | null>(null);

  // Dialog callbacks can outlive the render in which they were created. Keep
  // repository mutations anchored to the latest committed workspace state
  // instead of a stale closure captured before a repository switch.
  useLayoutEffect(() => {
    openReposRef.current = openRepos;
    activeRepoRef.current = activeRepo;
    repoMetaRef.current = repoMeta;
    repoSortByRef.current = repoSortBy;
  }, [activeRepo, openRepos, repoMeta, repoSortBy]);

  const { t } = useLanguageTranslations(language);

  const sortedOpenRepos = useMemo(() => {
    return sortRepoPaths(openRepos, repoMeta, repoSortBy);
  }, [openRepos, repoMeta, repoSortBy]);

  const touchRepo = (repoPath: string) => {
    const now = Date.now();
    setRepoMeta((prev) => {
      const next = {
        ...prev,
        [repoPath]: {
          pinned: prev[repoPath]?.pinned || false,
          lastOpened: now,
          createdAt: prev[repoPath]?.createdAt || now,
        },
      };
      repoMetaRef.current = next;
      return next;
    });
  };

  const migrateRepoPathToCanonical = useCallback((requestedPath: string, canonicalPath: string) => {
    if (!requestedPath || !canonicalPath) return;
    const requestedKey = normalizeRepoPathKey(requestedPath);
    const canonicalKey = normalizeRepoPathKey(canonicalPath);
    setOpenRepos((previous) => {
      const seen = new Set<string>();
      const next: string[] = [];
      for (const repoPath of previous) {
        const pathKey = normalizeRepoPathKey(repoPath);
        const candidate = pathKey === requestedKey || pathKey === canonicalKey ? canonicalPath : repoPath;
        const candidateKey = normalizeRepoPathKey(candidate);
        if (seen.has(candidateKey)) continue;
        seen.add(candidateKey);
        next.push(candidate);
      }
      openReposRef.current = next;
      return next;
    });
    setRepoMeta((previous) => {
      const next: Record<string, RepoMetaEntry> = {};
      const merged: RepoMetaEntry[] = [];
      for (const [repoPath, meta] of Object.entries(previous)) {
        const pathKey = normalizeRepoPathKey(repoPath);
        if (pathKey === requestedKey || pathKey === canonicalKey) merged.push(meta);
        else next[repoPath] = meta;
      }
      const now = Date.now();
      next[canonicalPath] = {
        pinned: merged.some((meta) => meta.pinned),
        lastOpened: Math.max(...merged.map((meta) => normalizeTimestamp(meta.lastOpened, now)), now),
        createdAt: Math.min(...merged.map((meta) => normalizeTimestamp(meta.createdAt, now)), now),
      };
      repoMetaRef.current = next;
      return next;
    });
    setActiveRepo((previous) => {
      if (!previous) return previous;
      const previousKey = normalizeRepoPathKey(previous);
      if (previousKey !== requestedKey && previousKey !== canonicalKey) return previous;
      activeRepoRef.current = canonicalPath;
      return canonicalPath;
    });
  }, []);

  useEffect(() => {
    const loadStored = async () => {
      if (!appClient.isAvailable()) return;
      const operationId = ++repoOperationSequenceRef.current;
      try {
        const data = await appClient.getStoredRepos();
        if (repoOperationSequenceRef.current !== operationId) {
          return;
        }
        const storedSortBy = data.sortBy || DEFAULT_REPO_SORT_BY;
        repoSortByRef.current = storedSortBy;
        setRepoSortBy(storedSortBy);
        if (data.repos.length > 0) {
          // Retain a provisional copy in refs before canonical probes. A slow
          // or unavailable saved path must not let a concurrent Open/Clone
          // action overwrite all other stored repositories. It intentionally
          // stays out of rendered state until the backend paths are canonical.
          const provisionalPaths = data.repos.map((repo) => repo.path);
          const provisionalMeta: Record<string, RepoMetaEntry> = {};
          for (const repo of data.repos) {
            const lastOpened = normalizeTimestamp(repo.lastOpened, Date.now());
            provisionalMeta[repo.path] = {
              lastOpened,
              pinned: Boolean(repo.pinned),
              createdAt: normalizeTimestamp(repo.createdAt, lastOpened),
            };
          }
          pendingStoredReposRef.current = { paths: provisionalPaths, meta: provisionalMeta };

          const resolvedRepos = await Promise.all(
            data.repos.map(async (repo) => {
              try {
                const resolvedPath = await appClient.resolveRepoPath(repo.path);
                return { repo, canonicalPath: String(resolvedPath || '').trim() || repo.path };
              } catch {
                // Keep an unavailable entry so the existing recovery workflow
                // can offer removal instead of silently dropping user state.
                return { repo, canonicalPath: repo.path };
              }
            }),
          );
          if (repoOperationSequenceRef.current !== operationId) {
            return;
          }

          const paths: string[] = [];
          const meta: Record<string, RepoMetaEntry> = {};
          const canonicalPathByKey = new Map<string, string>();
          const canonicalPathByRequestedKey = new Map<string, string>();
          for (const { repo, canonicalPath } of resolvedRepos) {
            const canonicalKey = normalizeRepoPathKey(canonicalPath);
            canonicalPathByRequestedKey.set(normalizeRepoPathKey(repo.path), canonicalPath);
            const lastOpened = normalizeTimestamp(repo.lastOpened, Date.now());
            const createdAt = normalizeTimestamp(repo.createdAt, lastOpened);
            const existingPath = canonicalPathByKey.get(canonicalKey);
            if (existingPath) {
              const existingMeta = meta[existingPath];
              existingMeta.lastOpened = Math.max(existingMeta.lastOpened, lastOpened);
              existingMeta.createdAt = Math.min(existingMeta.createdAt, createdAt);
              existingMeta.pinned = existingMeta.pinned || Boolean(repo.pinned);
              continue;
            }

            canonicalPathByKey.set(canonicalKey, canonicalPath);
            paths.push(canonicalPath);
            meta[canonicalPath] = {
              lastOpened,
              pinned: Boolean(repo.pinned),
              createdAt,
            };
          }

          const storedActiveKey = data.activeRepo ? normalizeRepoPathKey(data.activeRepo) : '';
          const resolvedStoredActive = storedActiveKey ? canonicalPathByRequestedKey.get(storedActiveKey) || canonicalPathByKey.get(storedActiveKey) : null;
          const active = resolvedStoredActive ? canonicalPathByKey.get(normalizeRepoPathKey(resolvedStoredActive)) || paths[0] : paths[0];
          const canonicalActive = await appClient.setRepoPath(active);
          if (repoOperationSequenceRef.current === operationId) {
            pendingStoredReposRef.current = null;
            repoMetaRef.current = meta;
            openReposRef.current = paths;
            setRepoMeta(meta);
            setOpenRepos(paths);
            migrateRepoPathToCanonical(active, canonicalActive);
            activeRepoRef.current = canonicalActive;
            setActiveRepo(canonicalActive);
          }
        } else {
          pendingStoredReposRef.current = null;
          await appClient.clearRepoPath();
          if (repoOperationSequenceRef.current === operationId) {
            setActiveRepo(null);
            onNoActiveRepo();
          }
        }
      } catch (e) {
        console.error(e);
      }
      if (repoOperationSequenceRef.current === operationId) {
        pendingStoredReposRef.current = null;
        setReposLoaded(true);
      }
    };
    loadStored();
  }, [migrateRepoPathToCanonical, onNoActiveRepo]);

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
    if (!appClient.isAvailable() || normalizeRepoPathKey(repoPath) === normalizeRepoPathKey(activeRepoRef.current || '')) return;
    const operationId = ++repoOperationSequenceRef.current;
    // Prevent a confirmation opened for repo A from being accepted while the
    // main process has already switched to repo B but React has not rerendered.
    setConfirmDialog(null);
    const canonicalRepoPath = await appClient.setRepoPath(repoPath);
    if (repoOperationSequenceRef.current !== operationId) return;
    migrateRepoPathToCanonical(repoPath, canonicalRepoPath);
    activeRepoRef.current = canonicalRepoPath;
    setActiveRepo(canonicalRepoPath);
    setReposLoaded(true);
    touchRepo(canonicalRepoPath);
    onRepoActivated();
    triggerRefresh();
  };

  const handleCloseRepo = async (repoPath: string) => {
    const repoKey = normalizeRepoPathKey(repoPath);
    const currentOpenRepos = openReposRef.current;
    if (!currentOpenRepos.some((candidate) => normalizeRepoPathKey(candidate) === repoKey)) return;

    const next = currentOpenRepos.filter((candidate) => normalizeRepoPathKey(candidate) !== repoKey);
    const nextMeta = Object.fromEntries(Object.entries(repoMetaRef.current).filter(([candidate]) => normalizeRepoPathKey(candidate) !== repoKey)) as Record<
      string,
      RepoMetaEntry
    >;

    openReposRef.current = next;
    repoMetaRef.current = nextMeta;
    setOpenRepos(next);
    setRepoMeta(nextMeta);

    // Closing a repository that is not the active one changes neither the active
    // repository nor the main-process selection. It must therefore NOT bump the
    // operation sequence, otherwise it would invalidate an in-flight switch to a
    // different repository and leave the UI showing one repo while the main
    // process operates on another.
    if (!activeRepoRef.current || normalizeRepoPathKey(activeRepoRef.current) !== repoKey) {
      setReposLoaded(true);
      return;
    }

    const operationId = ++repoOperationSequenceRef.current;
    setConfirmDialog(null);
    if (next.length > 0) {
      const sortedNext = sortRepoPaths(next, nextMeta, repoSortByRef.current);
      const newActive = sortedNext[0];
      if (appClient.isAvailable()) {
        const canonicalRepoPath = await appClient.setRepoPath(newActive);
        if (repoOperationSequenceRef.current !== operationId) return;
        migrateRepoPathToCanonical(newActive, canonicalRepoPath);
        activeRepoRef.current = canonicalRepoPath;
        setActiveRepo(canonicalRepoPath);
        setReposLoaded(true);
        touchRepo(canonicalRepoPath);
      } else {
        if (repoOperationSequenceRef.current !== operationId) return;
        activeRepoRef.current = newActive;
        setActiveRepo(newActive);
        setReposLoaded(true);
        touchRepo(newActive);
      }
      onRepoActivated();
      triggerRefresh();
    } else {
      if (appClient.isAvailable()) {
        await appClient.clearRepoPath();
      }
      if (repoOperationSequenceRef.current !== operationId) return;
      activeRepoRef.current = null;
      setActiveRepo(null);
      setReposLoaded(true);
      onNoActiveRepo();
    }
  };

  const ensureRepoPresent = (repoPath: string) => {
    const now = Date.now();
    const repoKey = normalizeRepoPathKey(repoPath);
    const pendingStored = pendingStoredReposRef.current;
    const seenRepoKeys = new Set<string>();
    const previousRepos = [...(pendingStored?.paths || []), ...openReposRef.current].filter((candidate) => {
      const candidateKey = normalizeRepoPathKey(candidate);
      if (seenRepoKeys.has(candidateKey)) return false;
      seenRepoKeys.add(candidateKey);
      return true;
    });
    const nextRepos = previousRepos.some((candidate) => normalizeRepoPathKey(candidate) === repoKey) ? previousRepos : [...previousRepos, repoPath];
    openReposRef.current = nextRepos;
    setOpenRepos(nextRepos);

    const previousMeta = { ...(pendingStored?.meta || {}), ...repoMetaRef.current };
    const nextMeta = {
      ...previousMeta,
      [repoPath]: {
        pinned: previousMeta[repoPath]?.pinned || false,
        lastOpened: now,
        createdAt: previousMeta[repoPath]?.createdAt || now,
      },
    };
    repoMetaRef.current = nextMeta;
    setRepoMeta(nextMeta);
    pendingStoredReposRef.current = null;
  };

  const handleOpenFolder = async () => {
    if (!appClient.isAvailable()) return;
    try {
      const result = await appClient.openDirectory();
      if (result && result.isRepo) {
        const operationId = ++repoOperationSequenceRef.current;
        setConfirmDialog(null);
        const canonicalRepoPath = await appClient.setRepoPath(result.path);
        if (repoOperationSequenceRef.current !== operationId) return;
        migrateRepoPathToCanonical(result.path, canonicalRepoPath);
        ensureRepoPresent(canonicalRepoPath);
        activeRepoRef.current = canonicalRepoPath;
        setActiveRepo(canonicalRepoPath);
        setReposLoaded(true);
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
              setConfirmDialog(null);
              const canonicalRepoPath = await appClient.setRepoPath(result.path);
              if (repoOperationSequenceRef.current !== operationId) return;
              migrateRepoPathToCanonical(result.path, canonicalRepoPath);
              ensureRepoPresent(canonicalRepoPath);
              activeRepoRef.current = canonicalRepoPath;
              setActiveRepo(canonicalRepoPath);
              setReposLoaded(true);
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
    setConfirmDialog(null);
    const canonicalRepoPath = await appClient.setRepoPath(repoPath);
    if (repoOperationSequenceRef.current !== operationId) return;
    migrateRepoPathToCanonical(repoPath, canonicalRepoPath);
    ensureRepoPresent(canonicalRepoPath);
    activeRepoRef.current = canonicalRepoPath;
    setActiveRepo(canonicalRepoPath);
    setReposLoaded(true);
    onRepoActivated();
    triggerRefresh();
  };

  const toggleRepoPin = (repoPath: string) => {
    const now = Date.now();
    setRepoMeta((prev) => {
      const next = {
        ...prev,
        [repoPath]: {
          pinned: !prev[repoPath]?.pinned,
          lastOpened: normalizeTimestamp(prev[repoPath]?.lastOpened, now),
          createdAt: normalizeTimestamp(prev[repoPath]?.createdAt, now),
        },
      };
      repoMetaRef.current = next;
      return next;
    });
  };

  const handleSetRepoSortBy = (sortBy: RepoSortByDto) => {
    repoSortByRef.current = sortBy;
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
