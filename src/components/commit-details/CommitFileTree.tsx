import { useMemo, useState } from 'react';
import { FileCode, FileEdit, FileMinus, FilePlus, Folder, FolderOpen } from 'lucide-react';
import { VirtualList } from '@/components/VirtualList';
import { useI18n } from '@/i18n';
import type { CommitFileDetail } from '@/utils/gitParsing';
import { buildCommitFileTree, commitFileTreeRows } from './commitFileTreeRows';
import '@/styles/working-directory-tree.css';
import './commitFileTree.css';

type Props = {
  repoPath: string | null;
  files: readonly CommitFileDetail[];
  collapsedPaths: ReadonlySet<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (file: CommitFileDetail) => void;
  selectedFilePath?: string | null;
  revealFilePath?: string | null;
};

export function CommitFileTree({ repoPath, files, collapsedPaths, onToggleDirectory, onSelectFile, selectedFilePath, revealFilePath }: Props) {
  const { tr } = useI18n();
  const nodes = useMemo(() => buildCommitFileTree(files), [files]);
  const rows = useMemo(() => commitFileTreeRows(nodes, collapsedPaths), [nodes, collapsedPaths]);
  const [focusRequest, setFocusRequest] = useState<{ index: number; id: number }>();
  const statusNames: Record<string, string> = {
    A: tr('Hinzugefügt', 'Added'),
    D: tr('Gelöscht', 'Deleted'),
    M: tr('Geändert', 'Modified'),
    R: tr('Umbenannt', 'Renamed'),
    C: tr('Kopiert', 'Copied'),
    T: tr('Dateityp geändert', 'File type changed'),
  };

  return (
    <div className="working-directory-tree commit-file-tree commit-details-file-list" role="group" aria-label={tr('Geänderte Dateien', 'Changed files')}>
      <div className="working-tree-root" title={tr('Nur in diesem Commit geänderte Dateien', 'Only files changed in this commit')}>
        <FolderOpen className="working-tree-root__icon" size={16} strokeWidth={1.8} aria-hidden="true" />
        <span className="working-tree-root__label">{repoPath?.split(/[\\/]/).filter(Boolean).at(-1) || 'Repository'}/</span>
        <span className="commit-file-tree__count" aria-label={tr(`${files.length} geänderte Dateien`, `${files.length} changed files`)}>
          {files.length}
        </span>
      </div>
      <VirtualList
        className="working-tree-list"
        items={rows}
        rowHeight={25}
        fillAvailableHeight
        overscan={10}
        focusRequest={focusRequest}
        scrollRequest={
          revealFilePath ? { index: rows.findIndex(({ node }) => node.kind === 'file' && node.path === revealFilePath), id: revealFilePath } : undefined
        }
        getKey={({ node }) => node.key}
        renderItem={({ node, isLast, ancestorIsLast }, index) => {
          const open = node.kind === 'directory' && !collapsedPaths.has(node.path);
          const selected = node.kind === 'file' && node.path === selectedFilePath;
          const status = node.kind === 'file' ? node.file.status[0] : '';
          const StatusIcon = status === 'A' ? FilePlus : status === 'D' ? FileMinus : status === 'M' ? FileEdit : FileCode;
          const statusColor = status === 'A' ? 'success' : status === 'D' ? 'danger' : status === 'M' ? 'warning' : 'untracked';
          const title = node.kind === 'file' && node.file.oldPath ? `${node.file.oldPath} → ${node.path}` : node.path;
          return (
            <button
              type="button"
              className={`working-tree-row${selected ? ' working-tree-row--selected' : ''}`}
              data-node-key={node.key}
              title={title}
              aria-label={node.kind === 'directory' ? node.path : `${title}, ${statusNames[status] || tr('Geändert', 'Changed')}`}
              aria-expanded={node.kind === 'directory' ? open : undefined}
              aria-current={selected ? 'true' : undefined}
              onClick={() => (node.kind === 'directory' ? onToggleDirectory(node.path) : onSelectFile(node.file))}
              onKeyDown={(event) => {
                if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
                const nextIndex = index + (event.shiftKey ? -1 : 1);
                if (nextIndex < 0 || nextIndex >= rows.length) return;
                event.preventDefault();
                setFocusRequest((previous) => ({ index: nextIndex, id: (previous?.id ?? 0) + 1 }));
              }}
            >
              <span className="working-tree-row__guide" aria-hidden="true">
                {ancestorIsLast.map((last, ancestorIndex) => (
                  <span key={ancestorIndex}>{last ? '    ' : '│   '}</span>
                ))}
                {isLast ? '└──' : '├──'}
              </span>
              {node.kind === 'directory' ? (
                open ? (
                  <FolderOpen className="working-tree-row__icon working-tree-row__icon--directory" size={15} strokeWidth={1.8} aria-hidden="true" />
                ) : (
                  <Folder className="working-tree-row__icon working-tree-row__icon--directory" size={15} strokeWidth={1.8} aria-hidden="true" />
                )
              ) : (
                <StatusIcon className="working-tree-row__icon" size={15} strokeWidth={1.8} color={`var(--status-${statusColor})`} aria-hidden="true" />
              )}
              <span className="working-tree-row__label">{node.name}</span>
            </button>
          );
        }}
      />
    </div>
  );
}
