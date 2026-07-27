import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CaseSensitive, File, FileSearch, Replace, ReplaceAll, Search } from 'lucide-react';
import { useUIContext } from '@/contexts/AppStateContext';
import { useAppToastSetter } from '@/hooks/useAppToast';
import { gitClient } from '@/services/gitClient';
import type {
  WorkingDirectorySearchFileDto,
  WorkingDirectorySearchMatchDto,
  WorkingDirectorySearchModeDto,
  WorkingDirectorySearchResultDto,
} from '@/shared/ipc/contracts/git';
import { confirmWorkingDirectoryNavigation } from './workingDirectoryNavigationGuard';
import '@/styles/working-directory-search.css';

type Props = {
  repoPath: string;
  onOpenFile: (path: string) => void;
  onFilesChanged: (paths: string[]) => Promise<void>;
  activeFilePath?: string | null;
};

const EMPTY_RESULT: WorkingDirectorySearchResultDto = {
  files: [],
  totalMatches: 0,
  scannedFiles: 0,
  truncated: false,
};

const HighlightedPreview: React.FC<{ match: WorkingDirectorySearchMatchDto }> = ({ match }) => {
  const matchEnd = match.previewMatchStart + match.matchLength;
  return (
    <span className="working-search-match__preview">
      {match.preview.slice(0, match.previewMatchStart)}
      <mark>{match.preview.slice(match.previewMatchStart, matchEnd)}</mark>
      {match.preview.slice(matchEnd)}
    </span>
  );
};

export const WorkingDirectorySearchPanel: React.FC<Props> = ({ repoPath, onOpenFile, onFilesChanged, activeFilePath = null }) => {
  const { setConfirmDialog } = useUIContext();
  const setToast = useAppToastSetter();
  const [mode, setMode] = useState<WorkingDirectorySearchModeDto>('filename');
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState<WorkingDirectorySearchResultDto>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const executeSearch = useCallback(
    async (searchQuery: string, searchMode: WorkingDirectorySearchModeDto, matchCase: boolean) => {
      const sequence = ++requestSequence.current;
      if (!searchQuery) {
        setResult(EMPTY_RESULT);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await gitClient.searchWorkingDirectory({ query: searchQuery, mode: searchMode, caseSensitive: matchCase }, repoPath);
        if (sequence !== requestSequence.current) return;
        if (!response.success) {
          setResult(EMPTY_RESULT);
          setError(response.error || 'Could not search the working directory.');
          return;
        }
        setResult(response.data || EMPTY_RESULT);
      } catch (searchError: unknown) {
        if (sequence !== requestSequence.current) return;
        setResult(EMPTY_RESULT);
        setError(searchError instanceof Error ? searchError.message : 'Could not search the working directory.');
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [repoPath],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void executeSearch(query, mode, caseSensitive), 250);
    return () => window.clearTimeout(timer);
  }, [caseSensitive, executeSearch, mode, query]);

  useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );

  const replace = useCallback(
    async (target?: { path: string; line: number; column: number }) => {
      if (!query || replacing) return;
      setReplacing(true);
      try {
        if (
          activeFilePath &&
          (!target || target.path === activeFilePath) &&
          !(await confirmWorkingDirectoryNavigation({
            kind: 'view',
            label: target ? `replace a result in "${target.path}"` : 'replace all search results',
          }))
        ) {
          return;
        }
        const response = await gitClient.replaceWorkingDirectory(
          {
            query,
            replacement,
            caseSensitive,
            ...(target ? { target } : { all: true }),
          },
          repoPath,
        );
        if (!response.success || !response.data) {
          setToast({ msg: response.error || 'Could not replace the search results.', isError: true });
          return;
        }
        if (response.data.paths.length > 0) await onFilesChanged(response.data.paths);
        const label = response.data.replacements === 1 ? '1 occurrence replaced.' : `${response.data.replacements} occurrences replaced.`;
        setToast({ msg: label, isError: false });
        await executeSearch(query, mode, caseSensitive);
      } catch (replaceError: unknown) {
        setToast({
          msg: replaceError instanceof Error ? replaceError.message : 'Could not replace the search results.',
          isError: true,
        });
      } finally {
        setReplacing(false);
      }
    },
    [activeFilePath, caseSensitive, executeSearch, mode, onFilesChanged, query, replacement, replacing, repoPath, setToast],
  );

  const confirmReplaceAll = () => {
    if (!query || result.totalMatches === 0 || replacing) return;
    setConfirmDialog({
      variant: 'danger',
      title: 'Replace all occurrences?',
      message: `Replace every occurrence of "${query}" in the working directory?`,
      contextItems: [
        { label: 'Occurrences', value: String(result.totalMatches) },
        { label: 'Files shown', value: String(result.files.length) },
      ],
      irreversible: false,
      consequences: 'Matching files will be changed on disk. Git can be used to review or restore tracked changes.',
      confirmLabel: 'Replace all',
      onConfirm: () => replace(),
    });
  };

  const renderFileNameResult = (fileResult: WorkingDirectorySearchFileDto) => (
    <button type="button" className="working-search-file-result" key={fileResult.path} onClick={() => onOpenFile(fileResult.path)} title={fileResult.path}>
      <File size={14} />
      <span>
        <strong>{fileResult.name}</strong>
        {fileResult.path !== fileResult.name && <small>{fileResult.path}</small>}
      </span>
    </button>
  );

  const renderContentResult = (fileResult: WorkingDirectorySearchFileDto) => (
    <section className="working-search-result-group" key={fileResult.path}>
      <button type="button" className="working-search-result-group__file" onClick={() => onOpenFile(fileResult.path)} title={fileResult.path}>
        <File size={14} />
        <strong>{fileResult.path}</strong>
        <span>{fileResult.matches.length}</span>
      </button>
      {fileResult.matches.map((match) => (
        <div className="working-search-match" key={`${match.line}:${match.column}`}>
          <button type="button" className="working-search-match__open" onClick={() => onOpenFile(fileResult.path)}>
            <span className="working-search-match__location">
              {match.line}:{match.column}
            </span>
            <HighlightedPreview match={match} />
          </button>
          <button
            type="button"
            className="working-search-match__replace"
            aria-label={`Replace match in ${fileResult.path} at line ${match.line}`}
            title="Replace this occurrence"
            disabled={replacing}
            onClick={() => void replace({ path: fileResult.path, line: match.line, column: match.column })}
          >
            <Replace size={13} />
          </button>
        </div>
      ))}
    </section>
  );

  return (
    <div className="working-search">
      <div className="working-search__modes" role="tablist" aria-label="Search mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'filename'}
          className={mode === 'filename' ? 'working-search__mode working-search__mode--active' : 'working-search__mode'}
          onClick={() => setMode('filename')}
        >
          <Search size={14} />
          File names
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'content'}
          className={mode === 'content' ? 'working-search__mode working-search__mode--active' : 'working-search__mode'}
          onClick={() => setMode('content')}
        >
          <FileSearch size={14} />
          File contents
        </button>
      </div>
      <div className="working-search__query-row">
        <Search className="working-search__field-icon" size={14} />
        <input
          autoFocus
          className="working-search__input"
          value={query}
          maxLength={1_000}
          placeholder={mode === 'filename' ? 'Search file names…' : 'Search file contents…'}
          aria-label={mode === 'filename' ? 'Search file names' : 'Search file contents'}
          onChange={(event) => setQuery(event.target.value.replace(/[\r\n]/g, ''))}
        />
        <button
          type="button"
          className={caseSensitive ? 'working-search__case working-search__case--active' : 'working-search__case'}
          aria-pressed={caseSensitive}
          aria-label="Match case"
          title="Match case"
          onClick={() => setCaseSensitive((current) => !current)}
        >
          <CaseSensitive size={15} />
        </button>
      </div>
      {mode === 'content' && (
        <div className="working-search__replace-row">
          <Replace className="working-search__field-icon" size={14} />
          <input
            className="working-search__input"
            value={replacement}
            maxLength={100_000}
            placeholder="Replace with…"
            aria-label="Replacement text"
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button
            type="button"
            className="working-search__replace-all"
            disabled={!query || result.totalMatches === 0 || replacing || loading}
            onClick={confirmReplaceAll}
            title="Replace all occurrences"
          >
            <ReplaceAll size={14} />
            <span>All</span>
          </button>
        </div>
      )}
      <div className="working-search__summary" aria-live="polite">
        {loading
          ? 'Searching…'
          : query
            ? `${result.totalMatches} ${mode === 'filename' ? (result.totalMatches === 1 ? 'file' : 'files') : result.totalMatches === 1 ? 'match' : 'matches'}`
            : mode === 'filename'
              ? 'Enter a file name.'
              : 'Enter text to search in repository files.'}
        {!loading && query && mode === 'content' && ` in ${result.files.length} ${result.files.length === 1 ? 'file' : 'files'}`}
      </div>
      {error && <div className="working-search__error">{error}</div>}
      {!error && result.truncated && (
        <div className="working-search__notice">Only the first matching result lines are shown. Replace all still scans the complete file list.</div>
      )}
      {!loading && !error && query && result.totalMatches === 0 && <div className="working-search__empty">No matches found.</div>}
      <div className="working-search__results">{mode === 'filename' ? result.files.map(renderFileNameResult) : result.files.map(renderContentResult)}</div>
    </div>
  );
};
