import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { RemoteSyncState } from '@/types/git';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { getLocale } from '@/i18nCore';
import { parseBranchSyncFromPorcelainV2 } from '@/utils/gitParsing';
import { parseTagReferenceStatus, remoteTagTrackingRefPrefix, TAG_REFERENCE_STATUS_FORMAT } from '@/utils/tagConflicts';
import { formatTime } from '@/utils/dateTime';
import { gitClient } from '@/services/gitClient';
import type { RemoteStatusInfo } from '@/components/layout/layoutTypes';
import type { GitActionToast, RepositoryRemote } from './repositoryDomainTypes';

export const EMPTY_REMOTE_SYNC_STATE: RemoteSyncState = {
  isFetching: false,
  lastFetchedAt: null,
  lastFetchError: null,
  ahead: 0,
  behind: 0,
  hasUpstream: false,
};

// Remote tags are fetched into an application-owned ref namespace rather than
// `refs/tags/*`. That preserves their history markers while guaranteeing an
// automatic refresh cannot overwrite a user's local tag with the same name.
const remoteTagTrackingRefspec = (remote: string) => `+refs/tags/*:refs/ogc/remote-tags/${remote}/*`;

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  triggerRefresh: () => void;
  autoFetchIntervalMs: number;
  language: AppLanguage;
  /** Tri-state: null until remotes are loaded, then whether any remote exists. */
  hasAnyRemote: boolean | null;
  /** All configured remotes, used to resolve which remote to fetch from. */
  remotes: RepositoryRemote[];
  setGitActionToast: (toast: GitActionToast) => void;
  setActiveGitActionLabel: Dispatch<SetStateAction<string | null>>;
  isGitActionRunningRef: MutableRefObject<boolean>;
};

export const useRepositoryRemoteSync = ({
  activeRepo,
  refreshTrigger,
  triggerRefresh,
  autoFetchIntervalMs,
  language,
  hasAnyRemote,
  remotes,
  setGitActionToast,
  setActiveGitActionLabel,
  isGitActionRunningRef,
}: Params) => {
  const [remoteSync, setRemoteSync] = useState<RemoteSyncState>({ ...EMPTY_REMOTE_SYNC_STATE });
  const [lastFetchedRemote, setLastFetchedRemote] = useState<string | null>(null);
  const isRemoteFetchRunningRef = useRef(false);
  const remoteFetchRunIdRef = useRef(0);
  const activeRepoRef = useRef<string | null>(activeRepo);
  const { t, tr } = useLanguageTranslations(language);

  // Key by value (not array identity) so a caller passing a freshly built
  // `remotes` array on every render does not churn the fetch callback/effect.
  const remoteNamesKey = remotes.map((remote) => remote.name).join('\0');
  const remoteNames = useMemo(() => (remoteNamesKey ? remoteNamesKey.split('\0') : []), [remoteNamesKey]);

  // Choose which remote to auto-fetch, independent of any fixed "origin" name:
  // prefer the remote the current branch tracks, then a remote named "origin",
  // then the sole remote if there is exactly one. Never fetch "--all", so a
  // single unreachable remote cannot produce an ambiguous multi-remote failure.
  const resolveFetchRemote = useCallback(
    (branchStatusText: string): string | null => {
      const upstreamRemote = parseBranchSyncFromPorcelainV2(branchStatusText, remoteNames).upstreamRemote;
      if (upstreamRemote) return upstreamRemote;
      if (remoteNames.includes('origin')) return 'origin';
      if (remoteNames.length === 1) return remoteNames[0];
      return null;
    },
    [remoteNames],
  );

  useLayoutEffect(() => {
    activeRepoRef.current = activeRepo;
    remoteFetchRunIdRef.current += 1;
    isRemoteFetchRunningRef.current = false;
    setRemoteSync({ ...EMPTY_REMOTE_SYNC_STATE });
    setLastFetchedRemote(null);
  }, [activeRepo]);

  const formatLastFetchedAt = useCallback(
    (timestamp: number | null) => {
      if (!timestamp) return t('generated.components.layout.hooks.userepositorydomain.not_updated_yet_67fe75b0');
      const locale = getLocale(language);
      return (
        t('generated.components.layout.hooks.userepositorydomain.last_updated_48292542') +
        ': ' +
        formatTime(timestamp, locale, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    },
    [language, t],
  );

  useEffect(() => {
    let cancelled = false;
    const fetchRemoteTracking = async () => {
      if (!activeRepo || !gitClient.isAvailable()) {
        setRemoteSync((prev) => ({ ...prev, ahead: 0, behind: 0, hasUpstream: false }));
        return;
      }

      try {
        const { success, data } = await gitClient.runGitCommandForRepo(activeRepo, 'status', '--porcelain=v2', '--branch');
        if (cancelled) return;
        if (!success || !data) return;

        const parsed = parseBranchSyncFromPorcelainV2(String(data));
        setRemoteSync((prev) => ({
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
    return () => {
      cancelled = true;
    };
  }, [activeRepo, refreshTrigger, setRemoteSync]);

  const refreshRemoteState = useCallback(
    // eslint-disable-next-line complexity -- Branch fetch, tag reconciliation and UI state must remain one repository-bound operation.
    async (showToast = false) => {
      // `hasAnyRemote === null` means the remote list has not loaded yet; wait
      // rather than guessing. `false` is a confirmed local-only repository and
      // is handled inside the try block below instead of being a no-op.
      if (!gitClient.isAvailable() || !activeRepo || hasAnyRemote === null) return false;
      if (isRemoteFetchRunningRef.current || isGitActionRunningRef.current) return false;
      const repoAtStart = activeRepo;
      const fetchRunId = remoteFetchRunIdRef.current + 1;
      remoteFetchRunIdRef.current = fetchRunId;

      const fetchLabel = t('generated.components.layout.hooks.userepositorydomain.running_fetch_2dde9664');
      isRemoteFetchRunningRef.current = true;
      setActiveGitActionLabel(fetchLabel);
      setRemoteSync((prev) => ({ ...prev, isFetching: true }));

      try {
        // A repository with no configured remote cannot be fetched from, but its
        // working tree, branches, and commit graph can still have changed
        // outside the app (e.g. commits made from the command line). Route the
        // fetch action to a local refresh instead of leaving the button inert.
        if (hasAnyRemote === false) {
          triggerRefresh();
          setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: null }));
          if (showToast) {
            setGitActionToast({
              msg: tr('Lokales Repository aktualisiert (kein Remote konfiguriert).', 'Local repository refreshed (no remote configured).'),
              isError: false,
            });
          }
          return true;
        }

        const statusResult = await gitClient.runGitCommandForRepo(repoAtStart, 'status', '--porcelain=v2', '--branch');
        if (activeRepoRef.current !== repoAtStart) return false;
        const fetchRemote = resolveFetchRemote(statusResult.success ? String(statusResult.data || '') : '');
        if (!fetchRemote) {
          // No unambiguous remote to fetch from (e.g. several remotes and no
          // tracking branch); leave the last known state untouched.
          setRemoteSync((prev) => ({ ...prev, isFetching: false }));
          return false;
        }

        // Keep this operation bound to the repository whose remote and branch
        // state were inspected. The main process rejects it if that repository
        // ceased to be active while the asynchronous status call was pending.
        // Fetch branch tracking refs first. Pulling tags into `refs/tags/*`
        // would make a normal background refresh fail if a same-named local
        // tag points to another commit.
        const result = await gitClient.runGitCommandForRepo(repoAtStart, 'fetch', fetchRemote, '--prune', '--no-tags', '--quiet');
        if (activeRepoRef.current !== repoAtStart) return false;
        if (!result.success) {
          const errorMessage = String(result.error || t('generated.components.layout.hooks.userepositorydomain.could_not_update_remote_fbb52423'));
          setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
          if (showToast) {
            setGitActionToast({ msg: errorMessage, isError: true });
          }
          return false;
        }

        // Maintain remote release state independently from local tags.
        // `--prune` removes tags deleted on the remote from this tracking
        // namespace on the next sync, without moving local tags.
        const remoteTagsResult = await gitClient.runGitCommandForRepo(
          repoAtStart,
          'fetch',
          fetchRemote,
          '--prune',
          '--no-tags',
          '--quiet',
          remoteTagTrackingRefspec(fetchRemote),
        );
        if (activeRepoRef.current !== repoAtStart) return false;
        if (!remoteTagsResult.success) {
          const errorMessage = String(remoteTagsResult.error || t('generated.components.layout.hooks.userepositorydomain.could_not_update_remote_fbb52423'));
          setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
          if (showToast) {
            setGitActionToast({ msg: errorMessage, isError: true });
          }
          return false;
        }

        // Adopt remote tags that do not exist locally yet. Existing local tags
        // are deliberately left untouched; a mismatching name is exposed as a
        // conflict instead of being silently moved by an automatic fetch.
        const referenceStatus = await gitClient.runGitCommandForRepo(
          repoAtStart,
          'forEachRef',
          TAG_REFERENCE_STATUS_FORMAT,
          'refs/tags',
          remoteTagTrackingRefPrefix(fetchRemote),
        );
        if (activeRepoRef.current !== repoAtStart) return false;
        if (!referenceStatus.success) {
          const errorMessage = String(referenceStatus.error || t('generated.components.layout.hooks.userepositorydomain.could_not_update_remote_fbb52423'));
          setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
          if (showToast) {
            setGitActionToast({ msg: errorMessage, isError: true });
          }
          return false;
        }

        for (const tagName of parseTagReferenceStatus(referenceStatus.data, fetchRemote).remoteOnlyTagNames) {
          const adoptionResult = await gitClient.runGitCommandForRepo(repoAtStart, 'adoptRemoteTag', fetchRemote, tagName);
          if (activeRepoRef.current !== repoAtStart) return false;
          if (adoptionResult.success) continue;

          const errorMessage = String(adoptionResult.error || t('generated.components.layout.hooks.userepositorydomain.could_not_update_remote_fbb52423'));
          setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
          if (showToast) {
            setGitActionToast({ msg: errorMessage, isError: true });
          }
          return false;
        }

        setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchedAt: Date.now(), lastFetchError: null }));
        setLastFetchedRemote(fetchRemote);
        triggerRefresh();
        if (showToast) {
          setGitActionToast({ msg: t('generated.components.layout.hooks.userepositorydomain.remote_updated_d577a6b1'), isError: false });
        }
        return true;
      } catch (error: any) {
        if (activeRepoRef.current !== repoAtStart) return false;
        const errorMessage = error?.message || t('generated.components.layout.hooks.userepositorydomain.could_not_update_remote_fbb52423');
        setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
        if (showToast) {
          setGitActionToast({ msg: errorMessage, isError: true });
        }
        return false;
      } finally {
        if (remoteFetchRunIdRef.current === fetchRunId) {
          isRemoteFetchRunningRef.current = false;
          if (activeRepoRef.current === repoAtStart) {
            setActiveGitActionLabel((current) => (current === fetchLabel ? null : current));
          }
        }
      }
    },
    [activeRepo, hasAnyRemote, resolveFetchRemote, isGitActionRunningRef, setActiveGitActionLabel, setGitActionToast, setRemoteSync, t, tr, triggerRefresh],
  );

  useEffect(() => {
    if (!activeRepo) {
      setRemoteSync({ ...EMPTY_REMOTE_SYNC_STATE });
      return;
    }

    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshRemoteState();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshRemoteState();
      }
    };

    void refreshRemoteState();
    const intervalId = window.setInterval(refreshIfVisible, autoFetchIntervalMs);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [activeRepo, autoFetchIntervalMs, refreshRemoteState, setRemoteSync]);

  const remoteStatus: RemoteStatusInfo = useMemo(() => {
    if (remoteSync.lastFetchError) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.remote_check_failed_306695fe'),
        detail: remoteSync.lastFetchError,
        color: 'var(--status-danger)',
        backgroundColor: 'var(--status-danger-soft)',
        borderColor: 'var(--status-danger-border)',
      };
    }

    if (hasAnyRemote === false) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.no_remote_configured_c025d492'),
        detail: t('generated.components.layout.hooks.userepositorydomain.this_repository_has_no_remote_yet_d5654811'),
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (remoteSync.lastFetchedAt === null) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.remote_not_checked_yet_47aad08d'),
        detail: t('generated.components.layout.hooks.userepositorydomain.no_successful_fetch_for_this_repository_yet_5234cde0'),
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (!remoteSync.hasUpstream) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.no_tracking_branch_f236e75a'),
        detail: t('generated.components.layout.hooks.userepositorydomain.current_local_branch_does_not_track_a_remote_branch_8dc15592'),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.ahead > 0 && remoteSync.behind > 0) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.local_and_remote_diverged_b0bb5820'),
        detail: tr(
          `Lokal ${remoteSync.ahead} voraus, Remote ${remoteSync.behind} voraus.`,
          `Local ahead by ${remoteSync.ahead}, remote ahead by ${remoteSync.behind}.`,
        ),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.behind > 0) {
      return {
        title: tr(
          `Remote ist ${remoteSync.behind} Commit${remoteSync.behind === 1 ? '' : 's'} voraus`,
          `Remote is ahead by ${remoteSync.behind} commit${remoteSync.behind === 1 ? '' : 's'}`,
        ),
        detail: t('generated.components.layout.hooks.userepositorydomain.remote_has_newer_commits_than_your_local_branch_eea6b334'),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.ahead > 0) {
      return {
        title: tr(
          `Lokal ist ${remoteSync.ahead} Commit${remoteSync.ahead === 1 ? '' : 's'} voraus`,
          `Local is ahead by ${remoteSync.ahead} commit${remoteSync.ahead === 1 ? '' : 's'}`,
        ),
        detail: t('generated.components.layout.hooks.userepositorydomain.your_local_commits_have_not_been_pushed_yet_92f12a9e'),
        color: 'var(--text-accent)',
        backgroundColor: 'var(--accent-primary-soft)',
        borderColor: 'var(--accent-primary-border)',
      };
    }

    return {
      title: t('generated.components.layout.hooks.userepositorydomain.remote_is_up_to_date_ed54ec4a'),
      detail: formatLastFetchedAt(remoteSync.lastFetchedAt),
      color: 'var(--status-success)',
      backgroundColor: 'var(--status-success-soft)',
      borderColor: 'var(--status-success-border)',
    };
  }, [formatLastFetchedAt, hasAnyRemote, remoteSync, t, tr]);

  return {
    remoteSync,
    remoteStatus,
    lastFetchedRemote,
    refreshRemoteState,
  };
};
