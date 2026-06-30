import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns, Eye, FileText, FileWarning, LayoutList, X } from 'lucide-react';
import { DiffRequest } from '../types/diff';
import { useI18n } from '../i18n';
import { GitFileBlameLineDto } from '../types/git';
import {
  applyMarkdownPreviewImageDataUrls,
  collectMarkdownPreviewImageSources,
  isExternalMarkdownUrl,
  isMarkdownFilePath,
  renderMarkdownToSanitizedHtml,
  resolveMarkdownPreviewAssetPath,
} from '../utils/markdownPreview';

type DiffViewMode = 'unified' | 'side-by-side' | 'preview';
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
  rawLines: string[];
  rows: ParsedLine[];
};

type ParsedDiff = {
  fileHeader: string[];
  hunks: ParsedHunk[];
};

type MarkdownPreviewState = {
  loading: boolean;
  error: string | null;
  html: string;
};

interface DiffViewerProps {
  repoPath: string | null;
  request: DiffRequest;
  onClose: () => void;
  /** When provided, Stage/Unstage/Discard buttons appear per hunk */
  onRepoChanged?: () => void;
  onNavigateToCommit?: (hash: string) => void;
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

export const parseDiff = (diffText: string): ParsedDiff => {
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
        rawLines: [],
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

    currentHunk.rawLines.push(line);

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
export const buildHunkPatch = (fileHeader: string[], hunk: ParsedHunk): string => {
  const header = fileHeader.filter((line, index) => line || index < fileHeader.length - 1);
  const rawHunkLines = hunk.rawLines.length
    ? hunk.rawLines
    : hunk.rows.map((row) => {
      const prefix = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ';
      return prefix + row.text;
    });
  return [...header, hunk.header, ...rawHunkLines, ''].join('\n');
};

const highlightLine = (text: string | null | undefined): React.ReactNode[] => {
  if (typeof text !== 'string' || !text) return [];

  const tokenRegex = /(\/\/.*|#.*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^\`\\]|\\.)*`)|(\b(?:const|let|var|function|class|interface|type|struct|import|export|from|as|return|if|else|for|while|do|switch|case|default|break|continue|new|delete|try|catch|finally|throw|def|fn|func|pub|impl|use|package|go|defer|select|chan|map|range|nil|null|undefined|true|false|void|int|float|string|bool|boolean|any|public|private|protected|static|readonly|async|await|yield)\b)|(\b\d+(?:\.\d+)?\b)|(\b[A-Z][a-zA-Z0-9_]*\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\())/g;

  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    const matchedText = match[0];
    const key = `hl-${match.index}`;

    if (match[1]) {
      result.push(<span key={key} className="hl-comment">{matchedText}</span>);
    } else if (match[2]) {
      result.push(<span key={key} className="hl-string">{matchedText}</span>);
    } else if (match[3]) {
      result.push(<span key={key} className="hl-keyword">{matchedText}</span>);
    } else if (match[4]) {
      result.push(<span key={key} className="hl-number">{matchedText}</span>);
    } else if (match[5]) {
      result.push(<span key={key} className="hl-type">{matchedText}</span>);
    } else if (match[6]) {
      result.push(<span key={key} className="hl-function">{matchedText}</span>);
    } else {
      result.push(matchedText);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
};

const formatBlameDate = (dateStr: string, tr: any) => {
  if (!dateStr) return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;

  const now = Date.now();
  const diffMs = now - parsed.getTime();
  const absMs = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return tr('Gerade eben', 'Just now');
  }
  if (absMs < hour) {
    const mins = Math.max(1, Math.round(absMs / minute));
    return tr(`${mins} Min.`, `${mins} m.`);
  }
  if (absMs < day) {
    const hrs = Math.max(1, Math.round(absMs / hour));
    return tr(`${hrs} Std.`, `${hrs} h.`);
  }
  if (absMs < month) {
    const days = Math.max(1, Math.round(absMs / day));
    return tr(`${days} T.`, `${days} d.`);
  }
  if (absMs < year) {
    const mos = Math.max(1, Math.round(absMs / month));
    return tr(`${mos} Mon.`, `${mos} mo.`);
  }
  const yrs = Math.max(1, Math.round(absMs / year));
  return tr(`${yrs} J.`, `${yrs} y.`);
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ repoPath, request, onClose, onRepoChanged, onNavigateToCommit }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffText, setDiffText] = useState('');
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);
  const [hunkOpError, setHunkOpError] = useState<string | null>(null);
  const [sourceTruncated, setSourceTruncated] = useState(false);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { tr } = useI18n();

  const [showBlame, setShowBlame] = useState(false);
  const [blameData, setBlameData] = useState<GitFileBlameLineDto[]>([]);
  const [isBlameLoading, setIsBlameLoading] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownPreviewState>({
    loading: false,
    error: null,
    html: '',
  });

  const isMarkdownFile = useMemo(() => isMarkdownFilePath(request.path), [request.path]);
  const isMarkdownPreviewMode = viewMode === 'preview' && isMarkdownFile;

  useEffect(() => {
    setShowBlame(false);
    setBlameData([]);
    setMarkdownPreview({ loading: false, error: null, html: '' });
  }, [request]);

  useEffect(() => {
    if (!isMarkdownFile && viewMode === 'preview') {
      setViewMode('unified');
    }
  }, [isMarkdownFile, viewMode]);

  useEffect(() => {
    const fetchBlame = async () => {
      if (!showBlame || !repoPath || !window.electronAPI) return;

      setIsBlameLoading(true);
      try {
        const commitHashForBlame = (request.source !== 'staged' && request.source !== 'unstaged')
          ? request.commitHash
          : undefined;

        const result = await window.electronAPI.getFileBlame(request.path, commitHashForBlame);
        if (result.success) {
          setBlameData(result.data);
        } else {
          console.error('Failed to fetch blame data:', result.error);
        }
      } catch (err) {
        console.error('Error fetching blame data:', err);
      } finally {
        setIsBlameLoading(false);
      }
    };

    fetchBlame();
  }, [showBlame, repoPath, request]);

  const blameMap = useMemo(() => {
    const map = new Map<number, GitFileBlameLineDto>();
    for (const item of blameData) {
      map.set(item.lineNumber, item);
    }
    return map;
  }, [blameData]);

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

  useEffect(() => {
    if (!repoPath || !window.electronAPI || !isMarkdownPreviewMode) return;

    let cancelled = false;
    const loadPreview = async () => {
      setMarkdownPreview({ loading: true, error: null, html: '' });

      try {
        const markdownResult = await window.electronAPI.getMarkdownPreviewFile({
          source: request.source,
          path: request.path,
          commitHash: request.commitHash,
        });

        if (!markdownResult.success) {
          if (!cancelled) {
            setMarkdownPreview({
              loading: false,
              error: markdownResult.error || tr('Markdown-Vorschau konnte nicht geladen werden.', 'Could not load Markdown preview.'),
              html: '',
            });
          }
          return;
        }

        const initialHtml = renderMarkdownToSanitizedHtml(markdownResult.data.text);
        const imageSources = collectMarkdownPreviewImageSources(initialHtml);
        const dataUrlsBySource: Record<string, string> = {};

        await Promise.all(imageSources.map(async (imageSource) => {
          const assetPath = resolveMarkdownPreviewAssetPath(request.path, imageSource);
          if (!assetPath || !window.electronAPI) return;

          let assetResult = await window.electronAPI.getRepoFileDataUrl({
            source: request.source,
            path: assetPath,
            commitHash: request.commitHash,
          });

          if (!assetResult.success && request.source === 'staged') {
            assetResult = await window.electronAPI.getRepoFileDataUrl({
              source: 'unstaged',
              path: assetPath,
            });
          }

          if (assetResult.success) {
            dataUrlsBySource[imageSource] = assetResult.data.dataUrl;
          }
        }));

        const html = applyMarkdownPreviewImageDataUrls(initialHtml, dataUrlsBySource);
        if (!cancelled) {
          setMarkdownPreview({ loading: false, error: null, html });
        }
      } catch (previewError: unknown) {
        if (!cancelled) {
          const message = previewError instanceof Error
            ? previewError.message
            : tr('Markdown-Vorschau konnte nicht geladen werden.', 'Could not load Markdown preview.');
          setMarkdownPreview({ loading: false, error: message, html: '' });
        }
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [isMarkdownPreviewMode, repoPath, request, tr]);

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

  const handleMarkdownPreviewClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) {
      event.preventDefault();
      const targetId = href.slice(1);
      if (targetId) {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    event.preventDefault();
    if (isExternalMarkdownUrl(href) && /^https:/i.test(href) && window.electronAPI?.openExternalUrl) {
      void window.electronAPI.openExternalUrl(href);
    }
  };

  const renderBlameCell = (line: ParsedLine, prevLine: ParsedLine | undefined, side: 'left' | 'right' = 'right') => {
    if (!showBlame) return null;

    if (side === 'left' || !line.rightNo) {
      return <div className="diff-blame-cell empty" />;
    }

    const blame = blameMap.get(line.rightNo);
    if (!blame) {
      return (
        <div className="diff-blame-cell empty">
          {isBlameLoading && <span className="spinner-mini" />}
        </div>
      );
    }

    const isUncommitted = blame.commitHash.startsWith('00000000');
    const isClickable = !!onNavigateToCommit && !isUncommitted;
    
    let isNew = true;
    if (prevLine && prevLine.rightNo) {
      const prevBlame = blameMap.get(prevLine.rightNo);
      if (prevBlame && prevBlame.commitHash === blame.commitHash) {
        isNew = false;
      }
    }

    const cellClass = `diff-blame-cell ${isClickable ? 'clickable' : ''} ${isNew ? 'new-block' : 'sub-block'}`;

    const handleClick = () => {
      if (isClickable && onNavigateToCommit) {
        onNavigateToCommit(blame.commitHash);
      }
    };

    if (!isNew) {
      return (
        <div className={cellClass} onClick={handleClick} title={`${blame.author} • ${blame.summary}`}>
          <span className="diff-blame-dot">•</span>
        </div>
      );
    }

    const displayHash = isUncommitted ? '' : blame.abbrevHash || blame.commitHash.substring(0, 8);
    const displayAuthor = isUncommitted ? tr('Nicht committet', 'Not committed yet') : blame.author;
    const displayDate = isUncommitted ? '' : formatBlameDate(blame.authorTime, tr);

    return (
      <div className={cellClass} onClick={handleClick} title={`${blame.author} • ${blame.summary}`}>
        {!isUncommitted && <span className="diff-blame-hash">{displayHash}</span>}
        <span className="diff-blame-author">{displayAuthor}</span>
        {!isUncommitted && <span className="diff-blame-date">{displayDate}</span>}
      </div>
    );
  };

  const renderUnifiedLine = (line: ParsedLine, key: string, prevLine?: ParsedLine) => {
    const lineClass = line.type === 'add'
      ? 'diff-line add'
      : line.type === 'del'
        ? 'diff-line del'
        : 'diff-line ctx';

    const gridStyle = showBlame
      ? { gridTemplateColumns: '220px 52px 52px minmax(0, 1fr)' }
      : undefined;

    return (
      <div key={key} className={lineClass} style={gridStyle}>
        {renderBlameCell(line, prevLine)}
        <span className="diff-lineno">{line.leftNo ?? ''}</span>
        <span className="diff-lineno">{line.rightNo ?? ''}</span>
        <span className="diff-code" title={line.text}>
          {highlightLine(line.text)}
        </span>
      </div>
    );
  };

  const renderSideBySideLine = (line: ParsedLine, key: string, prevLine?: ParsedLine) => {
    const textStr = line.text || '';
    const sbsGridStyle = showBlame
      ? { gridTemplateColumns: '180px 52px minmax(0, 1fr)' }
      : undefined;

    if (line.type === 'context') {
      const [leftText = '', rightText = leftText] = textStr.split('\x1f');
      return (
        <div key={key} className="diff-sbs-row">
          <div className="diff-sbs-cell ctx" style={sbsGridStyle}>
            {renderBlameCell(line, prevLine, 'left')}
            <span className="diff-lineno">{line.leftNo ?? ''}</span>
            <span className="diff-code" title={leftText}>
              {highlightLine(leftText)}
            </span>
          </div>
          <div className="diff-sbs-cell ctx" style={sbsGridStyle}>
            {renderBlameCell(line, prevLine, 'right')}
            <span className="diff-lineno">{line.rightNo ?? ''}</span>
            <span className="diff-code" title={rightText}>
              {highlightLine(rightText)}
            </span>
          </div>
        </div>
      );
    }

    if (line.type === 'del') {
      const [leftText = ''] = textStr.split('\x1f');
      return (
        <div key={key} className="diff-sbs-row">
          <div className="diff-sbs-cell del" style={sbsGridStyle}>
            {renderBlameCell(line, prevLine, 'left')}
            <span className="diff-lineno">{line.leftNo ?? ''}</span>
            <span className="diff-code" title={leftText}>
              {highlightLine(leftText)}
            </span>
          </div>
          <div className="diff-sbs-cell empty" style={sbsGridStyle}>
            {renderBlameCell(line, prevLine, 'right')}
            <span className="diff-lineno"> </span>
            <span className="diff-code"> </span>
          </div>
        </div>
      );
    }

    const [, rightText = ''] = textStr.split('\x1f');
    return (
      <div key={key} className="diff-sbs-row">
        <div className="diff-sbs-cell empty" style={sbsGridStyle}>
          {renderBlameCell(line, prevLine, 'left')}
          <span className="diff-lineno"> </span>
          <span className="diff-code"> </span>
        </div>
        <div className="diff-sbs-cell add" style={sbsGridStyle}>
          {renderBlameCell(line, prevLine, 'right')}
          <span className="diff-lineno">{line.rightNo ?? ''}</span>
          <span className="diff-code" title={rightText}>
            {highlightLine(rightText)}
          </span>
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
            <button
              className={`diff-toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
              title={tr('Markdown-Vorschau', 'Markdown preview')}
              disabled={!isMarkdownFile}
            >
              <FileText size={14} /> {tr('Vorschau', 'Preview')}
            </button>
          </div>

          <button
            className={`diff-toggle-btn ${showBlame ? 'active' : ''}`}
            onClick={() => setShowBlame(!showBlame)}
            title={tr('Git Blame einblenden', 'Show Git Blame')}
            disabled={!canRenderText || isMarkdownPreviewMode}
            style={{ borderRadius: '6px', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            {isBlameLoading ? <span className="spinner-mini" /> : <Eye size={14} />}
            {tr('Blame', 'Blame')}
          </button>

          {!isMarkdownPreviewMode && (
            <div className="diff-nav-group">
              <button className="diff-nav-btn" onClick={() => scrollToHunk(activeHunkIndex - 1)} disabled={hunkCount === 0}>
                <ChevronLeft size={14} />
              </button>
              <span className="diff-nav-label">{tr('Hunk', 'Hunk')} {hunkCount === 0 ? 0 : activeHunkIndex + 1}/{hunkCount}</span>
              <button className="diff-nav-btn" onClick={() => scrollToHunk(activeHunkIndex + 1)} disabled={hunkCount === 0}>
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          <button className="diff-close-btn" onClick={onClose} title={tr('Diff schließen', 'Close diff')}>
            <X size={14} />
          </button>
        </div>
      </div>

      {isMarkdownPreviewMode && (
        <div className="markdown-preview-scroll">
          {markdownPreview.loading && (
            <div className="markdown-preview-loading">
              {Array.from({ length: 9 }).map((_, index) => (
                <div
                  key={index}
                  className="skeleton-line"
                  style={{
                    width: index % 3 === 0 ? '58%' : `${74 - (index % 4) * 8}%`,
                    height: index === 0 ? 18 : 11,
                    borderRadius: 4,
                  }}
                />
              ))}
            </div>
          )}
          {!markdownPreview.loading && markdownPreview.error && (
            <div className="diff-empty-state error">{markdownPreview.error}</div>
          )}
          {!markdownPreview.loading && !markdownPreview.error && markdownPreview.html && (
            <article
              className="markdown-preview-content"
              onClick={handleMarkdownPreviewClick}
              dangerouslySetInnerHTML={{ __html: markdownPreview.html }}
            />
          )}
          {!markdownPreview.loading && !markdownPreview.error && !markdownPreview.html && (
            <div className="diff-empty-state">{tr('Markdown-Datei ist leer.', 'Markdown file is empty.')}</div>
          )}
        </div>
      )}

      {!isMarkdownPreviewMode && isLoading && (
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
      {!isMarkdownPreviewMode && error && !isLoading && <div className="diff-empty-state error">{error}</div>}
      {!isMarkdownPreviewMode && !isLoading && !error && !diffText.trim() && <div className="diff-empty-state">{tr('Keine Unterschiede vorhanden.', 'No differences found.')}</div>}

      {!isMarkdownPreviewMode && !isLoading && !error && diffText.trim() && !canRenderText && (
        <div className="diff-empty-state warning">
          <FileWarning size={18} />
          <span>
            {isBinaryDiff || looksBinaryByExt
              ? tr('Binärdatei erkannt. Text-Diff wird nicht dargestellt.', 'Binary file detected. Text diff is not shown.')
              : tr('Diese Datei kann nicht als Text-Diff dargestellt werden.', 'This file cannot be shown as text diff.')}
          </span>
        </div>
      )}

      {!isMarkdownPreviewMode && !isLoading && !error && diffText.trim() && canRenderText && (
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
            const canStageHunks = !!onRepoChanged && !isTooLarge && (request.source === 'staged' || request.source === 'unstaged');
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
                    const prevLine = lineIndex > 0 ? rows[lineIndex - 1] : undefined;
                    return viewMode === 'side-by-side'
                      ? renderSideBySideLine(normalizedLine, key, prevLine)
                      : renderUnifiedLine(normalizedLine, key, prevLine);
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
