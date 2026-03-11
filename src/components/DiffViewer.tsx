import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns, FileWarning, LayoutList, X } from 'lucide-react';
import { DiffRequest } from '../types/diff';

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
}

const MAX_RENDER_CHARS = 200000;
const MAX_RENDER_LINES = 2500;
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

const readableSourceLabel = (request: DiffRequest): string => {
  if (request.source === 'staged') return 'Staging Area';
  if (request.source === 'unstaged') return 'Working Tree';
  return `Commit ${toShortHash(request.commitHash)}`;
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ repoPath, request, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffText, setDiffText] = useState('');
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const fetchDiff = async () => {
      if (!repoPath || !window.electronAPI) return;

      setIsLoading(true);
      setError(null);
      setDiffText('');
      setActiveHunkIndex(0);

      try {
        let result;
        if (request.source === 'staged') {
          result = await window.electronAPI.runGitCommand('diff', '--cached', '--', request.path);
        } else if (request.source === 'unstaged') {
          result = await window.electronAPI.runGitCommand('diff', '--', request.path);
        } else {
          result = await window.electronAPI.runGitCommand('show', '--format=', '--binary', request.commitHash || '', '--', request.path);
        }

        if (!result.success) {
          setError(result.error || 'Diff konnte nicht geladen werden.');
          return;
        }

        setDiffText(String(result.data || ''));
      } catch (fetchError: unknown) {
        console.error(fetchError);
        setError('Diff konnte nicht geladen werden.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDiff();
  }, [repoPath, request]);

  const extension = useMemo(() => getExtension(request.path), [request.path]);
  const looksBinaryByExt = useMemo(() => BINARY_EXTENSIONS.has(extension), [extension]);

  const isBinaryDiff = useMemo(() => {
    if (!diffText) return false;
    return diffText.includes('Binary files') || diffText.includes('GIT binary patch');
  }, [diffText]);

  const isTooLarge = useMemo(() => {
    if (!diffText) return false;
    const lineCount = diffText.split('\n').length;
    return diffText.length > MAX_RENDER_CHARS || lineCount > MAX_RENDER_LINES;
  }, [diffText]);

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
              title="Unified Diff"
              disabled={!canRenderText}
            >
              <LayoutList size={14} /> Unified
            </button>
            <button
              className={`diff-toggle-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
              title="Side-by-Side Diff"
              disabled={!canRenderText}
            >
              <Columns size={14} /> Side-by-Side
            </button>
          </div>

          <div className="diff-nav-group">
            <button className="diff-nav-btn" onClick={() => scrollToHunk(activeHunkIndex - 1)} disabled={hunkCount === 0}>
              <ChevronLeft size={14} />
            </button>
            <span className="diff-nav-label">Hunk {hunkCount === 0 ? 0 : activeHunkIndex + 1}/{hunkCount}</span>
            <button className="diff-nav-btn" onClick={() => scrollToHunk(activeHunkIndex + 1)} disabled={hunkCount === 0}>
              <ChevronRight size={14} />
            </button>
          </div>

          <button className="diff-close-btn" onClick={onClose} title="Diff schliessen">
            <X size={14} />
          </button>
        </div>
      </div>

      {isLoading && <div className="diff-empty-state">Diff wird geladen...</div>}
      {error && !isLoading && <div className="diff-empty-state error">{error}</div>}
      {!isLoading && !error && !diffText.trim() && <div className="diff-empty-state">Keine Unterschiede vorhanden.</div>}

      {!isLoading && !error && diffText.trim() && !canRenderText && (
        <div className="diff-empty-state warning">
          <FileWarning size={18} />
          <span>
            {isBinaryDiff || looksBinaryByExt
              ? 'Binardatei erkannt. Text-Diff wird nicht dargestellt.'
              : 'Diese Datei kann nicht als Text-Diff dargestellt werden.'}
          </span>
        </div>
      )}

      {!isLoading && !error && diffText.trim() && canRenderText && (
        <div className="diff-content-scroll">
          {isTooLarge && (
            <div className="diff-large-warning">
              Grosser Diff erkannt. Anzeige wurde aus Performance-Gruenden gekuerzt.
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
            <div className="diff-empty-state">Keine Hunk-Daten verfuegbar.</div>
          )}

          {parsed.hunks.map((hunk, hunkIndex) => {
            const rows = viewMode === 'side-by-side' ? sideBySideRows(hunk.rows) : hunk.rows;
            return (
              <div
                key={hunk.id}
                className={`diff-hunk ${activeHunkIndex === hunkIndex ? 'active' : ''}`}
                ref={(element) => {
                  hunkRefs.current[hunkIndex] = element;
                }}
              >
                <button className="diff-hunk-header" onClick={() => scrollToHunk(hunkIndex)}>
                  {hunk.header}
                </button>

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

