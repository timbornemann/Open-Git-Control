import { useBlamePreview } from '@/data/useBlamePreview';
import { useResourceState } from '@/data/resourceHooks';
import { loadCommitOverview, EMPTY_COMMIT_OVERVIEW } from '@/data/commitDetails';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import type { GitFileHistoryEntryDto } from '@/types/git';
import { useI18n } from '@/i18n';
import { extractGitObjectId } from '@/utils/gitObjectId';
import { gitClient } from '@/services/gitClient';
import { BLAME_LOOKAHEAD_COUNT, splitBlamePage } from '../file-details/blamePagination';

export type DetailsTab = 'history' | 'blame' | 'patch';

type Params = {
  repoPath: string | null;
  hash: string;
  onOpenDiff?: (request: DiffRequest) => void;
};

export const fileNameFromPath = (filePath: string): string => filePath.split(/[\\/]/).pop() || filePath;

export const extractCommitDescription = (message: string): string => {
  const lines = String(message || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const bodyLines = lines.slice(1);
  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();
  return bodyLines.join('\n');
};

export const useCommitDetailsData = ({ repoPath, hash, onOpenDiff }: Params) => {
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
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries, hasHistory] = useResourceState<GitFileHistoryEntryDto[]>(
    'git',
    'getFileHistory',
    [selectedFilePath, normalizedHash, 80, repoPath],
    [],
  );

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

  useLayoutEffect(() => {
    requestGenerationRef.current += 1;
    setLoadingFiles(false);
    setFilesError(null);
    setSelectedFilePath(null);
    setSelectedFileCommitHash(null);
    setActiveTab('history');
    setHistoryError(null);
    setBlameError(null);
  }, [normalizedHash, repoPath]);

  useLayoutEffect(() => {
    fileRequestGenerationRef.current += 1;
    setHistoryLoading(false);
    setHistoryError(null);
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

  useEffect(() => {
    if (!repoPath || !selectedFile || !gitClient.isAvailable()) return;

    const generation = fileRequestGenerationRef.current;
    const isCurrent = () => fileRequestGenerationRef.current === generation;

    const fetchHistory = async () => {
      if (activeTab !== 'history') return;

      setHistoryLoading(!hasHistory);
      setHistoryError(null);
      try {
        const result = await gitClient.getFileHistory(selectedFile.path, normalizedHash, 80, repoPath);
        if (!isCurrent()) return;
        if (result.success) {
          setHistoryEntries(result.data || []);
        } else {
          setHistoryError(result.error || t('generated.components.commitdetails.could_not_load_file_history_4fb3f0d4'));
        }
      } catch (fetchError) {
        if (!isCurrent()) return;
        console.error(fetchError);
        setHistoryError(t('generated.components.commitdetails.could_not_load_file_history_4fb3f0d4'));
      } finally {
        if (isCurrent()) setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [activeTab, normalizedHash, repoPath, selectedFile, t, setHistoryEntries, hasHistory]);

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

  useEffect(() => {
    if (!selectedFile || activeTab !== 'patch' || !normalizedHash) return;

    onOpenDiff?.({
      source: 'commit',
      path: selectedFile.path,
      commitHash: normalizedHash,
      title: tr(`Commit Diff ${normalizedHash.slice(0, 8)}`, `Commit diff ${normalizedHash.slice(0, 8)}`),
    });
  }, [activeTab, normalizedHash, onOpenDiff, selectedFile, tr]);

  const openSelectedFileDiff = () => {
    if (!selectedFile || !normalizedHash) return;
    onOpenDiff?.({
      source: 'commit',
      path: selectedFile.path,
      commitHash: normalizedHash,
      title: tr(`Commit Diff ${normalizedHash.slice(0, 8)}`, `Commit diff ${normalizedHash.slice(0, 8)}`),
    });
  };

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
    historyEntries,
    historyError,
    historyLoading: historyLoading || Boolean(selectedFile && activeTab === 'history' && !hasHistory && !historyError),
    isDeletedFile,
    isMergeCommit,
    loadMoreBlame,
    loadingFiles: loadingFiles || Boolean(normalizedHash && repoPath && !hasOverview && !filesError),
    normalizedHash,
    openSelectedFileDiff,
    selectedFile,
    setActiveTab,
    setSelectedFileCommitHash,
    setSelectedFilePath,
  };
};
