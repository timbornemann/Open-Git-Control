import { useI18n } from '../../i18n';
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
  const { tr } = useI18n();

  return (
    <div className="staging-toolbar">
      <div className="staging-search-row">
        <input
          className="staging-search-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={tr('Datei suchen...', 'Search file...')}
        />
      </div>
      <div className="staging-toolbar-stats">
        <span className="staging-stat-chip" title={tr('Staged Diff-Statistik', 'Staged diff stats')}>
          {tr('Staged', 'Staged')} {formatDiffStats(stagedStats)}
        </span>
        <span className="staging-stat-chip" title={tr('Unstaged Diff-Statistik', 'Unstaged diff stats')}>
          {tr('Unstaged', 'Unstaged')} {formatDiffStats(unstagedStats)}
        </span>
        {isMutating && (
          <span className="staging-stat-chip">
            {tr('Git arbeitet', 'Git is working')} {(mutationElapsedMs / 1000).toFixed(1)}s
          </span>
        )}
        {visibleTotal > 0 && (
          <span className="staging-visible-count">
            {tr(`${visibleTotal} sichtbar`, `${visibleTotal} visible`)}
          </span>
        )}
      </div>
    </div>
  );
};
