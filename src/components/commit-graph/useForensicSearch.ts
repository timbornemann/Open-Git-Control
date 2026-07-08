import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GitCommandNameDto } from '../../global';
import type { GitStatusDetailed } from '../../utils/gitParsing';
import { parseGitLog } from '../../utils/gitParsing';
import type { GraphNode } from '../../utils/graphLayout';
import { gitClient } from '../../services/gitClient';
import type { ForensicSearchType } from './ForensicSearchPanel';

const FORENSIC_PATH_HISTORY_STORAGE_KEY = 'open-git-control:forensic-path-history:v1';

type UseForensicSearchParams = {
  repoPath: string | null;
  workingTreeStatus: GitStatusDetailed | null;
  tr: (deText: string, enText: string) => string;
};

export const useForensicSearch = ({
  repoPath,
  workingTreeStatus,
  tr,
}: UseForensicSearchParams) => {
  const [forensicType, setForensicType] = useState<ForensicSearchType>('string');
  const [forensicPath, setForensicPath] = useState('');
  const [forensicValue, setForensicValue] = useState('');
  const [forensicStartLine, setForensicStartLine] = useState('1');
  const [forensicEndLine, setForensicEndLine] = useState('1');
  const [forensicLoading, setForensicLoading] = useState(false);
  const [forensicError, setForensicError] = useState<string | null>(null);
  const [forensicResults, setForensicResults] = useState<GraphNode[]>([]);
  const [forensicPathHistory, setForensicPathHistory] = useState<string[]>([]);

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
      localStorage.setItem(
        FORENSIC_PATH_HISTORY_STORAGE_KEY,
        JSON.stringify(forensicPathHistory.slice(0, 30)),
      );
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

    const normalizedPath = forensicPath.trim();
    if (!normalizedPath) {
      setForensicError(tr('Bitte einen Pfad fuer die forensische Suche angeben.', 'Please provide a path for the forensic search.'));
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
        setForensicError(tr('Ungueltiger Zeilenbereich. Bitte Start/Ende pruefen.', 'Invalid line range. Please check start/end.'));
        setForensicResults([]);
        return;
      }
      args.push('line-range', String(start), String(end), '200');
    } else {
      const searchTerm = forensicValue.trim();
      if (!searchTerm) {
        setForensicError(forensicType === 'regex' ? tr('Bitte Regex angeben.', 'Please provide a regex.') : tr('Bitte Suchstring angeben.', 'Please provide a search string.'));
        setForensicResults([]);
        return;
      }
      args.push(searchTerm, '0', '0', '200');
    }

    setForensicLoading(true);
    setForensicError(null);

    try {
      const { success, data, error } = await gitClient.runGitCommand(args[0] as GitCommandNameDto, ...args.slice(1));
      if (!success) {
        const message = String(error || tr('Forensische Suche fehlgeschlagen.', 'Forensic search failed.'));
        const invalidPattern = /invalid|regex|regular expression|fatal/i.test(message);
        setForensicError(invalidPattern ? tr('Ungueltiges Regex-Muster. Bitte Ausdruck korrigieren.', 'Invalid regex pattern. Please fix the expression.') : message);
        setForensicResults([]);
        return;
      }

      const commits = parseGitLog(String(data || ''));
      const nodes = commits.map(commit => ({ commit, lane: 0, row: 0, color: 'var(--accent-primary)', isMerge: commit.parentHashes.length > 1 }));
      setForensicResults(nodes);
      if (commits.length === 0) {
        setForensicError(tr('Keine Treffer gefunden.', 'No matches found.'));
      }
    } catch (error: unknown) {
      setForensicResults([]);
      setForensicError(error instanceof Error ? error.message : tr('Forensische Suche fehlgeschlagen.', 'Forensic search failed.'));
    } finally {
      setForensicLoading(false);
    }
  }, [forensicEndLine, forensicPath, forensicStartLine, forensicType, forensicValue, repoPath, tr]);

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
