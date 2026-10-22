import { useBlamePreview } from '@/data/useBlamePreview';
import { useResourceState } from '@/data/resourceHooks';
import { loadCommitOverview, EMPTY_COMMIT_OVERVIEW } from '@/data/commitDetails';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { useI18n } from '@/i18n';
import { extractGitObjectId } from '@/utils/gitObjectId';
import { gitClient } from '@/services/gitClient';
import { BLAME_LOOKAHEAD_COUNT, splitBlamePage } from '../file-details/blamePagination';
import type { CommitFileDetail } from '@/utils/gitParsing';
import { useCommitFileHistory } from './useCommitFileHistory';

export type DetailsTab = 'history' | 'blame';

type Params = {
  repoPath: string | null;
  hash: string;
  onOpenDiff?: (request: DiffRequest) => void;
  onSelectCommit?: (hash: string) => void;
  activeDiffRequest?: DiffRequest | null;
  refreshTrigger?: number;
};

export const extractCommitDescription = (message: string): string => {
  const lines = String(message || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const bodyLines = lines.slice(1);
  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();
  return bodyLines.join('\n');
};

export const useCommitDetailsData = ({ repoPath, hash, onOpenDiff, onSelectCommit, activeDiffRequest, refreshTrigger = 0 }: Params) => {
  const { t, tr, locale } = useI18n();

  const normalizedHash = useMemo(() => {
    return extractGitObjectId(hash) || '';
  }, [hash]);

  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [overview, setOverview, hasOverview] = useResourceState('git', 'commitOverview', [repoPath, normalizedHash], EMPTY_COMMIT_OVERVIEW);
  const { files, isMergeCommit, description: commitDescription } = overview;
  const filesSourceHint = overview.filesFromMerge
    ? t('generated.components.commitdetails.files_show_the_effective_changes_from_the_merged_branch_bd7570a6')
    : null;
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileCommitHash, setSelectedFileCommitHash] = useState<string | null>(null);
  const [revealFilePath, setRevealFilePath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');

  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const {
    lines: blameLines,
    setLines: setBlameLines,
    hasMore: blameHasMore,
    setHasMore: setBlameHasMore,
    hasData: hasBlame,
  } = useBlamePreview(repoPath, selectedFilePath, normalizedHash);

  // Bumped whenever the inspected commit changes. Every async fetch captures the
  // current value and refuses to write state once it is stale, so a late
  // response for one commit can never leak its files/description/blame into the
  // view of a different commit.
  const requestGenerationRef = useRef(0);
  const fileRequestGenerationRef = useRef(0);
  const pendingFileCommitRef = useRef<{ repoPath: string | null; fromHash: string; hash: string; path: string; arrived?: boolean } | null>(null);
  const restoredDiffRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    requestGenerationRef.current += 1;
    const pending = pendingFileCommitRef.current;
    if (pending && (pending.repoPath !== repoPath || (pending.hash !== normalizedHash && (pending.fromHash !== normalizedHash || pending.arrived)))) {
      pendingFileCommitRef.current = null;
    }
    if (pending?.hash === normalizedHash) pending.arrived = true;
    setLoadingFiles(false);
    setFilesError(null);
    setSelectedFilePath(null);
    setSelectedFileCommitHash(null);
    setRevealFilePath(null);
    setActiveTab('history');
    setBlameError(null);
  }, [normalizedHash, repoPath]);

  useLayoutEffect(() => {
    fileRequestGenerationRef.current += 1;
    setBlameLoading(false);
    setBlameError(null);
  }, [normalizedHash, repoPath, selectedFileCommitHash, selectedFilePath]);

  useEffect(() => {
    if (!repoPath || !normalizedHash || !gitClient.isAvailable()) return;
    const generation = requestGenerationRef.current;
    setLoadingFiles(!hasOverview);
    setFilesError(null);
    void loadCommitOverview(repoPath, normalizedHash)
      .then((result) => {
        if (generation !== requestGenerationRef.current) return;
        if (result.success) setOverview(result.data);
        else setFilesError(result.error);
      })
      .catch((error: unknown) => {
        if (generation === requestGenerationRef.current) setFilesError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (generation === requestGenerationRef.current) setLoadingFiles(false);
      });
  }, [normalizedHash, repoPath, setOverview, hasOverview]);

  const selectedFile = useMemo(
    () => (selectedFileCommitHash === normalizedHash ? (files.find((file) => file.path === selectedFilePath) ?? null) : null),
    [files, normalizedHash, selectedFileCommitHash, selectedFilePath],
  );
  const isDeletedFile = selectedFile?.status.startsWith('D') ?? false;
  const history = useCommitFileHistory(repoPath, selectedFile?.path, normalizedHash, activeTab === 'history', refreshTrigger);

  useEffect(() => {
    if (!repoPath || !selectedFile || !gitClient.isAvailable()) return;

    const generation = fileRequestGenerationRef.current;
    const isCurrent = () => fileRequestGenerationRef.current === generation;

    const fetchBlame = async () => {
      if (activeTab !== 'blame') return;

      if (isDeletedFile) {
        setBlameError(t('generated.components.commitdetails.blame_is_not_available_for_deleted_files_in_this_commit_81f42d37'));
        return;
      }

      setBlameLoading(!hasBlame);
      setBlameError(null);
      try {
        const result = await gitClient.getFileBlameRange(selectedFile.path, normalizedHash, 1, BLAME_LOOKAHEAD_COUNT, repoPath);
        if (!isCurrent()) return;
        if (result.success) {
          const page = splitBlamePage(result.data || []);
          setBlameLines(page.lines);
          setBlameHasMore(page.hasMore);
        } else {
          setBlameError(result.error || t('generated.components.commitdetails.could_not_load_blame_data_b29c2d37'));
        }
      } catch (fetchError) {
        if (!isCurrent()) return;
        console.error(fetchError);
        setBlameError(t('generated.components.commitdetails.could_not_load_blame_data_b29c2d37'));
      } finally {
        if (isCurrent()) setBlameLoading(false);
      }
    };

    fetchBlame();
  }, [activeTab, normalizedHash, isDeletedFile, repoPath, selectedFile, t, setBlameLines, setBlameHasMore, hasBlame]);

  const loadMoreBlame = async () => {
    if (!repoPath || !selectedFile || blameLoading || !blameHasMore || !gitClient.isAvailable()) return;
    const generation = fileRequestGenerationRef.current;
    const selectedPath = selectedFile.path;
    setBlameLoading(true);
    try {
      const result = await gitClient.getFileBlameRange(selectedPath, normalizedHash, blameLines.length + 1, BLAME_LOOKAHEAD_COUNT, repoPath);
      if (fileRequestGenerationRef.current !== generation) return;
      if (!result.success) {
        setBlameError(result.error);
        return;
      }
      const page = splitBlamePage(result.data);
      setBlameLines((current) => [...current, ...page.lines]);
      setBlameHasMore(page.hasMore);
    } finally {
      if (fileRequestGenerationRef.current === generation) setBlameLoading(false);
    }
  };

  const openFileDiff = useCallback(
    (path: string) => {
      if (!normalizedHash) return;
      onOpenDiff?.({
        source: 'commit',
        path,
        commitHash: normalizedHash,
        title: tr(`Commit Diff ${normalizedHash.slice(0, 8)}`, `Commit diff ${normalizedHash.slice(0, 8)}`),
      });
    },
    [normalizedHash, onOpenDiff, tr],
  );

  const selectFile = useCallback(
    (file: CommitFileDetail) => {
      pendingFileCommitRef.current = null;
      setRevealFilePath(null);
      setSelectedFilePath(file.path);
      setSelectedFileCommitHash(normalizedHash);
      openFileDiff(file.path);
    },
    [normalizedHash, openFileDiff],
  );

  const selectFileCommit = (hash: string, path = selectedFile?.path) => {
    const targetHash = extractGitObjectId(hash);
    if (!targetHash || !path || !onSelectCommit) return;
    if (targetHash === normalizedHash) {
      const file = files.find((file) => file.path === path) || files.find((file) => file.oldPath === path);
      if (file) selectFile(file);
    } else {
      pendingFileCommitRef.current = { repoPath, fromHash: normalizedHash, hash: targetHash, path };
    }
    onSelectCommit(targetHash);
  };

  useEffect(() => {
    const pending = pendingFileCommitRef.current;
    if (!pending || pending.repoPath !== repoPath || pending.hash !== normalizedHash) return;
    if (filesError) {
      pendingFileCommitRef.current = null;
      return;
    }
    if (loadingFiles || !hasOverview) return;
    pendingFileCommitRef.current = null;
    const file = files.find((file) => file.path === pending.path) || files.find((file) => file.oldPath === pending.path);
    if (file) {
      selectFile(file);
      setRevealFilePath(file.path);
    }
  }, [files, filesError, hasOverview, loadingFiles, normalizedHash, repoPath, selectFile]);

  useEffect(() => {
    if (activeDiffRequest?.source !== 'commit' || extractGitObjectId(activeDiffRequest.commitHash) !== normalizedHash) {
      restoredDiffRef.current = null;
      return;
    }
    const identity = JSON.stringify([repoPath, normalizedHash, activeDiffRequest.path]);
    if (restoredDiffRef.current === identity || loadingFiles || !hasOverview || filesError) return;
    restoredDiffRef.current = identity;
    const file = files.find((file) => file.path === activeDiffRequest.path);
    if (!file || selectedFile?.path === file.path) return;
    pendingFileCommitRef.current = null;
    setSelectedFilePath(file.path);
    setSelectedFileCommitHash(normalizedHash);
    setRevealFilePath(file.path);
  }, [activeDiffRequest, files, filesError, hasOverview, loadingFiles, normalizedHash, repoPath, selectedFile?.path]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return '-';

    const now = Date.now();
    const diffMs = now - parsed.getTime();
    const absMs = Math.abs(diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (absMs < minute) return t('generated.components.commitdetails.just_now_c80ae697');
    if (absMs < hour) return tr('vor ' + Math.max(1, Math.round(absMs / minute)) + ' Min', Math.max(1, Math.round(absMs / minute)) + ' min ago');
    if (absMs < day) return tr('vor ' + Math.max(1, Math.round(absMs / hour)) + ' Std', Math.max(1, Math.round(absMs / hour)) + ' h ago');
    const days = Math.max(1, Math.round(absMs / day));
    return tr('vor ' + days + ' Tag' + (days === 1 ? '' : 'en'), days + ' day' + (days === 1 ? '' : 's') + ' ago');
  };

  const formatBlameDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleDateString(locale, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return {
    activeTab,
    blameError,
    blameHasMore,
    blameLines,
    blameLoading: blameLoading || Boolean(selectedFile && activeTab === 'blame' && !hasBlame && !blameError && !isDeletedFile),
    commitDescription,
    files,
    filesError,
    filesSourceHint,
    formatBlameDate,
    formatDate,
    formatRelativeDate,
    historyEntries: history.entries,
    historyError: history.error,
    historyLoading: history.loading,
    historyHasMore: history.hasMore,
    loadMoreHistory: history.loadMore,
    isDeletedFile,
    isMergeCommit,
    loadMoreBlame,
    loadingFiles: loadingFiles || Boolean(normalizedHash && repoPath && !hasOverview && !filesError),
    normalizedHash,
    revealFilePath,
    selectedFile,
    selectFile,
    selectFileCommit,
    setActiveTab,
    setSelectedFileCommitHash,
    setSelectedFilePath,
  };
};
