import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitCommandNameDto } from '@/types/gitDtos';
import type { CatalogTranslateFn } from '@/i18n';
import type { GitStatusDetailed } from '@/utils/gitParsing';
import { parseGitLog } from '@/utils/gitParsing';
import type { GraphNode } from '@/utils/graphLayout';
import { gitClient } from '@/services/gitClient';
import type { ForensicSearchType } from './ForensicSearchPanel';

const FORENSIC_PATH_HISTORY_STORAGE_KEY = 'open-git-control:forensic-path-history:v1';

type UseForensicSearchParams = {
  repoPath: string | null;
  workingTreeStatus: GitStatusDetailed | null;
  t: CatalogTranslateFn;
};

export const useForensicSearch = ({ repoPath, workingTreeStatus, t }: UseForensicSearchParams) => {
  const [forensicType, setForensicType] = useState<ForensicSearchType>('string');
  const [forensicPath, setForensicPath] = useState('');
  const [forensicValue, setForensicValue] = useState('');
  const [forensicStartLine, setForensicStartLine] = useState('1');
  const [forensicEndLine, setForensicEndLine] = useState('1');
  const [forensicLoading, setForensicLoading] = useState(false);
  const [forensicError, setForensicError] = useState<string | null>(null);
  const [forensicResults, setForensicResults] = useState<GraphNode[]>([]);
  const [forensicPathHistory, setForensicPathHistory] = useState<string[]>([]);

  // Bumped on every repository change. A search started in repository A must not
  // display its results in (or persist into) repository B.
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    searchGenerationRef.current += 1;
    setForensicResults([]);
    setForensicError(null);
    setForensicLoading(false);
  }, [repoPath]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORENSIC_PATH_HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const sanitized = parsed
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 30);
      setForensicPathHistory(sanitized);
    } catch {
      // ignore malformed local storage values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FORENSIC_PATH_HISTORY_STORAGE_KEY, JSON.stringify(forensicPathHistory.slice(0, 30)));
    } catch {
      // ignore write errors
    }
  }, [forensicPathHistory]);

  const resetForensicState = useCallback(() => {
    setForensicResults([]);
    setForensicError(null);
    setForensicLoading(false);
  }, []);

  const forensicPathSuggestions = useMemo(() => {
    const query = forensicPath.trim().toLowerCase();
    const workingTreePaths = [
      ...(workingTreeStatus?.staged || []).map((entry) => entry.path),
      ...(workingTreeStatus?.unstaged || []).map((entry) => entry.path),
      ...(workingTreeStatus?.untracked || []).map((entry) => entry.path),
    ];

    const unique = Array.from(new Set([...forensicPathHistory, ...workingTreePaths].map((value) => value.trim()).filter(Boolean)));
    if (!query) {
      return unique.slice(0, 20);
    }

    const startsWith = unique.filter((value) => value.toLowerCase().startsWith(query));
    const includes = unique.filter((value) => !value.toLowerCase().startsWith(query) && value.toLowerCase().includes(query));
    return [...startsWith, ...includes].slice(0, 20);
  }, [forensicPath, forensicPathHistory, workingTreeStatus]);

  const runForensicSearch = useCallback(async () => {
    if (!repoPath || !gitClient.isAvailable()) return;
    const repoAtStart = repoPath;

    const normalizedPath = forensicPath.trim();
    if (!normalizedPath) {
      setForensicError(t('generated.components.commit_graph.useforensicsearch.please_provide_a_path_for_the_forensic_search_f6cd25dd'));
      setForensicResults([]);
      return;
    }

    setForensicPathHistory((prev) => {
      const next = [normalizedPath, ...prev.filter((entry) => entry !== normalizedPath)];
      return next.slice(0, 30);
    });

    const args: string[] = ['forensicHistory', forensicType, normalizedPath];

    if (forensicType === 'line') {
      const start = Number(forensicStartLine);
      const end = Number(forensicEndLine);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
        setForensicError(t('generated.components.commit_graph.useforensicsearch.invalid_line_range_please_check_start_end_295dd362'));
        setForensicResults([]);
        return;
      }
      args.push('line-range', String(start), String(end), '200');
    } else {
      const searchTerm = forensicValue.trim();
      if (!searchTerm) {
        setForensicError(
          forensicType === 'regex'
            ? t('generated.components.commit_graph.useforensicsearch.please_provide_a_regex_9d370edb')
            : t('generated.components.commit_graph.useforensicsearch.please_provide_a_search_string_1b25a17f'),
        );
        setForensicResults([]);
        return;
      }
      args.push(searchTerm, '0', '0', '200');
    }

    const generation = searchGenerationRef.current;
    const isCurrent = () => searchGenerationRef.current === generation;

    setForensicLoading(true);
    setForensicError(null);

    try {
      const { success, data, error } = await gitClient.runGitCommandForRepo(repoAtStart, args[0] as GitCommandNameDto, ...args.slice(1));
      if (!isCurrent()) return;
      if (!success) {
        const message = String(error || t('generated.components.commit_graph.useforensicsearch.forensic_search_failed_e97e5ca2'));
        const invalidPattern = /invalid|regex|regular expression|fatal/i.test(message);
        setForensicError(
          invalidPattern ? t('generated.components.commit_graph.useforensicsearch.invalid_regex_pattern_please_fix_the_expression_1ce435a7') : message,
        );
        setForensicResults([]);
        return;
      }

      const commits = parseGitLog(String(data || ''));
      const nodes = commits.map((commit) => ({ commit, lane: 0, row: 0, color: 'var(--accent-primary)', isMerge: commit.parentHashes.length > 1 }));
      setForensicResults(nodes);
      if (commits.length === 0) {
        setForensicError(t('generated.components.commit_graph.useforensicsearch.no_matches_found_f24033f1'));
      }
    } catch (error: unknown) {
      if (!isCurrent()) return;
      setForensicResults([]);
      setForensicError(error instanceof Error ? error.message : t('generated.components.commit_graph.useforensicsearch.forensic_search_failed_e97e5ca2'));
    } finally {
      if (isCurrent()) setForensicLoading(false);
    }
  }, [forensicEndLine, forensicPath, forensicStartLine, forensicType, forensicValue, repoPath, t]);

  return {
    forensicType,
    setForensicType,
    forensicPath,
    setForensicPath,
    forensicValue,
    setForensicValue,
    forensicStartLine,
    setForensicStartLine,
    forensicEndLine,
    setForensicEndLine,
    forensicLoading,
    forensicError,
    setForensicError,
    forensicResults,
    forensicPathSuggestions,
    runForensicSearch,
    resetForensicState,
  };
};
