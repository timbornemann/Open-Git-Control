import { useI18n } from '@/i18n';
import { Plus } from 'lucide-react';

type StagingToolbarProps = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onStageAll: () => void;
  canStageAll: boolean;
  hasConflicts: boolean;
};

export const StagingToolbar: React.FC<StagingToolbarProps> = ({ searchQuery, setSearchQuery, onStageAll, canStageAll, hasConflicts }) => {
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
        <button
          className="staging-tool-btn staging-stage-all"
          onClick={onStageAll}
          disabled={!canStageAll}
          title={
            hasConflicts
              ? tr('Löse zuerst alle Konflikte, bevor du das gesamte Repository hinzufügst.', 'Resolve all conflicts before staging the whole repository.')
              : tr(
                  'Alle geänderten, gelöschten und neuen Dateien hinzufügen, auch ausgeblendete Suchergebnisse.',
                  'Stage every modified, deleted and untracked file, including files hidden by the search filter.',
                )
          }
        >
          <Plus size={14} aria-hidden="true" />
          <span>{tr('Gesamtes Repository hinzufügen', 'Stage whole repository')}</span>
        </button>
      </div>
    </div>
  );
};
