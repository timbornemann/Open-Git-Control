import type { FileEntry } from '@/utils/gitParsing';
import { useI18n } from '@/i18n';
import { VirtualList } from '@/components/VirtualList';
import type { FileSection } from './types';
import type { useFileOperations } from './useFileOperations';
import { basename, formatDiffStats, getStatusInfo } from './utils';

type StagingFileSectionsProps = {
  visibleStaged: FileEntry[];
  visibleUnstaged: FileEntry[];
  visibleUntracked: FileEntry[];
  fileOps: ReturnType<typeof useFileOperations>;
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

export const StagingFileSections: React.FC<StagingFileSectionsProps> = ({ visibleStaged, visibleUnstaged, visibleUntracked, fileOps, onSelectFileInspect }) => {
  const { t } = useI18n();

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
        <span className="staging-status" style={{ color: info.color }}>
          {statusCode}
        </span>
        <span className="staging-path" title={entry.path}>
          {basename(entry.path)}
        </span>
        <div className="staging-actions">
          {section === 'staged' && (
            <button
              className="staging-btn"
              disabled={fileOps.isMutating}
              onClick={(event) => {
                event.stopPropagation();
                fileOps.unstageFile(entry);
              }}
              title={t('generated.components.staging_area.stagingfilesections.unstage_6b603f75')}
            >
              -
            </button>
          )}
          {section === 'unstaged' && (
            <>
              <button
                className="staging-btn"
                disabled={fileOps.isMutating}
                onClick={(event) => {
                  event.stopPropagation();
                  fileOps.stageFile(entry.path);
                }}
                title={t('generated.components.staging_area.stagingfilesections.stage_9f9f36bd')}
              >
                +
              </button>
              <button
                className="staging-btn danger"
                disabled={fileOps.isMutating}
                onClick={(event) => {
                  event.stopPropagation();
                  fileOps.discardFile(entry.path);
                }}
                title={t('generated.components.diff_viewer.diffcontentpane.discard_23504c1c')}
              >
                x
              </button>
            </>
          )}
          {section === 'untracked' && (
            <>
              <button
                className="staging-btn"
                disabled={fileOps.isMutating}
                onClick={(event) => {
                  event.stopPropagation();
                  fileOps.stageFile(entry.path);
                }}
                title={t('generated.components.staging_area.stagingfilesections.stage_9f9f36bd')}
              >
                +
              </button>
              <button
                className="staging-btn danger"
                disabled={fileOps.isMutating}
                onClick={(event) => {
                  event.stopPropagation();
                  fileOps.deleteUntracked(entry.path);
                }}
                title={t('generated.components.staging_area.stagingfilesections.delete_e5186a63')}
              >
                x
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const getSectionFlex = (itemCount: number) => `${Math.min(itemCount, 8)} 1 0`;

  return (
    <>
      {visibleStaged.length > 0 && (
        <div className="staging-section" style={{ flex: getSectionFlex(visibleStaged.length) }}>
          <SectionHeader
            title={t('generated.components.staging_area.stagingfilesections.staged_changes_12b1a849')}
            count={visibleStaged.length}
            color="var(--status-success)"
            statsText={formatDiffStats(fileOps.stagedStats)}
            actions={
              <button
                className="staging-btn-sm"
                disabled={fileOps.isMutating}
                onClick={fileOps.unstageAll}
                title={t('generated.components.staging_area.stagingfilesections.unstage_all_13421edd')}
              >
                - {t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff')}
              </button>
            }
          />
          <VirtualList
            className="staging-section-list"
            items={visibleStaged}
            rowHeight={28}
            fillAvailableHeight
            getKey={(file) => `s-${file.path}`}
            renderItem={(file) => <FileRow entry={file} section="staged" />}
          />
        </div>
      )}

      {visibleUnstaged.length > 0 && (
        <div className="staging-section" style={{ flex: getSectionFlex(visibleUnstaged.length) }}>
          <SectionHeader
            title={t('generated.components.staging_area.stagingfilesections.changes_69ca4922')}
            count={visibleUnstaged.length}
            color="var(--status-warning)"
            statsText={formatDiffStats(fileOps.unstagedStats)}
            actions={
              <>
                <button
                  className="staging-btn-sm"
                  disabled={fileOps.isMutating}
                  onClick={fileOps.stageAll}
                  title={t('generated.components.staging_area.stagingfilesections.stage_all_e40e6a84')}
                >
                  + {t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff')}
                </button>
                <button
                  className="staging-btn-sm danger"
                  disabled={fileOps.isMutating}
                  onClick={fileOps.discardAll}
                  title={t('generated.components.staging_area.stagingfilesections.discard_all_327bcdfe')}
                >
                  x {t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff')}
                </button>
              </>
            }
          />
          <VirtualList
            className="staging-section-list"
            items={visibleUnstaged}
            rowHeight={28}
            fillAvailableHeight
            getKey={(file) => `u-${file.path}`}
            renderItem={(file) => <FileRow entry={file} section="unstaged" />}
          />
        </div>
      )}

      {visibleUntracked.length > 0 && (
        <div className="staging-section" style={{ flex: getSectionFlex(visibleUntracked.length) }}>
          <SectionHeader
            title={t('generated.components.staging_area.stagingfilesections.untracked_d2518623')}
            count={visibleUntracked.length}
            color="var(--status-untracked)"
            actions={
              <button
                className="staging-btn-sm"
                disabled={fileOps.isMutating}
                onClick={fileOps.stageAllUntracked}
                title={t('generated.components.staging_area.stagingfilesections.stage_all_untracked_0db34fdb')}
              >
                + {t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff')}
              </button>
            }
          />
          <VirtualList
            className="staging-section-list"
            items={visibleUntracked}
            rowHeight={28}
            fillAvailableHeight
            getKey={(file) => `t-${file.path}`}
            renderItem={(file) => <FileRow entry={file} section="untracked" />}
          />
        </div>
      )}
    </>
  );
};
