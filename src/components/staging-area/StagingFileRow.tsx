import { useId, type CSSProperties } from 'react';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { FileEntry } from '@/utils/gitParsing';
import type { FileSection } from './types';
import type { useFileOperations } from './useFileOperations';
import { getStatusInfo } from './utils';

type StagingFileRowProps = {
  entry: FileEntry;
  section: FileSection;
  index: number;
  style: CSSProperties;
  fileOps: ReturnType<typeof useFileOperations>;
  isSelected: boolean;
  onInspect: () => void;
  onMoveFocus: (direction: -1 | 1) => void;
  onFocusChange: (focused: boolean) => void;
};

export function StagingFileRow({ entry, section, index, style, fileOps, isSelected, onInspect, onMoveFocus, onFocusChange }: StagingFileRowProps) {
  const { t, tr } = useI18n();
  const descriptionId = useId();
  const staged = section === 'staged';
  const untracked = section === 'untracked';
  const statusCode = staged ? entry.x : entry.y;
  const statusLabels: Record<string, string> = {
    A: tr('Hinzugefügt', 'Added'),
    M: tr('Geändert', 'Modified'),
    D: tr('Gelöscht', 'Deleted'),
    R: tr('Umbenannt', 'Renamed'),
    C: tr('Kopiert', 'Copied'),
    T: tr('Dateityp geändert', 'File type changed'),
    '?': tr('Unversioniert', 'Untracked'),
  };
  const statusLabel = statusLabels[statusCode] ?? tr('Geändert', 'Changed');
  const partial = !untracked && entry.x !== ' ' && entry.y !== ' ';
  const otherChanges = staged ? tr('Auch ungestagte Änderungen', 'Also has unstaged changes') : tr('Auch gestagte Änderungen', 'Also has staged changes');
  const previousPath = entry.originalPath ? tr(`Zuvor ${entry.originalPath}`, `Previously ${entry.originalPath}`) : '';
  const pathTitle = previousPath ? `${entry.path}\n${previousPath}` : entry.path;

  // Git paths use slashes, including on Windows. A backslash can be part of a filename.
  const lastSlash = entry.path.lastIndexOf('/');
  const parentStart = lastSlash > 0 ? entry.path.lastIndexOf('/', lastSlash - 1) + 1 : 0;
  const parentPrefix = entry.path.slice(0, parentStart);
  const parentName = lastSlash < 0 ? tr('Repository-Stamm', 'Repository root') : entry.path.slice(parentStart, lastSlash + 1);
  const lfsState = fileOps.lfs?.stateFor(entry.path, section);
  const recommendation = lfsState?.recommendation ? fileOps.lfs.recommendationTitle(lfsState) : '';
  const stageLabel = staged
    ? t('generated.components.staging_area.stagingfilesections.unstage_6b603f75')
    : t('generated.components.staging_area.stagingfilesections.stage_9f9f36bd');
  const discardLabel = untracked
    ? t('generated.components.staging_area.stagingfilesections.delete_e5186a63')
    : t('generated.components.diff_viewer.diffcontentpane.discard_23504c1c');

  return (
    <div
      className={`staging-file-row${isSelected ? ' is-selected' : ''}`}
      style={style}
      data-staging-row={index}
      tabIndex={0}
      role="group"
      aria-label={entry.path}
      aria-describedby={descriptionId}
      aria-current={isSelected ? 'true' : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          fileOps.openFileContextMenu(event, entry, section);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          onMoveFocus(event.key === 'ArrowUp' ? -1 : 1);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInspect();
        }
      }}
      onFocus={() => onFocusChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange(false);
      }}
      onClick={onInspect}
      onContextMenu={(event) => fileOps.openFileContextMenu(event, entry, section)}
    >
      <span className="staging-status" style={{ color: getStatusInfo(statusCode).color }} title={statusLabel} aria-hidden="true">
        {statusCode}
      </span>
      <span className="staging-path" title={pathTitle}>
        <span className="staging-name-line">
          <bdi className="staging-file-name">{entry.path.slice(lastSlash + 1)}</bdi>
          {recommendation && (
            <span className="staging-lfs-recommendation" tabIndex={0} role="img" title={recommendation} aria-label={recommendation}>
              <AlertCircle size={13} aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="staging-directory">
          {parentPrefix && <bdi className="staging-directory-prefix">{parentPrefix}</bdi>}
          <bdi className="staging-directory-name">{parentName}</bdi>
        </span>
      </span>
      {partial && (
        <span className="staging-partial" title={otherChanges} aria-hidden="true">
          ◐
        </span>
      )}
      <span id={descriptionId} hidden>
        {[statusLabel, partial ? otherChanges : '', previousPath].filter(Boolean).join(' · ')}
      </span>
      <div className="staging-actions">
        <button
          type="button"
          data-tutorial={staged ? 'unstage-file' : 'stage-file'}
          className="staging-btn"
          title={stageLabel}
          aria-label={`${stageLabel} · ${entry.path}`}
          disabled={fileOps.isMutating}
          onClick={(event) => {
            event.stopPropagation();
            if (staged) void fileOps.unstageFile(entry);
            else void fileOps.stageFile(entry.path);
          }}
        >
          {staged ? '−' : '+'}
        </button>
        {!staged && (
          <button
            type="button"
            data-tutorial={untracked ? 'delete-untracked-file' : 'discard-file'}
            className="staging-btn danger"
            title={discardLabel}
            aria-label={`${discardLabel} · ${entry.path}`}
            disabled={fileOps.isMutating}
            onClick={(event) => {
              event.stopPropagation();
              if (untracked) fileOps.deleteUntracked(entry.path);
              else fileOps.discardFile(entry.path);
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
