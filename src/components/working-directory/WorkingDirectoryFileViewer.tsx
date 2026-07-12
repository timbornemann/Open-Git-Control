import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { gitClient } from '@/services/gitClient';
import { useUIContext } from '@/contexts/AppStateContext';
import { isMarkdownFilePath } from '@/utils/markdownPreview';
import { BlamePanel } from '@/components/file-details/BlamePanel';
import { FileHistoryPanel } from '@/components/file-details/FileHistoryPanel';
import { BLAME_LOOKAHEAD_COUNT, splitBlamePage } from '@/components/file-details/blamePagination';
import type { GitFileBlameLineDto, GitFileHistoryEntryDto } from '@/types/git';
import { useI18n } from '@/i18n';
import { MarkdownPreviewPane } from '@/components/diff-viewer/MarkdownPreviewPane';
import { useMarkdownPreview } from '@/components/diff-viewer/useMarkdownPreview';
import '@/styles/working-directory-file-viewer.css';
import '@/styles/diff-viewer.css';

type Props = {
  repoPath: string;
  path: string;
  onClose: () => void;
  onRepoChanged: () => void;
  onCloseRequestChange: (request: (() => void) | null) => void;
};
type Tab = 'content' | 'preview' | 'history' | 'blame';

export const WorkingDirectoryFileViewer: React.FC<Props> = ({ repoPath, path, onClose, onRepoChanged, onCloseRequestChange }) => {
  const { t } = useI18n();
  const { setConfirmDialog } = useUIContext();
  const requestCloseRef = useRef<() => void>(() => onClose());
  const [preview, setPreview] = useState<any>(null);
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [tab, setTab] = useState<Tab>('content');
  const [history, setHistory] = useState<GitFileHistoryEntryDto[]>([]);
  const [blame, setBlame] = useState<GitFileBlameLineDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dirty = text !== savedText;
  const isMarkdown = isMarkdownFilePath(path);
  const markdownRequest = useMemo(() => ({ source: 'unstaged' as const, path, title: path }), [path]);
  const { markdownPreview, handleMarkdownPreviewClick } = useMarkdownPreview({
    repoPath,
    request: markdownRequest,
    isActive: preview?.kind === 'text' && tab === 'preview',
    t,
  });
  useEffect(() => {
    let active = true;
    setPreview(null);
    setError(null);
    setTab('content');
    void gitClient.getWorkingDirectoryPreview(path, repoPath).then((result) => {
      if (!active) return;
      if (!result.success) {
        setError(result.error || 'Could not open file.');
        return;
      }
      setPreview(result.data);
      if (result.data.kind === 'text') {
        setText(result.data.text);
        setSavedText(result.data.text);
      }
    });
    return () => {
      active = false;
    };
  }, [path, repoPath]);
  useEffect(() => {
    if (tab !== 'history') return;
    void gitClient.getFileHistory(path, undefined, 80, repoPath).then((result) => result.success && setHistory(result.data || []));
  }, [path, repoPath, tab]);
  useEffect(() => {
    if (tab !== 'blame') return;
    void gitClient
      .getFileBlameRange(path, undefined, 1, BLAME_LOOKAHEAD_COUNT, repoPath, 'unstaged')
      .then((result) => result.success && setBlame(splitBlamePage(result.data || []).lines));
  }, [path, repoPath, tab]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && dirty) {
        event.preventDefault();
        void gitClient.writeRepoFile(path, text, repoPath).then((result) => {
          if (result.success) {
            setSavedText(text);
            onRepoChanged();
          } else setError(result.error || 'Could not save file.');
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, onRepoChanged, path, repoPath, text]);
  const save = async () => {
    const result = await gitClient.writeRepoFile(path, text, repoPath);
    if (result.success) {
      setSavedText(text);
      onRepoChanged();
    } else setError(result.error || 'Could not save file.');
  };
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
        await save();
        onClose();
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
  const editorLines = useMemo(() => text.split(/\r?\n/), [text]);
  const editorHeightPx = useMemo(() => {
    // Match the fixed line-height and padding below so textarea rows and gutter rows never drift apart.
    return Math.max(editorLines.length, 1) * 20 + 24;
  }, [editorLines.length]);
  return (
    <div className="working-file-viewer">
      <div className="working-file-viewer__toolbar">
        <strong className="working-file-viewer__path">{path}</strong>
        {preview?.kind === 'text' && (
          <div className="working-file-viewer__actions">
            <button className={`working-file-viewer__button${tab === 'content' ? ' is-active' : ''}`} onClick={() => setTab('content')}>
              Text
            </button>
            {isMarkdown && (
              <button className={`working-file-viewer__button${tab === 'preview' ? ' is-active' : ''}`} onClick={() => setTab('preview')}>
                Preview
              </button>
            )}
            <button className={`working-file-viewer__button${tab === 'history' ? ' is-active' : ''}`} onClick={() => setTab('history')}>
              History
            </button>
            <button className={`working-file-viewer__button${tab === 'blame' ? ' is-active' : ''}`} onClick={() => setTab('blame')}>
              Blame
            </button>
            <button className="working-file-viewer__button working-file-viewer__button--save" onClick={() => void save()} disabled={!dirty}>
              <Save size={15} /> Save
            </button>
          </div>
        )}
      </div>
      {error && <div className="working-file-viewer__empty working-file-viewer__empty--error">{error}</div>}
      {preview?.kind === 'image' && (
        <div className="working-file-viewer__image">
          <img src={preview.dataUrl} alt={path} />
        </div>
      )}
      {preview?.kind === 'binary' && (
        <div className="working-file-viewer__empty">
          <h3>Binary file</h3>
          <p>{preview.reason === 'tooLarge' ? 'This file is too large for the in-app viewer.' : 'This file cannot be shown as text.'}</p>
          <p>{preview.bytes.toLocaleString()} bytes</p>
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
        <div className="working-file-viewer__edit-scroll">
          <div className="working-file-viewer__edit-sync">
            <div className="working-file-viewer__gutter" aria-hidden>
              {editorLines.map((_, index) => (
                <div key={index} className="working-file-viewer__gutter-line">
                  {index + 1}
                </div>
              ))}
            </div>
            <div className="working-file-viewer__code-column">
              <textarea
                aria-label={`Edit ${path}`}
                value={text}
                onChange={(event) => setText(event.target.value)}
                spellCheck={false}
                className="working-file-viewer__textarea"
                style={{ height: `${editorHeightPx}px` }}
              />
            </div>
          </div>
        </div>
      )}
      {preview?.kind === 'text' && tab === 'preview' && <MarkdownPreviewPane markdownPreview={markdownPreview} onPreviewClick={handleMarkdownPreviewClick} />}
      {preview?.kind === 'text' && tab === 'history' && <FileHistoryPanel entries={history} loading={false} error={null} formatDate={(value) => value} />}
      {preview?.kind === 'text' && tab === 'blame' && <BlamePanel lines={blame} loading={false} error={null} hasMore={false} onLoadMore={() => {}} />}
    </div>
  );
};
