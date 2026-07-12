import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RepoSortByDto } from '@/types/appDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { AppTabId, InputDialogState } from '@/app/state/contracts';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { getLicenseTemplateRequirements, LICENSE_TEMPLATE_OPTIONS, isLicenseTemplateId } from '@/shared/licenseTemplates';
import type { Dispatch, SetStateAction } from 'react';

type Params = {
  triggerRefresh: () => void;
  setConfirmDialog: (state: ConfirmDialogState | null) => void;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
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
const BACKGROUND_REPO_RESOLUTION_CONCURRENCY = 4;

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

const getRepositoryNameFromPath = (repositoryPath: string): string =>
  repositoryPath
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || 'My Program';

export const useWorkspaceDomain = ({
  triggerRefresh,
  setConfirmDialog,
  setInputDialog,
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
  const [isRestoringRepos, setIsRestoringRepos] = useState(true);
  const repoOperationSequenceRef = useRef(0);
  const repoRestoreSequenceRef = useRef(0);
  const openReposRef = useRef(openRepos);
  const activeRepoRef = useRef(activeRepo);
  const repoMetaRef = useRef(repoMeta);
  const repoSortByRef = useRef(repoSortBy);

  // Dialog callbacks can outlive the render in which they were created. Keep
  // repository mutations anchored to the latest committed workspace state
  // instead of a stale closure captured before a repository switch.
  useLayoutEffect(() => {
    openReposRef.current = openRepos;
    activeRepoRef.current = activeRepo;
    repoMetaRef.current = repoMeta;
    repoSortByRef.current = repoSortBy;
  }, [activeRepo, openRepos, repoMeta, repoSortBy]);

  const { t, tr } = useLanguageTranslations(language);

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
      let found = false;
      for (const repoPath of previous) {
        const pathKey = normalizeRepoPathKey(repoPath);
        const isAlias = pathKey === requestedKey || pathKey === canonicalKey;
        if (isAlias) found = true;
        const candidate = isAlias ? canonicalPath : repoPath;
        const candidateKey = normalizeRepoPathKey(candidate);
        if (seen.has(candidateKey)) continue;
        seen.add(candidateKey);
        next.push(candidate);
      }
      if (!found) return previous;
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
      if (merged.length === 0) return previous;
      const now = Date.now();
      const lastOpened = Math.max(...merged.map((meta) => normalizeTimestamp(meta.lastOpened, 0)), 0);
      const createdAt = Math.min(...merged.map((meta) => normalizeTimestamp(meta.createdAt, lastOpened || now)));
      next[canonicalPath] = {
        pinned: merged.some((meta) => meta.pinned),
        lastOpened: lastOpened || now,
        createdAt: createdAt || lastOpened || now,
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
      const restoreId = ++repoRestoreSequenceRef.current;
      if (!appClient.isAvailable()) {
        setReposLoaded(true);
        if (repoRestoreSequenceRef.current === restoreId) setIsRestoringRepos(false);
        return;
      }
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
          // Render the persisted entries immediately. Path canonicalization is
          // deliberately deferred, so a slow drive or a long repository list
          // never presents a misleading empty-state screen during startup.
          const provisionalPaths: string[] = [];
          const provisionalMeta: Record<string, RepoMetaEntry> = {};
          for (const repo of data.repos) {
            const path = String(repo.path || '').trim();
            if (!path || provisionalPaths.some((candidate) => normalizeRepoPathKey(candidate) === normalizeRepoPathKey(path))) continue;
            const lastOpened = normalizeTimestamp(repo.lastOpened, Date.now());
            provisionalPaths.push(path);
            provisionalMeta[path] = {
              lastOpened,
              pinned: Boolean(repo.pinned),
              createdAt: normalizeTimestamp(repo.createdAt, lastOpened),
            };
          }
          openReposRef.current = provisionalPaths;
          repoMetaRef.current = provisionalMeta;
          setOpenRepos(provisionalPaths);
          setRepoMeta(provisionalMeta);
          setReposLoaded(true);

          if (provisionalPaths.length === 0) {
            await appClient.clearRepoPath();
            if (repoOperationSequenceRef.current === operationId) {
              setActiveRepo(null);
              onNoActiveRepo();
            }
          } else {
            const storedActiveKey = data.activeRepo ? normalizeRepoPathKey(data.activeRepo) : '';
            const active = provisionalPaths.find((repoPath) => normalizeRepoPathKey(repoPath) === storedActiveKey) || provisionalPaths[0];
            const canonicalActive = await appClient.setRepoPath(active);
            if (repoOperationSequenceRef.current !== operationId) {
              if (repoRestoreSequenceRef.current === restoreId) setIsRestoringRepos(false);
              return;
            }
            migrateRepoPathToCanonical(active, canonicalActive);
            activeRepoRef.current = canonicalActive;
            setActiveRepo(canonicalActive);

            // The selected repository is ready now. Resolve every remaining
            // entry in bounded async workers without delaying the graph or list.
            const remainingPaths = provisionalPaths.filter((repoPath) => normalizeRepoPathKey(repoPath) !== normalizeRepoPathKey(active));
            let nextPathIndex = 0;
            const resolveNextPath = async () => {
              while (nextPathIndex < remainingPaths.length) {
                const repoPath = remainingPaths[nextPathIndex++];
                try {
                  const canonicalPath = String((await appClient.resolveRepoPath(repoPath)) || '').trim() || repoPath;
                  migrateRepoPathToCanonical(repoPath, canonicalPath);
                } catch {
                  // Keep unavailable entries visible so their existing recovery
                  // workflow can offer removal instead of silently dropping them.
                }
              }
            };
            await Promise.all(Array.from({ length: Math.min(BACKGROUND_REPO_RESOLUTION_CONCURRENCY, remainingPaths.length) }, resolveNextPath));
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
      if (repoOperationSequenceRef.current === operationId) {
        setReposLoaded(true);
      }
      if (repoRestoreSequenceRef.current === restoreId) {
        setIsRestoringRepos(false);
      }
    };
    loadStored();
  }, [migrateRepoPathToCanonical, onNoActiveRepo]);

  useEffect(() => {
    if (!reposLoaded || isRestoringRepos || !appClient.isAvailable()) return;

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
  }, [sortedOpenRepos, repoMeta, activeRepo, repoSortBy, reposLoaded, isRestoringRepos]);

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
    const seenRepoKeys = new Set<string>();
    const previousRepos = openReposRef.current.filter((candidate) => {
      const candidateKey = normalizeRepoPathKey(candidate);
      if (seenRepoKeys.has(candidateKey)) return false;
      seenRepoKeys.add(candidateKey);
      return true;
    });
    const nextRepos = previousRepos.some((candidate) => normalizeRepoPathKey(candidate) === repoKey) ? previousRepos : [...previousRepos, repoPath];
    openReposRef.current = nextRepos;
    setOpenRepos(nextRepos);

    const previousMeta = repoMetaRef.current;
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
        const repositoryName = getRepositoryNameFromPath(result.path);
        setInputDialog({
          title: t('generated.components.layout.hooks.useworkspacedomain.initialize_git_repository_0ba2d2a1'),
          message: tr(
            'Der ausgewaehlte Ordner ist noch kein Git-Repository. Waehle optional eine README-Vorlage und eine Lizenz, bevor Git initialisiert wird.',
            'The selected folder is not a Git repository yet. Optionally choose a README template and a license before Git is initialized.',
          ),
          fields: [
            {
              id: 'createReadme',
              label: tr('README.md mit Open-Git-Control-Vorlage erstellen', 'Create README.md with an Open Git Control template'),
              type: 'checkbox',
              defaultValue: 'false',
              helperText: tr('Vorhandene README-Dateien werden nie ueberschrieben.', 'Existing README files are never overwritten.'),
            },
            {
              id: 'license',
              label: tr('Lizenzvorlage', 'License template'),
              type: 'select',
              defaultValue: 'none',
              options: LICENSE_TEMPLATE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.value === 'none' ? tr('Keine Lizenz', 'No license') : option.label,
              })),
            },
            {
              id: 'copyrightHolder',
              label: tr('Urheberrechtsinhaber', 'Copyright holder'),
              placeholder: tr('Name oder Organisation', 'Name or organization'),
              helperText: tr('Wird fuer diese Lizenz und ihren Anwendungsnachweis verwendet.', 'Used for this license and its application notice.'),
              required: true,
              visible: (values) => {
                const license = isLicenseTemplateId(values.license) ? values.license : 'none';
                return getLicenseTemplateRequirements(license).requiresCopyrightHolder;
              },
            },
            {
              id: 'programName',
              label: tr('Programmname', 'Program name'),
              defaultValue: repositoryName,
              helperText: tr('Wird fuer den GNU-Lizenzhinweis verwendet.', 'Used for the GNU license notice.'),
              required: true,
              visible: (values) => {
                const license = isLicenseTemplateId(values.license) ? values.license : 'none';
                return getLicenseTemplateRequirements(license).requiresProgramName;
              },
            },
            {
              id: 'programDescription',
              label: tr('Kurze Programmbeschreibung', 'Short program description'),
              placeholder: tr('Was macht dieses Programm?', 'What does this program do?'),
              helperText: tr('Wird fuer den GNU-Lizenzhinweis verwendet.', 'Used for the GNU license notice.'),
              required: true,
              visible: (values) => {
                const license = isLicenseTemplateId(values.license) ? values.license : 'none';
                return getLicenseTemplateRequirements(license).requiresProgramDescription;
              },
            },
          ],
          contextItems: [
            { label: t('generated.components.layout.hooks.useworkspacedomain.path_f9011584'), value: result.path },
            { label: t('generated.components.staging_area.useconflictresolver.action_ba062410'), value: 'git init' },
          ],
          irreversible: false,
          consequences: tr(
            'Eine .git-Struktur wird angelegt. Gewaehlte Dateien werden nur erstellt, wenn sie noch nicht vorhanden sind.',
            'A .git directory will be created. Selected files are created only when they do not already exist.',
          ),
          confirmLabel: t('generated.components.layout.hooks.useworkspacedomain.initialize_repository_540255ad'),
          onSubmit: async (values) => {
            const license = isLicenseTemplateId(values.license) ? values.license : 'none';
            const initResult = await gitClient.gitInit(result.path, {
              createReadme: values.createReadme === 'true',
              license,
              copyrightHolder: values.copyrightHolder || '',
              programName: values.programName || '',
              programDescription: values.programDescription || '',
            });
            if (initResult.success) {
              const operationId = ++repoOperationSequenceRef.current;
              setInputDialog(null);
              const canonicalRepoPath = await appClient.setRepoPath(result.path);
              if (repoOperationSequenceRef.current !== operationId) return;
              migrateRepoPathToCanonical(result.path, canonicalRepoPath);
              ensureRepoPresent(canonicalRepoPath);
              activeRepoRef.current = canonicalRepoPath;
              setActiveRepo(canonicalRepoPath);
              setReposLoaded(true);
              onRepoActivated();
              const createdFiles = initResult.createdFiles || [];
              setGitActionToast({
                msg:
                  createdFiles.length > 0
                    ? tr(`Repository initialisiert. Erstellt: ${createdFiles.join(', ')}.`, `Repository initialized. Created: ${createdFiles.join(', ')}.`)
                    : t('generated.components.layout.hooks.useworkspacedomain.initialized_new_git_repository_058c91a4'),
                isError: false,
              });
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
    isRestoringRepos,
    repoSortBy,
    setRepoSortBy: handleSetRepoSortBy,
    handleSwitchRepo,
    handleCloseRepo,
    handleOpenFolder,
    addOpenRepo,
    toggleRepoPin,
  };
};
