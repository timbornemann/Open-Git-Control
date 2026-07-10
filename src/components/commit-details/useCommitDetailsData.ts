import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from '@/types/git';
import { useI18n } from '@/i18n';
import type { CommitFileDetail } from '@/utils/gitParsing';
import { parseCommitDetails } from '@/utils/gitParsing';
import { extractGitObjectId } from '@/utils/gitObjectId';
import { gitClient } from '@/services/gitClient';
import { BLAME_LOOKAHEAD_COUNT, splitBlamePage } from '../file-details/blamePagination';

export type DetailsTab = 'history' | 'blame' | 'patch';

type Params = {
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

export const useCommitDetailsData = ({ hash, onOpenDiff }: Params) => {
  const { t, tr, locale } = useI18n();

  const normalizedHash = useMemo(() => {
    return extractGitObjectId(hash) || '';
  }, [hash]);

  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesSourceHint, setFilesSourceHint] = useState<string | null>(null);
  const [isMergeCommit, setIsMergeCommit] = useState(false);
  const [files, setFiles] = useState<CommitFileDetail[]>([]);
  const [commitDescription, setCommitDescription] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileCommitHash, setSelectedFileCommitHash] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailsTab>('history');

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<GitFileHistoryEntryDto[]>([]);

  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
  const [blameLines, setBlameLines] = useState<GitFileBlameLineDto[]>([]);
  const [blameHasMore, setBlameHasMore] = useState(false);

  // Bumped whenever the inspected commit changes. Every async fetch captures the
  // current value and refuses to write state once it is stale, so a late
  // response for one commit can never leak its files/description/blame into the
  // view of a different commit.
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setSelectedFilePath(null);
    setSelectedFileCommitHash(null);
    setActiveTab('history');
    setHistoryEntries([]);
    setBlameLines([]);
    setBlameHasMore(false);
    setHistoryError(null);
    setBlameError(null);
  }, [normalizedHash]);

  useEffect(() => {
    if (!normalizedHash || !gitClient.isAvailable()) return;

    const generation = requestGenerationRef.current;
    const isCurrent = () => requestGenerationRef.current === generation;

    const fetchDetails = async () => {
      setLoadingFiles(true);
      setFilesError(null);
      setFilesSourceHint(null);
      setIsMergeCommit(false);
      setCommitDescription('');

      try {
        const parentsResult = await gitClient.runGitCommand('show', '-s', '--format=%P', normalizedHash);
        if (!isCurrent()) return;
        const parents = parentsResult.success
          ? String(parentsResult.data || '')
              .trim()
              .split(/\s+/)
              .filter(Boolean)
          : [];
        const mergeCommit = parents.length > 1;
        setIsMergeCommit(mergeCommit);

        const messageResult = await gitClient.runGitCommand('show', '-s', '--format=%B', normalizedHash);
        if (!isCurrent()) return;
        if (messageResult.success) {
          setCommitDescription(extractCommitDescription(String(messageResult.data || '')));
        }

        const detailResult = await gitClient.runGitCommand('commitDetails', normalizedHash);
        if (!isCurrent()) return;
        if (!detailResult.success) {
          setFiles([]);
          setFilesError(detailResult.error || t('generated.components.commitdetails.could_not_load_commit_details_cf1a30a2'));
          return;
        }

        const directFiles = parseCommitDetails(String(detailResult.data || ''));
        if (directFiles.length > 0) {
          setFiles(directFiles);
          return;
        }

        if (mergeCommit) {
          const mergeRangeResult = await gitClient.runGitCommand('diff', '--name-status', `${normalizedHash}^1`, normalizedHash);
          if (!isCurrent()) return;
          if (mergeRangeResult.success) {
            const mergedBranchFiles = parseCommitDetails(String(mergeRangeResult.data || ''));
            if (mergedBranchFiles.length > 0) {
              setFiles(mergedBranchFiles);
              setFilesSourceHint(t('generated.components.commitdetails.files_show_the_effective_changes_from_the_merged_branch_bd7570a6'));
              return;
            }
          }
        }

        setFiles([]);
      } catch (fetchError) {
        if (!isCurrent()) return;
        console.error(fetchError);
        setFiles([]);
        setFilesError(t('generated.components.commitdetails.could_not_load_commit_details_cf1a30a2'));
      } finally {
        if (isCurrent()) setLoadingFiles(false);
      }
    };

    fetchDetails();
  }, [normalizedHash, t]);

  const selectedFile = useMemo(
    () => (selectedFileCommitHash === normalizedHash ? (files.find((file) => file.path === selectedFilePath) ?? null) : null),
    [files, normalizedHash, selectedFileCommitHash, selectedFilePath],
  );
  const isDeletedFile = selectedFile?.status.startsWith('D') ?? false;

  useEffect(() => {
    if (!selectedFile || !gitClient.isAvailable()) return;

    const generation = requestGenerationRef.current;
    const isCurrent = () => requestGenerationRef.current === generation;

    const fetchHistory = async () => {
      if (activeTab !== 'history') return;

      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await gitClient.getFileHistory(selectedFile.path, normalizedHash, 80);
        if (!isCurrent()) return;
        if (result.success) {
          setHistoryEntries(result.data || []);
        } else {
          setHistoryEntries([]);
          setHistoryError(result.error || t('generated.components.commitdetails.could_not_load_file_history_4fb3f0d4'));
        }
      } catch (fetchError) {
        if (!isCurrent()) return;
        console.error(fetchError);
        setHistoryEntries([]);
        setHistoryError(t('generated.components.commitdetails.could_not_load_file_history_4fb3f0d4'));
      } finally {
        if (isCurrent()) setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [activeTab, normalizedHash, selectedFile, t]);

  useEffect(() => {
    if (!selectedFile || !gitClient.isAvailable()) return;

    const generation = requestGenerationRef.current;
    const isCurrent = () => requestGenerationRef.current === generation;

    const fetchBlame = async () => {
      if (activeTab !== 'blame') return;

      if (isDeletedFile) {
        setBlameLines([]);
        setBlameError(t('generated.components.commitdetails.blame_is_not_available_for_deleted_files_in_this_commit_81f42d37'));
        return;
      }

      setBlameLoading(true);
      setBlameError(null);
      try {
        const result = await gitClient.getFileBlameRange(selectedFile.path, normalizedHash, 1, BLAME_LOOKAHEAD_COUNT);
        if (!isCurrent()) return;
        if (result.success) {
          const page = splitBlamePage(result.data || []);
          setBlameLines(page.lines);
          setBlameHasMore(page.hasMore);
        } else {
          setBlameLines([]);
          setBlameError(result.error || t('generated.components.commitdetails.could_not_load_blame_data_b29c2d37'));
        }
      } catch (fetchError) {
        if (!isCurrent()) return;
        console.error(fetchError);
        setBlameLines([]);
        setBlameError(t('generated.components.commitdetails.could_not_load_blame_data_b29c2d37'));
      } finally {
        if (isCurrent()) setBlameLoading(false);
      }
    };

    fetchBlame();
  }, [activeTab, normalizedHash, isDeletedFile, selectedFile, t]);

  const loadMoreBlame = async () => {
    if (!selectedFile || blameLoading || !blameHasMore || !gitClient.isAvailable()) return;
    const generation = requestGenerationRef.current;
    setBlameLoading(true);
    try {
      const result = await gitClient.getFileBlameRange(selectedFile.path, normalizedHash, blameLines.length + 1, BLAME_LOOKAHEAD_COUNT);
      if (requestGenerationRef.current !== generation) return;
      if (!result.success) {
        setBlameError(result.error);
        return;
      }
      const page = splitBlamePage(result.data);
      setBlameLines((current) => [...current, ...page.lines]);
      setBlameHasMore(page.hasMore);
    } finally {
      if (requestGenerationRef.current === generation) setBlameLoading(false);
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
    blameLoading,
    commitDescription,
    files,
    filesError,
    filesSourceHint,
    formatBlameDate,
    formatDate,
    formatRelativeDate,
    historyEntries,
    historyError,
    historyLoading,
    isDeletedFile,
    isMergeCommit,
    loadMoreBlame,
    loadingFiles,
    normalizedHash,
    openSelectedFileDiff,
    selectedFile,
    setActiveTab,
    setSelectedFileCommitHash,
    setSelectedFilePath,
  };
};
