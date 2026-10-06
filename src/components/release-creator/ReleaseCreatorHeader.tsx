import { useI18n } from '@/i18n';

type ReleaseCreatorHeaderProps = {
  lastReleaseTag?: string | null;
  targetForContext: string;
  commitsCount: number;
};

export const ReleaseCreatorHeader = ({ lastReleaseTag, targetForContext, commitsCount }: ReleaseCreatorHeaderProps) => {
  const { t } = useI18n();

  return (
    <section className="release-info-bar">
      <div className="release-info-item">
        <span>{t('generated.components.releasecreator.last_release_2873fe8a')}</span>
        <strong>{lastReleaseTag || t('generated.components.releasecreator.none_0641cbc2')}</strong>
      </div>
      <div className="release-info-item">
        <span>{t('generated.components.releasecreator.target_3d406596')}</span>
        <strong>{targetForContext}</strong>
      </div>
      <div className="release-info-item">
        <span>{t('generated.components.releasecreator.commits_since_5f00f45c')}</span>
        <strong>{commitsCount}</strong>
      </div>
    </section>
  );
};
