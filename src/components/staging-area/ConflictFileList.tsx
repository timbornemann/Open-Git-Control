import { GitMerge } from 'lucide-react';
import { VirtualList } from '@/components/VirtualList';
import { cx } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { ConflictEditorState, ConflictEntry } from './types';
import { getConflictLabelForCode } from './conflictLabels';
import { basename } from './utils';

type ConflictFileListProps = {
  visibleConflicts: ConflictEntry[];
  conflictEditor: ConflictEditorState | null;
  isConflictOnly: boolean;
  isConflictBlockCountPending: boolean;
  blockCountForPath: (path: string) => number;
  onOpenConflictResolver?: (filePath: string) => void;
  openConflictEditor: (filePath: string, initialBlockIndex?: number) => Promise<void> | void;
};

const ConflictFileMeta = ({
  code,
  blocksForFile,
  isConflictBlockCountPending,
}: {
  code: string;
  blocksForFile: number;
  isConflictBlockCountPending: boolean;
}) => {
  const { t, tr } = useI18n();

  return (
    <>
      {getConflictLabelForCode(code, t)}
      {blocksForFile > 0
        ? tr(` - ${blocksForFile} Block${blocksForFile !== 1 ? 'e' : ''}`, ` - ${blocksForFile} block${blocksForFile !== 1 ? 's' : ''}`)
        : isConflictBlockCountPending
          ? ' - ...'
          : ''}
    </>
  );
};

export const ConflictFileList = ({
  visibleConflicts,
  conflictEditor,
  isConflictOnly,
  isConflictBlockCountPending,
  blockCountForPath,
  onOpenConflictResolver,
  openConflictEditor,
}: ConflictFileListProps) => {
  const { t } = useI18n();

  if (onOpenConflictResolver) {
    return (
      <div className="conflict-summary-list">
        {visibleConflicts.map((file) => {
          const blocksForFile = blockCountForPath(file.path);
          return (
            <button
              key={`summary-c-${file.path}`}
              className="conflict-summary-file"
              onClick={() => onOpenConflictResolver(file.path)}
              title={`${file.path} - ${getConflictLabelForCode(file.code, t)} (${file.code})`}
            >
              <span className="conflict-file-icon" title={`Git status: ${file.code}`} aria-hidden="true">
                <GitMerge size={15} strokeWidth={2.2} />
              </span>
              <span className="conflict-file-path">{basename(file.path)}</span>
              <span className="conflict-file-label">
                <ConflictFileMeta code={file.code} blocksForFile={blocksForFile} isConflictBlockCountPending={isConflictBlockCountPending} />
              </span>
              <span className="conflict-summary-action">{t('generated.components.staging_area.conflictresolverpanel.resolve_b2151049')}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="conflict-file-list conflict-file-list--resolver">
      <VirtualList
        items={visibleConflicts}
        rowHeight={62}
        maxHeight={isConflictOnly ? 744 : 372}
        overscan={8}
        getKey={(file) => `c-${file.path}`}
        renderItem={(file) => {
          const isActive = conflictEditor?.filePath === file.path;
          const blocksForFile = blockCountForPath(file.path);
          return (
            <button
              className={cx('conflict-sidebar-file conflict-sidebar-file--resolver', isActive && 'active')}
              onClick={() => {
                void openConflictEditor(file.path);
              }}
              title={file.path}
            >
              <span className="conflict-file-icon" title={`Git status: ${file.code}`} aria-hidden="true">
                <GitMerge size={15} strokeWidth={2.2} />
              </span>
              <span className="conflict-file-path">{basename(file.path)}</span>
              <span className="conflict-file-label">
                <ConflictFileMeta code={file.code} blocksForFile={blocksForFile} isConflictBlockCountPending={isConflictBlockCountPending} />
              </span>
            </button>
          );
        }}
      />
    </div>
  );
};
