import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns, FileWarning, LayoutList, X } from 'lucide-react';
import { DiffRequest } from '../types/diff';
import { useI18n } from '../i18n';

type DiffViewMode = 'unified' | 'side-by-side';
type ParsedLineType = 'context' | 'add' | 'del';

type ParsedLine = {
  type: ParsedLineType;
  text: string;
  leftNo: number | null;
  rightNo: number | null;
};

type ParsedHunk = {
  id: string;
  header: string;
  rows: ParsedLine[];
};

type ParsedDiff = {
  fileHeader: string[];
  hunks: ParsedHunk[];
};

interface DiffViewerProps {
  repoPath: string | null;
  request: DiffRequest;
  onClose: () => void;
  /** When provided, Stage/Unstage/Discard buttons appear per hunk */
  onRepoChanged?: () => void;
}

const MAX_RENDER_CHARS = 2 * 1024 * 1024;
const MAX_RENDER_LINES = 5000;
const MAX_SINGLE_LINE_LENGTH = 2000;
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'pdf', 'zip', 'gz', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'otf', 'mp3', 'wav', 'mp4', 'mov',
]);

const toShortHash = (value: string | undefined) => (value || '').slice(0, 8);

const getExtension = (filePath: string) => {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return '';
  }
  return fileName.slice(lastDot + 1).toLowerCase();
};

const parseHunkHeader = (line: string): { leftStart: number; rightStart: number } | null => {
  const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  if (!match) return null;
  return {
    leftStart: Number(match[1]),
    rightStart: Number(match[3]),
  };
};

const parseDiff = (diffText: string): ParsedDiff => {
  const lines = diffText.split('\n');
  const fileHeader: string[] = [];
  const hunks: ParsedHunk[] = [];

  let currentHunk: ParsedHunk | null = null;
  let leftLine = 0;
  let rightLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const parsed = parseHunkHeader(line);
      if (!parsed) {
        continue;
      }

      currentHunk = {
        id: `hunk-${hunks.length + 1}`,
        header: line,
        rows: [],
      };
      hunks.push(currentHunk);
      leftLine = parsed.leftStart;
      rightLine = parsed.rightStart;
      continue;
    }

    if (!currentHunk) {
      fileHeader.push(line);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.rows.push({
        type: 'add',
        text: line.slice(1),
        leftNo: null,
        rightNo: rightLine,
      });
      rightLine += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.rows.push({
        type: 'del',
        text: line.slice(1),
        leftNo: leftLine,
        rightNo: null,
      });
      leftLine += 1;
      continue;
    }

    if (line.startsWith('\\ No newline at end of file')) {
      continue;
    }

    const contextLine = line.startsWith(' ') ? line.slice(1) : line;
    currentHunk.rows.push({
      type: 'context',
      text: contextLine,
      leftNo: leftLine,
      rightNo: rightLine,
    });
    leftLine += 1;
    rightLine += 1;
  }

  return { fileHeader, hunks };
};

const sideBySideRows = (rows: ParsedLine[]): ParsedLine[] => {
  const output: ParsedLine[] = [];

  for (let i = 0; i < rows.length;) {
    const row = rows[i];

    if (row.type === 'context') {
      output.push(row);
      i += 1;
      continue;
    }

    if (row.type === 'del') {
      const dels: ParsedLine[] = [];
      const adds: ParsedLine[] = [];

      while (i < rows.length && rows[i].type === 'del') {
        dels.push(rows[i]);
        i += 1;
      }

      while (i < rows.length && rows[i].type === 'add') {
        adds.push(rows[i]);
        i += 1;
      }

      const max = Math.max(dels.length, adds.length);
      for (let idx = 0; idx < max; idx += 1) {
        const del = dels[idx] || null;
        const add = adds[idx] || null;
        output.push({
          type: del && add ? 'context' : (del ? 'del' : 'add'),
          text: `${del?.text || ''}\x1f${add?.text || ''}`,
          leftNo: del?.leftNo || null,
          rightNo: add?.rightNo || null,
        });
      }
      continue;
    }

    output.push(row);
    i += 1;
  }

  return output;
};

/** Reconstruct a minimal unified-diff patch for a single hunk */
const buildHunkPatch = (fileHeader: string[], hunk: ParsedHunk): string => {
  // Use the file header lines that contain the --- / +++ paths
  const diffHeader = fileHeader.filter(l => l.startsWith('diff ') || l.startsWith('index ') || l.startsWith('--- ') || l.startsWith('+++ '));
  // Count lines so we can build the @@ header
  let addCount = 0, delCount = 0, ctxCount = 0;
  for (const row of hunk.rows) {
    if (row.type === 'add') addCount++;
    else if (row.type === 'del') delCount++;
    else ctxCount++;
  }
  const leftStart = hunk.rows.find(r => r.leftNo != null)?.leftNo ?? 1;
  const rightStart = hunk.rows.find(r => r.rightNo != null)?.rightNo ?? 1;
  const leftLen = delCount + ctxCount;
  const rightLen = addCount + ctxCount;
  const hunkHeader = `@@ -${leftStart},${leftLen} +${rightStart},${rightLen} @@`;
  const hunkLines = hunk.rows.map(row => {
    const prefix = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ';
    return prefix + row.text;
  });
  return [...diffHeader, hunkHeader, ...hunkLines, ''].join('\n');
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ repoPath, request, onClose, onRepoChanged }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffText, setDiffText] = useState('');
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);
  const [hunkOpError, setHunkOpError] = useState<string | null>(null);
  const [sourceTruncated, setSourceTruncated] = useState(false);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { tr } = useI18n();

  const applyHunk = async (hunk: ParsedHunk, fileHeader: string[], op: 'stage' | 'unstage' | 'discard') => {
    if (!window.electronAPI) return;
    setHunkOpError(null);
    try {
      const patch = buildHunkPatch(fileHeader, hunk);
      let result;
      if (op === 'stage') {
        result = await window.electronAPI.applyPatch(patch, { cached: true });
      } else if (op === 'unstage') {
        result = await window.electronAPI.applyPatch(patch, { cached: true, reverse: true });
      } else {
        result = await window.electronAPI.applyPatch(patch, { reverse: true });
      }
      if (result.success) {
        onRepoChanged?.();
      } else {
        setHunkOpError(result.error || tr('Hunk-Operation fehlgeschlagen.', 'Hunk operation failed.'));
      }
    } catch (e: any) {
      setHunkOpError(e.message);
    }
  };

  const readableSourceLabel = (currentRequest: DiffRequest): string => {
    if (currentRequest.source === 'staged') return tr('Staging Area', 'Staging Area');
    if (currentRequest.source === 'unstaged') return tr('Working Tree', 'Working Tree');
    return tr(`Commit ${toShortHash(currentRequest.commitHash)}`, `Commit ${toShortHash(currentRequest.commitHash)}`);
  };

  useEffect(() => {
    const fetchDiff = async () => {
      if (!repoPath || !window.electronAPI) return;

      setIsLoading(true);
      setError(null);
      setDiffText('');
      setSourceTruncated(false);
      setActiveHunkIndex(0);

      try {
        let args: string[];
        if (request.source === 'staged') {
          args = ['diff', '--cached', '--', request.path];
        } else if (request.source === 'unstaged') {
          args = ['diff', '--', request.path];
        } else {
          args = ['show', '--format=', '--binary', request.commitHash || '', '--', request.path];
        }
        const result = await window.electronAPI.getDiffPreview(args, {
          maxBytes: MAX_RENDER_CHARS,
          maxLines: MAX_RENDER_LINES,
        });

        if (!result.success) {
          setError(result.error || tr('Diff konnte nicht geladen werden.', 'Could not load diff.'));
          return;
        }

        setDiffText(result.data.text);
        setSourceTruncated(result.data.truncated);
      } catch (fetchError: unknown) {
        console.error(fetchError);
        setError(tr('Diff konnte nicht geladen werden.', 'Could not load diff.'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchDiff();
  }, [repoPath, request, tr]);

  const extension = useMemo(() => getExtension(request.path), [request.path]);
  const looksBinaryByExt = useMemo(() => BINARY_EXTENSIONS.has(extension), [extension]);

  const isBinaryDiff = useMemo(() => {
    if (!diffText) return false;
    return diffText.includes('Binary files') || diffText.includes('GIT binary patch');
  }, [diffText]);

  const isTooLarge = useMemo(() => {
    if (!diffText) return false;
    const lineCount = diffText.split('\n').length;
    return sourceTruncated || diffText.length > MAX_RENDER_CHARS || lineCount > MAX_RENDER_LINES;
  }, [diffText, sourceTruncated]);

  const clippedDiffText = useMemo(() => {
    if (!diffText) return '';
    const clippedByLength = diffText.slice(0, MAX_RENDER_CHARS);
    return clippedByLength
      .split('\n')
      .slice(0, MAX_RENDER_LINES)
      .join('\n');
  }, [diffText]);

  const parsed = useMemo(() => parseDiff(clippedDiffText), [clippedDiffText]);

  const canRenderText = !isBinaryDiff && !looksBinaryByExt;
  const hunkCount = parsed.hunks.length;

  const scrollToHunk = (index: number) => {
    if (hunkCount === 0) return;
    const next = Math.max(0, Math.min(index, hunkCount - 1));
    setActiveHunkIndex(next);
    hunkRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderUnifiedLine = (line: ParsedLine, key: string) => {
    const lineClass = line.type === 'add'
      ? 'diff-line add'
      : line.type === 'del'
        ? 'diff-line del'
        : 'diff-line ctx';

    return (
      <div key={key} className={lineClass}>
        <span className="diff-lineno">{line.leftNo ?? ''}</span>
        <span className="diff-lineno">{line.rightNo ?? ''}</span>
        <span className="diff-code" title={line.text}>{line.text || ' '}</span>
      </div>
    );
  };

  const renderSideBySideLine = (line: ParsedLine, key: string) => {
    if (line.type === 'context') {
      const [leftText = '', rightText = leftText] = line.text.split('\x1f');
      return (
        <div key={key} className="diff-sbs-row">
          <div className="diff-sbs-cell ctx">
            <span className="diff-lineno">{line.leftNo ?? ''}</span>
            <span className="diff-code" title={leftText}>{leftText || ' '}</span>
          </div>
          <div className="diff-sbs-cell ctx">
            <span className="diff-lineno">{line.rightNo ?? ''}</span>
            <span className="diff-code" title={rightText}>{rightText || ' '}</span>
          </div>
        </div>
      );
    }

    if (line.type === 'del') {
      return (
        <div key={key} className="diff-sbs-row">
          <div className="diff-sbs-cell del">
            <span className="diff-lineno">{line.leftNo ?? ''}</span>
            <span className="diff-code" title={line.text}>{line.text || ' '}</span>
          </div>
          <div className="diff-sbs-cell empty">
            <span className="diff-lineno"> </span>
            <span className="diff-code"> </span>
          </div>
        </div>
      );
    }

    return (
      <div key={key} className="diff-sbs-row">
        <div className="diff-sbs-cell empty">
          <span className="diff-lineno"> </span>
          <span className="diff-code"> </span>
        </div>
        <div className="diff-sbs-cell add">
          <span className="diff-lineno">{line.rightNo ?? ''}</span>
          <span className="diff-code" title={line.text}>{line.text || ' '}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="diff-viewer-root">
      <div className="diff-viewer-toolbar">
        <div className="diff-title-wrap">
          <div className="diff-title">{request.title || request.path}</div>
          <div className="diff-subtitle">{readableSourceLabel(request)} | {request.path}</div>
        </div>

        <div className="diff-toolbar-actions">
          <div className="diff-toggle-group">
            <button
              className={`diff-toggle-btn ${viewMode === 'unified' ? 'active' : ''}`}
              onClick={() => setViewMode('unified')}
              title={tr('Unified Diff', 'Unified diff')}
              disabled={!canRenderText}
            >
              <LayoutList size={14} /> {tr('Unified', 'Unified')}
            </button>
            <button
              className={`diff-toggle-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
              title={tr('Side-by-Side Diff', 'Side-by-side diff')}
              disabled={!canRenderText}
            >
              <Columns size={14} /> {tr('Side-by-Side', 'Side-by-side')}
            </button>
          </div>

          <div className="diff-nav-group">
            <button className="diff-nav-btn" onClick={() => scrollToHunk(activeHunkIndex - 1)} disabled={hunkCount === 0}>
              <ChevronLeft size={14} />
            </button>
            <span className="diff-nav-label">{tr('Hunk', 'Hunk')} {hunkCount === 0 ? 0 : activeHunkIndex + 1}/{hunkCount}</span>
            <button className="diff-nav-btn" onClick={() => scrollToHunk(activeHunkIndex + 1)} disabled={hunkCount === 0}>
              <ChevronRight size={14} />
            </button>
          </div>

          <button className="diff-close-btn" onClick={onClose} title={tr('Diff schließen', 'Close diff')}>
            <X size={14} />
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {Array.from({ length: 10 }).map((_, i) => {
            const isAdd = i % 5 === 1;
            const isDel = i % 5 === 3;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 1 - i * 0.07 }}>
                <div className="skeleton-line" style={{ width: 28, height: 9, borderRadius: 3, flexShrink: 0, opacity: 0.5 }} />
                <div
                  className="skeleton-line"
                  style={{
                    height: 9,
                    width: `${30 + (i * 7) % 55}%`,
                    borderRadius: 3,
                    background: isAdd ? 'rgba(79,174,148,0.2)' : isDel ? 'rgba(211,93,105,0.2)' : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      {error && !isLoading && <div className="diff-empty-state error">{error}</div>}
      {!isLoading && !error && !diffText.trim() && <div className="diff-empty-state">{tr('Keine Unterschiede vorhanden.', 'No differences found.')}</div>}

      {!isLoading && !error && diffText.trim() && !canRenderText && (
        <div className="diff-empty-state warning">
          <FileWarning size={18} />
          <span>
            {isBinaryDiff || looksBinaryByExt
              ? tr('Binärdatei erkannt. Text-Diff wird nicht dargestellt.', 'Binary file detected. Text diff is not shown.')
              : tr('Diese Datei kann nicht als Text-Diff dargestellt werden.', 'This file cannot be shown as text diff.')}
          </span>
        </div>
      )}

      {!isLoading && !error && diffText.trim() && canRenderText && (
        <div className="diff-content-scroll">
          {isTooLarge && (
            <div className="diff-large-warning">
              <span>
                {tr(
                  `Großer Diff: ${diffText.split('\n').length.toLocaleString()} Zeilen – Anzeige auf ${MAX_RENDER_LINES.toLocaleString()} Zeilen gekürzt.`,
                  `Large diff: ${diffText.split('\n').length.toLocaleString()} lines – display truncated to ${MAX_RENDER_LINES.toLocaleString()} lines.`
                )}
              </span>
              {!sourceTruncated && (
                <button
                  className="diff-large-warning-copy"
                  onClick={() => navigator.clipboard.writeText(diffText)}
                  title={tr('Vollständigen Diff in Zwischenablage kopieren', 'Copy full diff to clipboard')}
                >
                  {tr('Vollständig kopieren', 'Copy full diff')}
                </button>
              )}
            </div>
          )}

          {parsed.fileHeader.length > 0 && (
            <div className="diff-file-header">
              {parsed.fileHeader.map((line, idx) => (
                <div key={`head-${idx}`} className="diff-header-line">{line}</div>
              ))}
            </div>
          )}

          {parsed.hunks.length === 0 && (
            <div className="diff-empty-state">{tr('Keine Hunk-Daten verfügbar.', 'No hunk data available.')}</div>
          )}

          {hunkOpError && (
            <div className="diff-hunk-op-error">{hunkOpError}</div>
          )}

          {parsed.hunks.map((hunk, hunkIndex) => {
            const rows = viewMode === 'side-by-side' ? sideBySideRows(hunk.rows) : hunk.rows;
            const canStageHunks = !!onRepoChanged && (request.source === 'staged' || request.source === 'unstaged');
            return (
              <div
                key={hunk.id}
                className={`diff-hunk ${activeHunkIndex === hunkIndex ? 'active' : ''}`}
                ref={(element) => {
                  hunkRefs.current[hunkIndex] = element;
                }}
              >
                <div className="diff-hunk-header-row">
                  <button className="diff-hunk-header" onClick={() => scrollToHunk(hunkIndex)}>
                    {hunk.header}
                  </button>
                  {canStageHunks && (
                    <div className="diff-hunk-actions">
                      {request.source === 'unstaged' && (
                        <>
                          <button
                            className="diff-hunk-action-btn"
                            onClick={() => applyHunk(hunk, parsed.fileHeader, 'stage')}
                            title={tr('Diesen Hunk stagen', 'Stage this hunk')}
                          >
                            {tr('Stage', 'Stage')}
                          </button>
                          <button
                            className="diff-hunk-action-btn diff-hunk-action-btn--danger"
                            onClick={() => applyHunk(hunk, parsed.fileHeader, 'discard')}
                            title={tr('Änderungen in diesem Hunk verwerfen', 'Discard changes in this hunk')}
                          >
                            {tr('Verwerfen', 'Discard')}
                          </button>
                        </>
                      )}
                      {request.source === 'staged' && (
                        <button
                          className="diff-hunk-action-btn"
                          onClick={() => applyHunk(hunk, parsed.fileHeader, 'unstage')}
                          title={tr('Diesen Hunk unstagen', 'Unstage this hunk')}
                        >
                          {tr('Unstage', 'Unstage')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className={viewMode === 'side-by-side' ? 'diff-sbs-wrap' : 'diff-unified-wrap'}>
                  {rows.map((line, lineIndex) => {
                    const clippedText = line.text.length > MAX_SINGLE_LINE_LENGTH
                      ? `${line.text.slice(0, MAX_SINGLE_LINE_LENGTH)} ...`
                      : line.text;
                    const normalizedLine = { ...line, text: clippedText };
                    const key = `${hunk.id}-${lineIndex}`;
                    return viewMode === 'side-by-side'
                      ? renderSideBySideLine(normalizedLine, key)
                      : renderUnifiedLine(normalizedLine, key);
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
