import { useI18n } from '@/i18n';

type ConflictResolverHeaderProps = {
  isCompact: boolean;
  isNavigationBusy: boolean;
  isConflictBlockCountPending: boolean;
  totalConflictBlocksInView: number;
  visibleConflictCount: number;
  hasPreviousConflictTarget: boolean;
  hasNextConflictTarget: boolean;
  navigateToPreviousConflict: () => Promise<void> | void;
  navigateToNextConflict: () => Promise<void> | void;
  isStructuredConflictViewLocked: boolean;
  activeConflictFileIndex: number;
  conflictPathsCount: number;
  conflictBlocksCount: number;
  safeSelectedConflictBlockIndex: number;
};

export const ConflictResolverHeader = ({
  isCompact,
  isNavigationBusy,
  isConflictBlockCountPending,
  totalConflictBlocksInView,
  visibleConflictCount,
  hasPreviousConflictTarget,
  hasNextConflictTarget,
  navigateToPreviousConflict,
  navigateToNextConflict,
  isStructuredConflictViewLocked,
  activeConflictFileIndex,
  conflictPathsCount,
  conflictBlocksCount,
  safeSelectedConflictBlockIndex,
}: ConflictResolverHeaderProps) => {
  const { t, tr } = useI18n();
  const conflictCountTitle = t('generated.components.staging_area.conflictresolverpanel.conflict_blocks_in_visible_files_not_only_file_count_47a797f8');
  const visibleFilesLabel = tr(
    `${visibleConflictCount} Datei${visibleConflictCount !== 1 ? 'en' : ''}`,
    `${visibleConflictCount} file${visibleConflictCount !== 1 ? 's' : ''}`,
  );

  const countBadge = (
    <>
      <span className="conflict-section-label-danger">{t('generated.components.staging_area.conflictresolverpanel.conflicts_676ac762')}</span>
      <span className="staging-count" title={conflictCountTitle}>
        {isConflictBlockCountPending && visibleConflictCount > 0 ? '...' : totalConflictBlocksInView}
      </span>
      <span className="staging-stats-inline">{visibleFilesLabel}</span>
      <div className="conflict-header-spacer" />
    </>
  );

  if (isCompact) {
    return <div className="staging-section-header conflict-summary-header">{countBadge}</div>;
  }

  return (
    <div className="conflict-resolver-header-shell">
      <div
        className="conflict-global-nav conflict-global-nav--header"
        role="group"
        aria-label={t('generated.components.staging_area.conflictresolverpanel.conflict_navigation_across_all_files_cfe632bc')}
      >
        <button
          className="conflict-global-nav-btn conflict-global-nav-btn--prev"
          onClick={() => {
            void navigateToPreviousConflict();
          }}
          disabled={!hasPreviousConflictTarget || isNavigationBusy}
        >
          {'<'} {t('generated.components.layout.main.maininspectorpane.back_c5e2bc76')}
        </button>
        <div className="conflict-global-nav-meta">
          <span className="conflict-global-nav-title">{t('generated.components.staging_area.conflictresolverpanel.conflict_navigation_515daa8f')}</span>
          <span className="conflict-global-nav-state">
            {isStructuredConflictViewLocked
              ? t('generated.components.staging_area.conflictresolverpanel.manual_marker_editing_detected_comparison_temporarily_pa_e67c6165')
              : activeConflictFileIndex >= 0
                ? tr(`Datei ${activeConflictFileIndex + 1} von ${conflictPathsCount}`, `File ${activeConflictFileIndex + 1} of ${conflictPathsCount}`)
                : t('generated.components.staging_area.conflictresolverpanel.file_968af4e2')}
            {!isStructuredConflictViewLocked && conflictBlocksCount > 0
              ? tr(
                  ` - Block ${safeSelectedConflictBlockIndex + 1} von ${conflictBlocksCount}`,
                  ` - Block ${safeSelectedConflictBlockIndex + 1} of ${conflictBlocksCount}`,
                )
              : !isStructuredConflictViewLocked
                ? t('generated.components.staging_area.conflictresolverpanel.no_conflict_markers_in_this_file_58c4dc70')
                : ''}
          </span>
        </div>
        <button
          className="conflict-global-nav-btn conflict-global-nav-btn--next"
          onClick={() => {
            void navigateToNextConflict();
          }}
          disabled={!hasNextConflictTarget || isNavigationBusy}
        >
          {t('generated.components.staging_area.conflictresolverpanel.next_b53e1a35')} {'>'}
        </button>
      </div>

      <div className="staging-section-header conflict-section-header">{countBadge}</div>
    </div>
  );
};
