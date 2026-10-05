import React from 'react';
import { ExternalLink } from 'lucide-react';
import { viewModules } from '@/data/viewModules';
import { gitClient } from '@/services/gitClient';
import { useI18n } from '@/i18n';
import { isHtmlFilePath } from '@/utils/htmlPreview';
import { isMarkdownFilePath } from '@/utils/markdownPreview';
import { useMarkdownPreview } from '@/components/diff-viewer/useMarkdownPreview';
import { MarkdownPreviewPane } from '@/components/diff-viewer/MarkdownPreviewPane';
import { useHtmlPreview } from '@/components/working-directory/useHtmlPreview';
import { HtmlPreviewPane } from '@/components/working-directory/HtmlPreviewPane';
import { CsvTableEditor } from '@/components/working-directory/CsvTableEditor';
import { FileHistoryPanel } from '@/components/file-details/FileHistoryPanel';
import { BlamePanel } from '@/components/file-details/BlamePanel';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import type { TextSelection } from '@/components/working-directory/textContentTransforms';
import { useFileHistory } from './useFileHistory';
import { useFileBlame } from './useFileBlame';
import type { useFileDocument } from './useFileDocument';
import type { FileViewerTab } from './fileViewerRequest';
import { FileViewerDiff } from './FileViewerDiff';

type Props = {
  context: RepositoryFileContextDto;
  tab: FileViewerTab;
  document: ReturnType<typeof useFileDocument>;
  refreshTrigger: number;
  showWhitespace: boolean;
  onSelectionChange: (selection: TextSelection) => void;
  onRepoChanged?: () => void;
  onNavigateToCommit?: (hash: string) => void;
};
export function FileViewerContent({ context, tab, document, refreshTrigger, showWhitespace, onSelectionChange, onRepoChanged, onNavigateToCommit }: Props) {
  const { t, tr } = useI18n();
  const { path, repoPath } = context;
  const { preview, text, update, save, loading } = document;
  const markdown = useMarkdownPreview({
    repoPath,
    request: context,
    isActive: tab === 'preview' && isMarkdownFilePath(path),
    t,
    markdownText: preview?.kind === 'text' ? text : undefined,
  });
  const html = useHtmlPreview({ ...context, html: text, isActive: tab === 'preview' && isHtmlFilePath(path) });
  const history = useFileHistory(context, tab === 'history', refreshTrigger);
  const blame = useFileBlame(context, tab === 'blame', refreshTrigger);
  if (tab === 'diff')
    return <FileViewerDiff context={context} refreshTrigger={refreshTrigger} onRepoChanged={onRepoChanged} onNavigateToCommit={onNavigateToCommit} />;
  if (tab === 'history')
    return (
      <div className="file-viewer-panel">
        <FileHistoryPanel {...history} formatDate={(date) => new Date(date).toLocaleString()} onSelectCommit={onNavigateToCommit} />
      </div>
    );
  if (tab === 'blame')
    return (
      <div className="file-viewer-panel">
        <BlamePanel
          lines={blame.lines}
          loading={blame.loading}
          error={blame.error}
          hasMore={blame.hasMore}
          onLoadMore={blame.loadMore}
          onSelectCommit={onNavigateToCommit}
        />
      </div>
    );
  if (loading && !preview) return <div className="working-file-viewer__code-editor-loading">{tr('Datei wird geladen…', 'Loading file…')}</div>;
  if (!preview) return null;
  if (preview.kind === 'missing') return <div className="working-file-viewer__empty">{preview.reason}</div>;
  if (preview.kind === 'image')
    return (
      <div className="working-file-viewer__image">
        <img src={preview.dataUrl} alt={path} />
      </div>
    );
  if (preview.kind === 'binary')
    return (
      <div className="working-file-viewer__empty">
        <h3>{preview.reason === 'tooLarge' ? tr('Datei zu groß', 'File too large') : tr('Binärdatei', 'Binary file')}</h3>
        <p>
          {preview.reason === 'tooLarge'
            ? tr('Diese Datei überschreitet die Vorschaugrenze.', 'This file exceeds the preview limit.')
            : tr('Diese Datei lässt sich nicht als Text anzeigen.', 'This file cannot be displayed as text.')}
        </p>
        <p>{preview.bytes.toLocaleString()} bytes</p>
        {preview.canLoadImage && (
          <button className="working-file-viewer__button" disabled={loading} onClick={() => void document.reload(true)}>
            {tr('Bild trotzdem anzeigen', 'Show image anyway')}
          </button>
        )}
        {context.source === 'unstaged' && (
          <div className="working-file-viewer__binary-actions">
            <button className="working-file-viewer__button" onClick={() => void gitClient.openRepositoryPath({ repoPath, path, action: 'reveal' })}>
              {tr('Im Dateisystem anzeigen', 'Show in file system')}
            </button>
            <button className="working-file-viewer__button" onClick={() => void gitClient.openRepositoryPath({ repoPath, path, action: 'open' })}>
              <ExternalLink size={15} />
              {tr('Extern öffnen', 'Open externally')}
            </button>
            <button className="working-file-viewer__button" onClick={() => void gitClient.openRepositoryPath({ repoPath, path, action: 'openWith' })}>
              {tr('Öffnen mit', 'Open with')}
            </button>
          </div>
        )}
      </div>
    );
  if (tab === 'table') return <CsvTableEditor value={text} onChange={(text) => update({ text })} readOnly={!preview.editable} />;
  if (tab === 'preview')
    return isHtmlFilePath(path) ? (
      <HtmlPreviewPane preview={html} title={path} />
    ) : (
      <MarkdownPreviewPane markdownPreview={markdown.markdownPreview} onPreviewClick={markdown.handleMarkdownPreviewClick} />
    );
  const Editor = viewModules.editor.View;
  return (
    <React.Suspense fallback={<div className="working-file-viewer__code-editor-loading">{tr('Editor wird geladen…', 'Loading editor…')}</div>}>
      <Editor
        path={path}
        value={text}
        onChange={(text) => update({ text })}
        onSave={() => void save()}
        readOnly={!preview.editable}
        showWhitespace={showWhitespace}
        onSelectionChange={onSelectionChange}
      />
    </React.Suspense>
  );
}
