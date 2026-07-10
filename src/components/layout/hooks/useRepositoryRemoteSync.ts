import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { RemoteSyncState } from '@/types/git';
import { getLocale, useLanguageTranslations, type AppLanguage } from '@/i18n';
import { parseBranchSyncFromPorcelainV2 } from '@/utils/gitParsing';
import { isRemoteRepositoryMissingError } from '@/utils/gitPushRecovery';
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

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  triggerRefresh: () => void;
  autoFetchIntervalMs: number;
  language: AppLanguage;
  hasRemoteOrigin: boolean | null;
  setHasRemoteOrigin: Dispatch<SetStateAction<boolean | null>>;
  setRemotes: Dispatch<SetStateAction<RepositoryRemote[]>>;
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
  hasRemoteOrigin,
  setHasRemoteOrigin,
  setRemotes,
  setGitActionToast,
  setActiveGitActionLabel,
  isGitActionRunningRef,
}: Params) => {
  const [remoteSync, setRemoteSync] = useState<RemoteSyncState>({ ...EMPTY_REMOTE_SYNC_STATE });
  const isRemoteFetchRunningRef = useRef(false);
  const remoteFetchRunIdRef = useRef(0);
  const activeRepoRef = useRef<string | null>(activeRepo);
  const { t, tr } = useLanguageTranslations(language);

  useEffect(() => {
    activeRepoRef.current = activeRepo;
    remoteFetchRunIdRef.current += 1;
    isRemoteFetchRunningRef.current = false;
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
    setRemoteSync({ ...EMPTY_REMOTE_SYNC_STATE });
  }, [activeRepo, setRemoteSync]);

  useEffect(() => {
    let cancelled = false;
    const fetchRemoteTracking = async () => {
      if (!activeRepo || !gitClient.isAvailable()) {
        setRemoteSync((prev) => ({ ...prev, ahead: 0, behind: 0, hasUpstream: false }));
        return;
      }

      try {
        const { success, data } = await gitClient.getBranchStatusPorcelainV2();
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
    async (showToast = false) => {
      if (!gitClient.isAvailable() || !activeRepo) return false;
      if (isRemoteFetchRunningRef.current || isGitActionRunningRef.current) return false;
      const repoAtStart = activeRepo;
      const fetchRunId = remoteFetchRunIdRef.current + 1;
      remoteFetchRunIdRef.current = fetchRunId;

      const fetchLabel = t('generated.components.layout.hooks.userepositorydomain.running_fetch_2dde9664');
      isRemoteFetchRunningRef.current = true;
      setActiveGitActionLabel(fetchLabel);
      setRemoteSync((prev) => ({ ...prev, isFetching: true }));

      try {
        const result = await gitClient.runGitCommand('fetch', '--all', '--prune', '--tags', '--quiet');
        if (activeRepoRef.current !== repoAtStart) return false;
        if (result.success) {
          setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchedAt: Date.now(), lastFetchError: null }));
          triggerRefresh();
          if (showToast) {
            setGitActionToast({ msg: t('generated.components.layout.hooks.userepositorydomain.remote_updated_d577a6b1'), isError: false });
          }
          return true;
        }

        const errorMessage = String(result.error || t('generated.components.layout.hooks.userepositorydomain.could_not_update_remote_fbb52423'));
        if (isRemoteRepositoryMissingError(errorMessage)) {
          const removeOriginResult = await gitClient.removeRemote('origin');
          if (activeRepoRef.current !== repoAtStart) return false;
          const removeOriginError = String(removeOriginResult.error || '').trim();
          const originAlreadyMissing = /no such remote\s+'?origin'?/i.test(removeOriginError);

          if (removeOriginResult.success || originAlreadyMissing) {
            setHasRemoteOrigin(false);
            setRemotes((prev) => prev.filter((remote) => remote.name !== 'origin'));
            setRemoteSync({
              ...EMPTY_REMOTE_SYNC_STATE,
              isFetching: false,
            });
            triggerRefresh();
            setGitActionToast({
              msg: t('generated.components.layout.hooks.userepositorydomain.github_repository_no_longer_exists_origin_was_removed_re_119b0bb7'),
              isError: false,
            });
            return true;
          }
        }

        setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
        if (showToast) {
          setGitActionToast({ msg: errorMessage, isError: true });
        }
        return false;
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
    [activeRepo, isGitActionRunningRef, setActiveGitActionLabel, setGitActionToast, setHasRemoteOrigin, setRemotes, setRemoteSync, t, triggerRefresh],
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

    if (hasRemoteOrigin === false) {
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
  }, [formatLastFetchedAt, hasRemoteOrigin, remoteSync, t, tr]);

  return {
    remoteSync,
    remoteStatus,
    refreshRemoteState,
  };
};
