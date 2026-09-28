import { isDataLoading, previewTextState, readCachedFilePreview } from './workingDirectoryPreviewState';
import { useBlamePreview } from '@/data/useBlamePreview';
import { viewModules } from '@/data/viewModules';
import { useResourceState } from '@/data/resourceHooks';
import type { WorkingDirectoryPreviewDto, TextFileEncodingDto } from '@/shared/ipc/contracts/git';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { gitClient } from '@/services/gitClient';
import { useUIContext } from '@/contexts/AppStateContext';
import { useAppToast } from '@/hooks/useAppToast';
import { isHtmlFilePath } from '@/utils/htmlPreview';
import { isMarkdownFilePath } from '@/utils/markdownPreview';
import { applyLineEnding, detectLineEnding, normalizeToLf, type LineEnding } from '@/utils/lineEndings';
import { BlamePanel } from '@/components/file-details/BlamePanel';
import { FileHistoryPanel } from '@/components/file-details/FileHistoryPanel';
import { BLAME_LOOKAHEAD_COUNT, splitBlamePage } from '@/components/file-details/blamePagination';
import type { GitFileHistoryEntryDto } from '@/types/git';
import { useI18n } from '@/i18n';
import { MarkdownPreviewPane } from '@/components/diff-viewer/MarkdownPreviewPane';
import { useMarkdownPreview } from '@/components/diff-viewer/useMarkdownPreview';
import { HtmlPreviewPane } from './HtmlPreviewPane';
import { useHtmlPreview } from './useHtmlPreview';
import { CsvTableEditor } from './CsvTableEditor';
import { isCsvFilePath } from './fileContentTransforms';
import { WorkingDirectoryFileTools } from './WorkingDirectoryFileTools';
import { getEncodedTextByteLength, WorkingDirectoryFileStatusBar } from './WorkingDirectoryFileStatusBar';
import type { TextSelection } from './textContentTransforms';
import type { WorkingDirectoryNavigationGuard, WorkingDirectoryNavigationTarget } from './workingDirectoryNavigationGuard';
import '@/styles/working-directory-file-viewer.css';
import '@/styles/diff-viewer.css';

const WorkingDirectoryCodeEditor = viewModules.editor.View;

type Props = {
  repoPath: string;
  path: string;
  onClose: () => void;
  onRepoChanged: () => void;
  onCloseRequestChange: (request: (() => void) | null) => void;
  onNavigationGuardChange: (guard: WorkingDirectoryNavigationGuard | null) => void;
};
type Tab = 'content' | 'table' | 'preview' | 'history' | 'blame';
type FilePreviewKind = 'html' | 'markdown' | 'none';

const getFilePreviewKind = (preview: { kind?: string } | null, tab: Tab, isMarkdown: boolean, isHtml: boolean): FilePreviewKind => {
  if (preview?.kind !== 'text' || tab !== 'preview') return 'none';
  if (isMarkdown) return 'markdown';
  return isHtml ? 'html' : 'none';
};

const supportsFilePreview = (isMarkdown: boolean, isHtml: boolean): boolean => isMarkdown || isHtml;

const WorkingDirectoryViewerTabs: React.FC<{
  tab: Tab;
  isCsv: boolean;
  supportsPreview: boolean;
  tr: (german: string, english: string) => string;
  onTabChange: (tab: Tab) => void;
}> = ({ tab, isCsv, supportsPreview, tr, onTabChange }) => (
  <>
    <button className={`working-file-viewer__button${tab === 'content' ? ' is-active' : ''}`} onClick={() => onTabChange('content')}>
      Text
    </button>
    {isCsv && (
      <button className={`working-file-viewer__button${tab === 'table' ? ' is-active' : ''}`} onClick={() => onTabChange('table')}>
        {tr('Tabelle', 'Table')}
      </button>
    )}
    {supportsPreview && (
      <button className={`working-file-viewer__button${tab === 'preview' ? ' is-active' : ''}`} onClick={() => onTabChange('preview')}>
        Preview
      </button>
    )}
    <button className={`working-file-viewer__button${tab === 'history' ? ' is-active' : ''}`} onClick={() => onTabChange('history')}>
      History
    </button>
    <button className={`working-file-viewer__button${tab === 'blame' ? ' is-active' : ''}`} onClick={() => onTabChange('blame')}>
      Blame
    </button>
  </>
);

const WorkingDirectoryCsvView: React.FC<{
  preview: { kind?: string } | null;
  tab: Tab;
  isCsv: boolean;
  text: string;
  onChange: (text: string) => void;
}> = ({ preview, tab, isCsv, text, onChange }) => {
  if (preview?.kind !== 'text' || tab !== 'table' || !isCsv) return null;
  return <CsvTableEditor value={text} onChange={onChange} />;
};

const getNavigationDestination = (target: WorkingDirectoryNavigationTarget): string => {
  if (target.kind === 'file') return `"${target.path}"`;
  if (target.kind === 'repository') return `repository "${target.path}"`;
  return `the ${target.label} view`;
};

export const WorkingDirectoryFileViewer: React.FC<Props> = ({ repoPath, path, onClose, onRepoChanged, onCloseRequestChange, onNavigationGuardChange }) => {
  const { t, tr } = useI18n();
  const showToast = useAppToast();
  const { setConfirmDialog } = useUIContext();
  const requestCloseRef = useRef<() => void>(() => onClose());
  const navigationGuardRef = useRef<WorkingDirectoryNavigationGuard | null>(null);
  const activeFileKeyRef = useRef('');
  const getCachedPreview = useCallback(() => readCachedFilePreview(repoPath, path), [repoPath, path]);
  const initialPreview = getCachedPreview();
  const { text: initialText, encoding: initialEncoding, lineEnding: initialLineEnding } = previewTextState(initialPreview);
  const [preview, setPreview] = useState<WorkingDirectoryPreviewDto | null>(initialPreview);
  const [text, setText] = useState(initialText);
  const [savedText, setSavedText] = useState(initialText);
  const [encoding, setEncoding] = useState<TextFileEncodingDto>(initialEncoding);
  const [savedEncoding, setSavedEncoding] = useState<TextFileEncodingDto>(initialEncoding);
  const [lineEnding, setLineEnding] = useState<LineEnding>(initialLineEnding);
  const [savedLineEnding, setSavedLineEnding] = useState<LineEnding>(initialLineEnding);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [selection, setSelection] = useState<TextSelection>({ from: 0, to: 0 });
  const [tab, setTab] = useState<Tab>('content');
  const [history, setHistory, hasHistory] = useResourceState<GitFileHistoryEntryDto[]>('git', 'getFileHistory', [path, undefined, 80, repoPath], []);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const {
    lines: blame,
    setLines: setBlame,
    hasMore: blameHasMore,
    setHasMore: setBlameHasMore,
    hasData: hasBlame,
  } = useBlamePreview(repoPath, path, undefined, 'unstaged');
  const [blameError, setBlameError] = useState<string | null>(null);
  const [isBlameLoading, setIsBlameLoading] = useState(false);
  const blameRequestGenerationRef = useRef(0);
  const activeBlameRequestRef = useRef<{ id: number; generation: number } | null>(null);
  const nextBlameRequestIdRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialPreview);
  const dirtyRef = useRef(false);
  const [isLargeImageLoading, setIsLargeImageLoading] = useState(false);
  const dirty = text !== savedText || encoding !== savedEncoding || lineEnding !== savedLineEnding;
  dirtyRef.current = dirty;
  const isMarkdown = isMarkdownFilePath(path);
  const isHtml = isHtmlFilePath(path);
  const isCsv = isCsvFilePath(path);
  const filePreviewKind = getFilePreviewKind(preview, tab, isMarkdown, isHtml);
  const supportsPreview = supportsFilePreview(isMarkdown, isHtml);
  const markdownRequest = useMemo(() => ({ source: 'unstaged' as const, path, title: path }), [path]);
  const { markdownPreview, handleMarkdownPreviewClick } = useMarkdownPreview({
    repoPath,
    request: markdownRequest,
    isActive: filePreviewKind === 'markdown',
    t,
    markdownText: preview?.kind === 'text' ? text : undefined,
  });
  const htmlPreview = useHtmlPreview({ repoPath, path, html: text, isActive: filePreviewKind === 'html' });
  useLayoutEffect(() => {
    let active = true;
    activeFileKeyRef.current = `${repoPath}\0${path}`;
    const cached = getCachedPreview();
    setPreview(cached);
    setLoadError(null);
    setTab('content');
    const { text: cachedText, encoding: cachedEncoding, lineEnding: cachedLineEnding } = previewTextState(cached);
    setText(cachedText);
    setSavedText(cachedText);
    setEncoding(cachedEncoding);
    setSavedEncoding(cachedEncoding);
    setLineEnding(cachedLineEnding);
    setSavedLineEnding(cachedLineEnding);
    setShowWhitespace(false);
    setSelection({ from: 0, to: 0 });
    setHistoryError(null);
    setIsHistoryLoading(false);
    setBlameError(null);
    setIsBlameLoading(false);
    blameRequestGenerationRef.current += 1;
    activeBlameRequestRef.current = null;
    setIsLoading(!cached);
    setIsLargeImageLoading(false);
    void gitClient.getWorkingDirectoryPreview(path, repoPath).then((result) => {
      if (!active) return;
      if (!result.success) {
        setLoadError(result.error || 'Could not open file.');
        setIsLoading(false);
        return;
      }
      if (dirtyRef.current) {
        setIsLoading(false);
        return;
      }
      setPreview(result.data);
      if (result.data.kind === 'text') {
        const detectedLineEnding = detectLineEnding(result.data.text);
        const detectedEncoding = result.data.encoding || 'utf8';
        const normalized = normalizeToLf(result.data.text);
        setText(normalized);
        setSavedText(normalized);
        setEncoding(detectedEncoding);
        setSavedEncoding(detectedEncoding);
        setLineEnding(detectedLineEnding);
        setSavedLineEnding(detectedLineEnding);
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [path, repoPath, getCachedPreview]);
  const loadLargeImage = useCallback(async () => {
    const fileKey = `${repoPath}\0${path}`;
    setIsLargeImageLoading(true);
    setLoadError(null);
    try {
      const result = await gitClient.getWorkingDirectoryPreview(path, repoPath, true);
      if (activeFileKeyRef.current !== fileKey) return;
      if (!result.success) {
        setLoadError(result.error || 'Could not load image.');
        return;
      }
      setPreview(result.data);
    } catch (imageLoadError: unknown) {
      if (activeFileKeyRef.current === fileKey) setLoadError(imageLoadError instanceof Error ? imageLoadError.message : 'Could not load image.');
    } finally {
      if (activeFileKeyRef.current === fileKey) setIsLargeImageLoading(false);
    }
  }, [path, repoPath]);
  useEffect(() => {
    if (tab !== 'history') return;
    let active = true;
    setIsHistoryLoading(!hasHistory);
    setHistoryError(null);
    void gitClient
      .getFileHistory(path, undefined, 80, repoPath)
      .then((result) => {
        if (!active) return;
        if (result.success) setHistory(result.data || []);
        else {
          setHistoryError(result.error || 'Could not load file history.');
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setHistoryError(loadError instanceof Error ? loadError.message : 'Could not load file history.');
      })
      .finally(() => {
        if (active) setIsHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, repoPath, tab, setHistory, hasHistory]);

  const loadBlamePage = useCallback(
    async (startLine: number, append: boolean, generation: number) => {
      if (activeBlameRequestRef.current) return;
      const requestId = ++nextBlameRequestIdRef.current;
      activeBlameRequestRef.current = { id: requestId, generation };
      setIsBlameLoading(true);
      setBlameError(null);
      try {
        const result = await gitClient.getFileBlameRange(path, undefined, startLine, BLAME_LOOKAHEAD_COUNT, repoPath, 'unstaged');
        if (generation !== blameRequestGenerationRef.current) return;
        if (!result.success) {
          setBlameError(result.error || 'Could not load blame data.');
          return;
        }
        const page = splitBlamePage(result.data || []);
        setBlame((current) => (append ? [...current, ...page.lines] : page.lines));
        setBlameHasMore(page.hasMore);
      } catch (loadError: unknown) {
        if (generation !== blameRequestGenerationRef.current) return;
        setBlameError(loadError instanceof Error ? loadError.message : 'Could not load blame data.');
      } finally {
        const activeRequest = activeBlameRequestRef.current;
        if (activeRequest?.id === requestId && activeRequest.generation === generation) {
          activeBlameRequestRef.current = null;
          if (generation === blameRequestGenerationRef.current) setIsBlameLoading(false);
        }
      }
    },
    [path, repoPath, setBlame, setBlameHasMore],
  );

  useEffect(() => {
    if (tab !== 'blame') return;
    const generation = ++blameRequestGenerationRef.current;
    void loadBlamePage(1, false, generation);
    return () => {
      if (blameRequestGenerationRef.current === generation) blameRequestGenerationRef.current += 1;
      if (activeBlameRequestRef.current?.generation === generation) activeBlameRequestRef.current = null;
      setIsBlameLoading(false);
    };
  }, [loadBlamePage, tab]);

  const loadMoreBlame = useCallback(() => {
    if (activeBlameRequestRef.current || isBlameLoading || !blameHasMore) return;
    void loadBlamePage(blame.length + 1, true, blameRequestGenerationRef.current);
  }, [blame.length, blameHasMore, isBlameLoading, loadBlamePage]);
  const save = useCallback(async (): Promise<boolean> => {
    if (isLoading || preview?.kind !== 'text') return false;
    const pathAtSave = path;
    const repoAtSave = repoPath;
    const textAtSave = text;
    const fileKeyAtSave = `${repoAtSave}\0${pathAtSave}`;
    try {
      const result = await gitClient.writeRepoFile(pathAtSave, applyLineEnding(textAtSave, lineEnding), repoAtSave, encoding);
      if (result.success) {
        if (activeFileKeyRef.current === fileKeyAtSave) {
          setSavedText(textAtSave);
          setSavedEncoding(encoding);
          setSavedLineEnding(lineEnding);
          setPreview((current: any) =>
            current?.kind === 'text'
              ? {
                  ...current,
                  bytes: getEncodedTextByteLength(textAtSave, encoding, lineEnding),
                  modifiedAt: new Date().toISOString(),
                }
              : current,
          );
          onRepoChanged();
          showToast(tr('Datei gespeichert.', 'File saved.'), false);
        }
        return true;
      }
      if (activeFileKeyRef.current === fileKeyAtSave) showToast(result.error || 'Could not save file.', true);
      return false;
    } catch (saveError: unknown) {
      if (activeFileKeyRef.current === fileKeyAtSave) {
        showToast(saveError instanceof Error ? saveError.message : 'Could not save file.', true);
      }
      return false;
    }
  }, [encoding, isLoading, lineEnding, onRepoChanged, path, preview?.kind, repoPath, showToast, text, tr]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && dirty && !isLoading) {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, isLoading, save]);
  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmDialog({
      variant: 'danger',
      title: 'Unsaved changes',
      message: 'Save changes before returning to the graph?',
      contextItems: [{ label: 'File', value: path }],
      irreversible: false,
      consequences: 'Discarding loses your unsaved editor changes.',
      confirmLabel: 'Discard changes',
      secondaryActionLabel: 'Save and close',
      secondaryActionVariant: 'default',
      onConfirm: onClose,
      onSecondaryAction: async () => {
        if (await save()) onClose();
      },
    });
  };
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });
  useEffect(() => {
    onCloseRequestChange(() => requestCloseRef.current());
    return () => onCloseRequestChange(null);
  }, [onCloseRequestChange]);
  navigationGuardRef.current = (target, proceed, cancel) => {
    if ((target.kind === 'file' && target.path === path) || !dirty) {
      proceed();
      return;
    }
    const destination = getNavigationDestination(target);
    setConfirmDialog({
      variant: 'danger',
      title: 'Unsaved changes',
      message: `Save changes to "${path}" before opening ${destination}?`,
      contextItems: [{ label: 'Current file', value: path }],
      irreversible: false,
      consequences: 'Discarding loses your unsaved editor changes.',
      confirmLabel: 'Discard changes',
      secondaryActionLabel: 'Save and open',
      secondaryActionVariant: 'default',
      onConfirm: proceed,
      onCancel: cancel,
      onSecondaryAction: async () => {
        if (await save()) proceed();
        else cancel?.();
      },
    });
  };
  useEffect(() => {
    const guard: WorkingDirectoryNavigationGuard = (target, proceed, cancel) => navigationGuardRef.current?.(target, proceed, cancel);
    onNavigationGuardChange(guard);
    return () => onNavigationGuardChange(null);
  }, [onNavigationGuardChange]);
  return (
    <div className="working-file-viewer">
      <div className="working-file-viewer__toolbar">
        <strong className="working-file-viewer__path">{path}</strong>
        {preview?.kind === 'text' && (
          <div className="working-file-viewer__actions">
            <WorkingDirectoryViewerTabs tab={tab} isCsv={isCsv} supportsPreview={supportsPreview} tr={tr} onTabChange={setTab} />
            <WorkingDirectoryFileTools
              repoPath={repoPath}
              path={path}
              text={text}
              selection={selection}
              encoding={encoding}
              lineEnding={lineEnding}
              showWhitespace={showWhitespace}
              onChange={(transformedText) => {
                setText(transformedText);
                setTab('content');
              }}
              onEncodingChange={setEncoding}
              onLineEndingChange={setLineEnding}
              onShowWhitespaceChange={setShowWhitespace}
            />
            <button className="working-file-viewer__button working-file-viewer__button--save" onClick={() => void save()} disabled={!dirty || isLoading}>
              <Save size={15} /> Save
            </button>
          </div>
        )}
      </div>
      {loadError && <div className="working-file-viewer__empty working-file-viewer__empty--error">{loadError}</div>}
      {preview?.kind === 'image' && (
        <div className="working-file-viewer__image">
          <img src={preview.dataUrl} alt={path} />
        </div>
      )}
      {preview?.kind === 'binary' && (
        <div className="working-file-viewer__empty">
          <h3>{preview.reason === 'tooLarge' && preview.mimeType ? 'Large image' : 'Binary file'}</h3>
          <p>{preview.reason === 'tooLarge' ? 'This file is too large for the in-app viewer.' : 'This file cannot be shown as text.'}</p>
          <p>{preview.bytes.toLocaleString()} bytes</p>
          {preview.reason === 'tooLarge' && preview.canLoadImage && (
            <button className="working-file-viewer__button" onClick={() => void loadLargeImage()} disabled={isLargeImageLoading}>
              {isLargeImageLoading ? 'Loading image…' : 'Show image anyway'}
            </button>
          )}
          <div className="working-file-viewer__binary-actions">
            <button className="working-file-viewer__button" onClick={() => void gitClient.openRepositoryPath({ path, action: 'reveal', repoPath })}>
              Show in file system
            </button>
            <button className="working-file-viewer__button" onClick={() => void gitClient.openRepositoryPath({ path, action: 'open', repoPath })}>
              <ExternalLink size={15} /> Open externally
            </button>
            <button className="working-file-viewer__button" onClick={() => void gitClient.openRepositoryPath({ path, action: 'openWith', repoPath })}>
              Open with
            </button>
          </div>
        </div>
      )}
      {preview?.kind === 'text' && tab === 'content' && (
        <React.Suspense fallback={<div className="working-file-viewer__code-editor-loading">Loading editor…</div>}>
          <WorkingDirectoryCodeEditor
            path={path}
            value={text}
            onChange={setText}
            onSave={() => void save()}
            showWhitespace={showWhitespace}
            onSelectionChange={setSelection}
          />
        </React.Suspense>
      )}
      <WorkingDirectoryCsvView preview={preview} tab={tab} isCsv={isCsv} text={text} onChange={setText} />
      {filePreviewKind === 'markdown' && <MarkdownPreviewPane markdownPreview={markdownPreview} onPreviewClick={handleMarkdownPreviewClick} />}
      {filePreviewKind === 'html' && <HtmlPreviewPane preview={htmlPreview} title={path} />}
      {preview?.kind === 'text' && tab === 'history' && (
        <FileHistoryPanel
          entries={history}
          loading={isDataLoading(isHistoryLoading, hasHistory, historyError)}
          error={historyError}
          formatDate={(value) => value}
        />
      )}
      {preview?.kind === 'text' && tab === 'blame' && (
        <BlamePanel
          lines={blame}
          loading={isDataLoading(isBlameLoading, hasBlame, blameError)}
          error={blameError}
          hasMore={blameHasMore}
          onLoadMore={loadMoreBlame}
        />
      )}
      {preview?.kind === 'text' && (
        <WorkingDirectoryFileStatusBar text={text} encoding={encoding} lineEnding={lineEnding} modifiedAt={preview.modifiedAt} tr={tr} />
      )}
    </div>
  );
};
