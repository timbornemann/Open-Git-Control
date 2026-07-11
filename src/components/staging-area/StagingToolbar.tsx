import { useI18n } from '@/i18n';

type StagingToolbarProps = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
};

export const StagingToolbar: React.FC<StagingToolbarProps> = ({ searchQuery, setSearchQuery }) => {
  const { t } = useI18n();

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
    </div>
  );
};
