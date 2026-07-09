import { useI18n } from '@/i18n';

type ReleaseCreatorHeaderProps = {
  repositoryLabel: string;
  lastReleaseTag?: string | null;
  targetForContext: string;
  commitsCount: number;
};

export const ReleaseCreatorHeader = ({ repositoryLabel, lastReleaseTag, targetForContext, commitsCount }: ReleaseCreatorHeaderProps) => {
  const { t } = useI18n();

  return (
    <>
      <header className="release-head-clean">
        <div>
          <p className="release-eyebrow">{t('generated.components.releasecreator.release_workflow_51d7eb43')}</p>
          <h1 className="release-title-clean">{t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}</h1>
          <p className="release-subtitle-clean">{t('generated.components.releasecreator.define_version_create_release_notes_and_publish_in_one_f_4f23c303')}</p>
        </div>
        <div className="release-repo-chip" title={repositoryLabel}>
          {repositoryLabel}
        </div>
      </header>

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
    </>
  );
};
