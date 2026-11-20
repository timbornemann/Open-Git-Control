import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FileEntry } from '@/utils/gitParsing';
import { useI18n } from '@/i18n';
import { StagingFileRow } from './StagingFileRow';
import type { DiffStats, FileSection } from './types';
import type { useFileOperations } from './useFileOperations';
import { formatDiffStats } from './utils';

const rowHeight = 40;
const headerHeight = 32;
const overscan = 8 * rowHeight;
const fullListLimit = 32;
const listStyle = { '--staging-row-height': `${rowHeight}px`, '--staging-header-height': `${headerHeight}px` } as CSSProperties;

type StagingFileSectionsProps = {
  visibleStaged: FileEntry[];
  visibleUnstaged: FileEntry[];
  visibleUntracked: FileEntry[];
  fileOps: ReturnType<typeof useFileOperations>;
  onSelectFileInspect?: (filePath: string, source: 'staged' | 'unstaged') => void;
  selectedFile?: { path: string; source: 'staged' | 'unstaged' } | null;
};

type GroupAction = { tutorial: string; text: string; title: string; run: () => void; destructive?: boolean };
type Group = {
  section: FileSection;
  label: string;
  color: string;
  files: FileEntry[];
  actions: GroupAction[];
  stats?: DiffStats;
};
type GroupLayout = Group & { expanded: boolean; filesTop: number };
type FocusedFile = { section: FileSection; path: string };
type Viewport = { top: number; height: number };

function mountedRowIndexes(count: number, filesTop: number, viewport: Viewport, focusedIndex: number) {
  const clamp = (index: number) => Math.max(0, Math.min(count, index));
  const renderAll = count <= fullListLimit;
  const start = renderAll ? 0 : clamp(Math.floor((viewport.top - overscan - filesTop) / rowHeight));
  const end = renderAll ? count : clamp(Math.ceil((viewport.top + viewport.height + overscan - filesTop) / rowHeight));
  const indexes = Array.from({ length: end - start }, (_, index) => start + index);
  // Keep a focused row mounted when a snapshot inserts files above it or the user scrolls away.
  if (focusedIndex >= 0 && focusedIndex < start) indexes.unshift(focusedIndex);
  if (focusedIndex >= end && focusedIndex < count) indexes.push(focusedIndex);
  return indexes;
}

export function StagingFileSections({
  visibleStaged,
  visibleUnstaged,
  visibleUntracked,
  fileOps,
  onSelectFileInspect,
  selectedFile,
}: StagingFileSectionsProps) {
  const { t, tr } = useI18n();
  const id = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<(FocusedFile & { index: number }) | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ top: 0, height: rowHeight });
  const [collapsed, setCollapsed] = useState<Partial<Record<FileSection, boolean>>>({});
  const [collapsedMatches, setCollapsedMatches] = useState<Partial<Record<FileSection, boolean>>>({});
  const [focusedFile, setFocusedFile] = useState<FocusedFile | null>(null);
  const { isFiltering, status } = fileOps;
  const query = fileOps.searchQuery.trim().toLowerCase();
  const allLabel = isFiltering ? tr('Alle Treffer', 'All matches') : t('generated.components.layout.sidebar.githubconnectedcontent.all_2ba206ff');

  const measureViewport = useCallback((element: HTMLDivElement) => {
    const { scrollTop, clientHeight } = element;
    setViewport((previous) => {
      const height = clientHeight || previous.height;
      return previous.top === scrollTop && previous.height === height ? previous : { top: scrollTop, height };
    });
  }, []);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => measureViewport(element);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measureViewport]);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (element) {
      element.scrollTop = 0;
      measureViewport(element);
    }
    setCollapsedMatches((previous) => (Object.keys(previous).length ? {} : previous));
  }, [measureViewport, query]);

  const groups: Group[] = [
    {
      section: 'staged',
      label: tr('Gestagt', 'Staged'),
      color: 'var(--status-success)',
      files: visibleStaged,
      stats: fileOps.stagedStats,
      actions: [
        {
          tutorial: 'unstage-section',
          text: `− ${allLabel}`,
          title: isFiltering
            ? tr('Angezeigte Dateien aus dem Staging entfernen', 'Unstage displayed files')
            : t('generated.components.staging_area.stagingfilesections.unstage_all_13421edd'),
          run: fileOps.unstageAll,
        },
      ],
    },
    {
      section: 'unstaged',
      label: tr('Ungestagt', 'Unstaged'),
      color: 'var(--status-warning)',
      files: visibleUnstaged,
      stats: fileOps.unstagedStats,
      actions: [
        {
          tutorial: 'stage-modified-section',
          text: `+ ${allLabel}`,
          title: tr('Alle angezeigten Änderungen dieses Bereichs hinzufügen', 'Stage all displayed changes in this section'),
          run: fileOps.stageAllUnstaged,
        },
        {
          tutorial: 'discard-modified-section',
          text: '×',
          title: tr('Alle angezeigten ungestagten Änderungen verwerfen', 'Discard all displayed unstaged changes'),
          run: fileOps.discardAll,
          destructive: true,
        },
      ],
    },
    {
      section: 'untracked',
      label: tr('Neu', 'Untracked'),
      color: 'var(--status-untracked)',
      files: visibleUntracked,
      actions: [
        {
          tutorial: 'stage-untracked-section',
          text: `+ ${allLabel}`,
          title: tr('Alle angezeigten neuen Dateien hinzufügen', 'Stage all displayed untracked files'),
          run: fileOps.stageAllUntracked,
        },
      ],
    },
  ];
  const focusedFiles = groups.find((group) => group.section === focusedFile?.section)?.files;
  const focusedPath = focusedFile?.path;
  const focusedIndex = useMemo(() => focusedFiles?.findIndex((file) => file.path === focusedPath) ?? -1, [focusedFiles, focusedPath]);

  let nextHeaderTop = 0;
  const layout: GroupLayout[] = groups
    .filter((group) => group.files.length > 0)
    .map((group) => {
      const expanded = !(isFiltering ? collapsedMatches : collapsed)[group.section];
      const filesTop = nextHeaderTop + headerHeight;
      nextHeaderTop = filesTop + (expanded ? group.files.length * rowHeight : 0);
      return { ...group, expanded, filesTop };
    });

  const applyPendingFocus = () => {
    const target = pendingFocus.current;
    if (!target) return;
    const row = viewportRef.current?.querySelector<HTMLElement>(`[data-tutorial="${target.section}-files"] [data-staging-row="${target.index}"]`);
    if (row?.getAttribute('aria-label') !== target.path) return;
    pendingFocus.current = null;
    row.focus({ preventScroll: true });
  };
  useLayoutEffect(applyPendingFocus);

  const focusRow = (group: GroupLayout, index: number) => {
    const element = viewportRef.current;
    if (!element) return;
    pendingFocus.current = { section: group.section, path: group.files[index].path, index };
    const top = group.filesTop + index * rowHeight;
    if (top < element.scrollTop + headerHeight) {
      element.scrollTop = top - headerHeight;
    } else if (top + rowHeight > element.scrollTop + (element.clientHeight || viewport.height)) {
      element.scrollTop = top + rowHeight - (element.clientHeight || viewport.height);
    }
    measureViewport(element);
    applyPendingFocus();
  };

  const moveFocus = (groupIndex: number, index: number, direction: -1 | 1) => {
    const group = layout[groupIndex];
    const next = index + direction;
    if (next >= 0 && next < group.files.length) {
      focusRow(group, next);
      return;
    }
    for (let candidate = groupIndex + direction; candidate >= 0 && candidate < layout.length; candidate += direction) {
      const adjacent = layout[candidate];
      if (!adjacent.expanded) continue;
      focusRow(adjacent, direction > 0 ? 0 : adjacent.files.length - 1);
      return;
    }
  };

  const toggleGroup = ({ section, expanded, filesTop, files }: GroupLayout) => {
    const element = viewportRef.current;
    const headerTop = filesTop - headerHeight;
    if (expanded && element && element.scrollTop > headerTop && element.scrollTop < filesTop + files.length * rowHeight) {
      element.scrollTop = headerTop;
      measureViewport(element);
    }
    const setGroups = isFiltering ? setCollapsedMatches : setCollapsed;
    setGroups((previous) => ({ ...previous, [section]: expanded }));
  };

  return (
    <div
      className="staging-change-list"
      role="region"
      aria-label={tr('Geänderte Dateien', 'Changed files')}
      ref={viewportRef}
      style={{ ...listStyle, flexGrow: Math.max(1, Math.min(8, Math.ceil(nextHeaderTop / rowHeight))) }}
      onScroll={(event) => measureViewport(event.currentTarget)}
    >
      {layout.map((group, groupIndex) => {
        const { section, expanded, files } = group;
        const listId = `${id}-${section}`;
        const total = status?.[section].length ?? files.length;
        const count = isFiltering && files.length !== total ? `${files.length}/${total}` : files.length;
        const Chevron = expanded ? ChevronDown : ChevronRight;
        const source = section === 'staged' ? 'staged' : 'unstaged';
        return (
          <section className="staging-section" data-tutorial={`${section}-files`} key={section} aria-labelledby={`${listId}-heading`}>
            <div className="staging-section-header staging-change-header">
              <button
                id={`${listId}-heading`}
                type="button"
                className="staging-section-toggle"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => toggleGroup(group)}
              >
                <Chevron size={14} aria-hidden="true" />
                <span style={{ color: group.color }}>{group.label}</span>
                <span
                  className="staging-count"
                  title={isFiltering ? tr(`${files.length} von ${total} Dateien`, `${files.length} of ${total} files`) : undefined}
                >
                  {count}
                </span>
              </button>
              {!isFiltering && expanded && !!group.stats?.files && <span className="staging-stats-inline">{formatDiffStats(group.stats)}</span>}
              {expanded && (
                <div className="staging-section-actions">
                  {group.actions.map((action) => (
                    <button
                      key={action.tutorial}
                      type="button"
                      data-tutorial={action.tutorial}
                      className={`staging-btn-sm${action.destructive ? ' danger' : ''}`}
                      disabled={fileOps.isMutating}
                      title={action.title}
                      aria-label={action.title}
                      onClick={action.run}
                    >
                      {action.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="staging-section-list" id={listId} hidden={!expanded} style={{ height: files.length * rowHeight }}>
              {expanded &&
                mountedRowIndexes(files.length, group.filesTop, viewport, focusedFile?.section === section ? focusedIndex : -1).map((index) => {
                  const file = files[index];
                  return (
                    <StagingFileRow
                      key={file.path}
                      entry={file}
                      section={section}
                      index={index}
                      style={{ top: index * rowHeight }}
                      fileOps={fileOps}
                      isSelected={selectedFile?.path === file.path && selectedFile.source === source}
                      onInspect={() => {
                        if (onSelectFileInspect) onSelectFileInspect(file.path, source);
                        else fileOps.showDiff(file.path, section === 'staged');
                      }}
                      onMoveFocus={(direction) => moveFocus(groupIndex, index, direction)}
                      onFocusChange={(focused) =>
                        setFocusedFile((previous) => {
                          const sameFile = previous?.section === section && previous.path === file.path;
                          if (focused) return sameFile ? previous : { section, path: file.path };
                          return sameFile ? null : previous;
                        })
                      }
                    />
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
