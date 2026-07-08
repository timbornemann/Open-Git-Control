import { useI18n } from '@/i18n';
import { formatDiffStats } from './utils';
import type { DiffStats } from './types';

type StagingToolbarProps = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  stagedStats: DiffStats;
  unstagedStats: DiffStats;
  isMutating: boolean;
  mutationElapsedMs: number;
  visibleTotal: number;
};

export const StagingToolbar: React.FC<StagingToolbarProps> = ({
  searchQuery,
  setSearchQuery,
  stagedStats,
  unstagedStats,
  isMutating,
  mutationElapsedMs,
  visibleTotal,
}) => {
  const { t, tr } = useI18n();

  return (
    <div className="staging-toolbar">
      <div className="staging-search-row">
        <input
          className="staging-search-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('generated.components.staging_area.stagingtoolbar.search_file_be8954bd')}
        />
      </div>
      <div className="staging-toolbar-stats">
        <span className="staging-stat-chip" title={t('generated.components.staging_area.stagingtoolbar.staged_diff_stats_80752927')}>
          {t('generated.components.staging_area.stagingtoolbar.staged_62fac16f')} {formatDiffStats(stagedStats)}
        </span>
        <span className="staging-stat-chip" title={t('generated.components.staging_area.stagingtoolbar.unstaged_diff_stats_274a22bb')}>
          {t('generated.components.staging_area.stagingtoolbar.unstaged_5eac5a01')} {formatDiffStats(unstagedStats)}
        </span>
        {isMutating && (
          <span className="staging-stat-chip">
            {t('generated.components.staging_area.stagingtoolbar.git_is_working_700e9c35')} {(mutationElapsedMs / 1000).toFixed(1)}s
          </span>
        )}
        {visibleTotal > 0 && <span className="staging-visible-count">{tr(`${visibleTotal} sichtbar`, `${visibleTotal} visible`)}</span>}
      </div>
    </div>
  );
};
