import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAppToast } from '@/hooks/useAppToast';
import { isHtmlFilePath } from '@/utils/htmlPreview';
import { isMarkdownFilePath } from '@/utils/markdownPreview';
import { isCsvFilePath } from '@/components/working-directory/fileContentTransforms';
import { WorkingDirectoryFileTools } from '@/components/working-directory/WorkingDirectoryFileTools';
import { WorkingDirectoryFileStatusBar } from '@/components/working-directory/WorkingDirectoryFileStatusBar';
import type { TextSelection } from '@/components/working-directory/textContentTransforms';
import type { WorkingDirectoryNavigationGuard } from '@/components/working-directory/workingDirectoryNavigationGuard';
import { fileViewerIdentity, repositoryFileContext, type FileViewerRequest, type FileViewerTab } from './fileViewerRequest';
import { useFileDocument } from './useFileDocument';
import { useFileNavigation } from './useFileNavigation';
import { FileViewerContent } from './FileViewerContent';
import '@/styles/working-directory-file-viewer.css';
import '@/styles/diff-viewer.css';
import '@/styles/file-viewer.css';

export type FileViewerProps = {
  request: FileViewerRequest;
  onClose: () => void;
  onRepoChanged?: () => void;
  onNavigateToCommit?: (hash: string) => void;
  refreshTrigger?: number;
  onCloseRequestChange?: (request: (() => void) | null) => void;
  onNavigationGuardChange?: (guard: WorkingDirectoryNavigationGuard | null) => void;
  onRequestChange?: (request: FileViewerRequest) => void;
};
export function FileViewer({
  request,
  onClose,
  onRepoChanged,
  onNavigateToCommit,
  refreshTrigger = 0,
  onCloseRequestChange,
  onNavigationGuardChange,
  onRequestChange,
}: FileViewerProps) {
  const { tr } = useI18n();
  const showToast = useAppToast();
  const [localRequest, setLocalRequest] = useState<{ original: FileViewerRequest; next: FileViewerRequest } | null>(null);
  const activeRequest = !onRequestChange && localRequest?.original === request ? localRequest.next : request;
  const { repoPath, path, source, commitHash } = activeRequest;
  const context = useMemo(() => repositoryFileContext({ repoPath, path, source, commitHash, startView: 'text' }), [repoPath, path, source, commitHash]);
  const identity = fileViewerIdentity(context);
  const [tab, setTab] = useState<FileViewerTab>(activeRequest.startView);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [selection, setSelection] = useState<TextSelection>({ from: 0, to: 0 });
  const refreshed = useCallback(() => {
    setLocalRefresh((value) => value + 1);
    onRepoChanged?.();
  }, [onRepoChanged]);
  const saved = useCallback(() => {
    refreshed();
    showToast(source === 'staged' ? tr('Staging gespeichert.', 'Staging saved.') : tr('Arbeitsdatei gespeichert.', 'Working file saved.'), false);
  }, [refreshed, showToast, source, tr]);
  const reportError = useCallback((message: string) => showToast(message, true), [showToast]);
  const document = useFileDocument(context, localRefresh + refreshTrigger, saved, reportError);
  const navigation = useFileNavigation({
    context,
    dirty: document.dirty,
    save: document.save,
    discard: document.discard,
    onClose,
    onCloseRequestChange,
    onNavigationGuardChange,
  });
  useLayoutEffect(() => {
    setTab(activeRequest.startView);
    setShowWhitespace(false);
    setSelection({ from: 0, to: 0 });
  }, [identity, activeRequest.startView]);
  const openStagedDiff = () => {
    const next: FileViewerRequest = { repoPath, path, source: 'staged', startView: 'diff' };
    navigation.protectNavigation(() => {
      if (onRequestChange) onRequestChange(next);
      else setLocalRequest({ original: request, next });
    });
  };
  useEffect(() => {
    const { dirty, save } = document;
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty) void save();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [document]);
  const changeTab = (next: FileViewerTab) => {
    if (next === tab) return;
    if (next === 'diff')
      navigation.protectDiff(() => {
        setTab('diff');
        setLocalRefresh((value) => value + 1);
      });
    else setTab(next);
  };
  const sourceLabel =
    source === 'staged'
      ? tr('Git-Index · Staging', 'Git index · Staging')
      : source === 'commit'
        ? `${tr('Commit', 'Commit')} ${commitHash?.slice(0, 10)} · ${tr('schreibgeschützt', 'read-only')}`
        : tr('Arbeitsdatei', 'Working file');
  const textFile = document.preview?.kind === 'text';
  const tabs: Array<{ id: FileViewerTab; label: string; available: boolean }> = [
    { id: 'text', label: 'Text', available: true },
    { id: 'diff', label: 'Diff', available: true },
    {
      id: 'preview',
      label: tr('Vorschau', 'Preview'),
      available: Boolean(document.preview?.kind === 'image') || (textFile && (isHtmlFilePath(path) || isMarkdownFilePath(path))),
    },
    { id: 'table', label: tr('Tabelle', 'Table'), available: textFile && isCsvFilePath(path) },
    { id: 'history', label: 'History', available: true },
    { id: 'blame', label: 'Blame', available: textFile },
  ];
  return (
    <div className="working-file-viewer file-viewer" data-source={source}>
      <div className="working-file-viewer__toolbar file-viewer-header">
        <div className="file-viewer-title">
          <strong className="working-file-viewer__path" title={path}>
            {path}
            {document.dirty ? ' *' : ''}
          </strong>
          <span className="file-viewer-source">{sourceLabel}</span>
        </div>
        <div className="working-file-viewer__actions">
          {textFile && (
            <WorkingDirectoryFileTools
              context={context}
              repoPath={repoPath}
              path={path}
              text={document.text}
              selection={selection}
              encoding={document.encoding}
              lineEnding={document.lineEnding}
              showWhitespace={showWhitespace}
              readOnly={!document.preview?.editable || tab === 'diff' || document.saving}
              onChange={(text) => {
                document.update({ text });
                setTab('text');
              }}
              onEncodingChange={(encoding) => document.update({ encoding })}
              onLineEndingChange={(lineEnding) => document.update({ lineEnding })}
              onShowWhitespaceChange={setShowWhitespace}
            />
          )}
          {document.preview?.editable && (
            <button
              className="working-file-viewer__button working-file-viewer__button--save"
              disabled={!document.dirty || document.saving}
              onClick={() => void document.save()}
            >
              <Save size={15} />
              {source === 'staged' ? tr('Staging speichern', 'Save staging') : tr('Arbeitsdatei speichern', 'Save working file')}
            </button>
          )}
          <button className="working-file-viewer__button" aria-label={tr('Datei schließen', 'Close file')} onClick={navigation.close}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="file-viewer-tabs" role="tablist" aria-label={tr('Dateiansichten', 'File views')}>
        {tabs
          .filter((item) => item.available)
          .map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={item.id === tab}
              className={`working-file-viewer__button${item.id === tab ? ' is-active' : ''}`}
              onClick={() => changeTab(item.id)}
            >
              {item.label}
            </button>
          ))}
      </div>
      {document.error && (
        <div className="file-viewer-notice file-viewer-notice--error" role="alert">
          {document.error}
        </div>
      )}
      {document.preview?.lfs && (
        <div className="file-viewer-notice">
          Git LFS · {(document.preview.lfs.bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB
        </div>
      )}
      {textFile && document.preview?.readOnlyReason && tab !== 'diff' && <div className="file-viewer-notice">{document.preview.readOnlyReason}</div>}
      <FileViewerContent
        context={context}
        tab={tab}
        document={document}
        refreshTrigger={refreshTrigger + localRefresh}
        showWhitespace={showWhitespace}
        onSelectionChange={setSelection}
        onRepoChanged={refreshed}
        onOpenStagedDiff={openStagedDiff}
        onNavigateToCommit={onNavigateToCommit ? (hash) => navigation.protectNavigation(() => onNavigateToCommit(hash)) : undefined}
      />
      {textFile && (
        <WorkingDirectoryFileStatusBar
          text={document.text}
          encoding={document.encoding}
          lineEnding={document.lineEnding}
          modifiedAt={document.preview?.modifiedAt}
          tr={tr}
        />
      )}
    </div>
  );
}
