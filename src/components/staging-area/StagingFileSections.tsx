import type { FileEntry } from '../../utils/gitParsing';
import { useI18n } from '../../i18n';
import { VirtualList } from '../VirtualList';
import type { FileSection } from './types';
import type { useFileOperations } from './useFileOperations';
import {
  basename,
  formatDiffStats,
  getStatusInfo,
} from './utils';

type StagingFileSectionsProps = {
  visibleStaged: FileEntry[];
  visibleUnstaged: FileEntry[];
  visibleUntracked: FileEntry[];
  fileOps: ReturnType<typeof useFileOperations>;
  maxListHeight: (itemCount: number) => number;
  onSelectFileInspect?: (filePath: string, source: 'staged' | 'unstaged') => void;
};

const SectionHeader = ({
  title,
  count,
  color,
  actions,
  statsText,
}: {
  title: string;
  count: number;
  color: string;
  actions?: React.ReactNode;
  statsText?: string;
}) => (
  <div className="staging-section-header">
    <span style={{ color }}>{title}</span>
    <span className="staging-count">{count}</span>
    {statsText && <span className="staging-stats-inline">{statsText}</span>}
    <div style={{ flex: 1 }} />
    {actions}
  </div>
);

export const StagingFileSections: React.FC<StagingFileSectionsProps> = ({
  visibleStaged,
  visibleUnstaged,
  visibleUntracked,
  fileOps,
  maxListHeight,
  onSelectFileInspect,
}) => {
  const { tr } = useI18n();

  const FileRow = ({ entry, section }: { entry: FileEntry; section: FileSection }) => {
    const statusCode = section === 'staged' ? entry.x : entry.y;
    const info = getStatusInfo(statusCode);
    const inspectSource = section === 'staged' ? 'staged' : section === 'unstaged' ? 'unstaged' : null;
    return (
      <div
        className="staging-file-row"
        onClick={() => {
          if (inspectSource) onSelectFileInspect?.(entry.path, inspectSource);
          if (section !== 'untracked') fileOps.showDiff(entry.path, section === 'staged');
        }}
        onContextMenu={(event) => fileOps.openFileContextMenu(event, entry, section)}
      >
        <span className="staging-status" style={{ color: info.color }}>{statusCode}</span>
        <span className="staging-path" title={entry.path}>{basename(entry.path)}</span>
        <div className="staging-actions">
          {section === 'staged' && (
            <button className="staging-btn" disabled={fileOps.isMutating} onClick={(event) => { event.stopPropagation(); fileOps.unstageFile(entry.path); }} title={tr('Aus Stage entfernen', 'Unstage')}>-</button>
          )}
          {section === 'unstaged' && (
            <>
              <button className="staging-btn" disabled={fileOps.isMutating} onClick={(event) => { event.stopPropagation(); fileOps.stageFile(entry.path); }} title={tr('Stagen', 'Stage')}>+</button>
              <button className="staging-btn danger" disabled={fileOps.isMutating} onClick={(event) => { event.stopPropagation(); fileOps.discardFile(entry.path); }} title={tr('Verwerfen', 'Discard')}>x</button>
            </>
          )}
          {section === 'untracked' && (
            <>
              <button className="staging-btn" disabled={fileOps.isMutating} onClick={(event) => { event.stopPropagation(); fileOps.stageFile(entry.path); }} title={tr('Stagen', 'Stage')}>+</button>
              <button className="staging-btn danger" disabled={fileOps.isMutating} onClick={(event) => { event.stopPropagation(); fileOps.deleteUntracked(entry.path); }} title={tr('Loeschen', 'Delete')}>x</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {visibleStaged.length > 0 && (
        <div className="staging-section">
          <SectionHeader
            title={tr('Staged Aenderungen', 'Staged changes')}
            count={visibleStaged.length}
            color="var(--status-success)"
            statsText={formatDiffStats(fileOps.stagedStats)}
            actions={<button className="staging-btn-sm" disabled={fileOps.isMutating} onClick={fileOps.unstageAll} title={tr('Alle unstagen', 'Unstage all')}>- {tr('Alle', 'All')}</button>}
          />
          <VirtualList
            items={visibleStaged}
            rowHeight={28}
            maxHeight={maxListHeight(visibleStaged.length)}
            getKey={(file) => `s-${file.path}`}
            renderItem={(file) => <FileRow entry={file} section="staged" />}
          />
        </div>
      )}

      {visibleUnstaged.length > 0 && (
        <div className="staging-section">
          <SectionHeader
            title={tr('Aenderungen', 'Changes')}
            count={visibleUnstaged.length}
            color="var(--status-warning)"
            statsText={formatDiffStats(fileOps.unstagedStats)}
            actions={(
              <>
                <button className="staging-btn-sm" disabled={fileOps.isMutating} onClick={fileOps.stageAll} title={tr('Alle stagen', 'Stage all')}>+ {tr('Alle', 'All')}</button>
                <button className="staging-btn-sm danger" disabled={fileOps.isMutating} onClick={fileOps.discardAll} title={tr('Alle verwerfen', 'Discard all')}>x {tr('Alle', 'All')}</button>
              </>
            )}
          />
          <VirtualList
            items={visibleUnstaged}
            rowHeight={28}
            maxHeight={maxListHeight(visibleUnstaged.length)}
            getKey={(file) => `u-${file.path}`}
            renderItem={(file) => <FileRow entry={file} section="unstaged" />}
          />
        </div>
      )}

      {visibleUntracked.length > 0 && (
        <div className="staging-section">
          <SectionHeader
            title={tr('Untracked', 'Untracked')}
            count={visibleUntracked.length}
            color="var(--status-untracked)"
            actions={<button className="staging-btn-sm" disabled={fileOps.isMutating} onClick={fileOps.stageAllUntracked} title={tr('Alle untracked stagen', 'Stage all untracked')}>+ {tr('Alle', 'All')}</button>}
          />
          <VirtualList
            items={visibleUntracked}
            rowHeight={28}
            maxHeight={maxListHeight(visibleUntracked.length)}
            getKey={(file) => `t-${file.path}`}
            renderItem={(file) => <FileRow entry={file} section="untracked" />}
          />
        </div>
      )}
    </>
  );
};
