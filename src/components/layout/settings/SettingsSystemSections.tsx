import type { GitJobEventDto } from '@/types/aiDtos';
import { useI18n } from '@/i18n';
import { ReleaseNotesContent } from '../ReleaseNotesContent';
import type { SettingsAiUpdaterState } from '../hooks/useSettingsAiUpdater';
import { actionRowClass, hintClass, SettingsSwitch, type SettingsLayoutVariant, type SettingsSectionProps } from './SettingsSectionPrimitives';

export const SettingsUpdatesSection = ({
  settings,
  onUpdateSettings,
  variant,
  ai,
  locale,
}: SettingsSectionProps & { ai: SettingsAiUpdaterState; locale: string }) => {
  const { t } = useI18n();
  const content = (
    <>
      <p className={hintClass(variant)}>
        {variant === 'sidebar'
          ? t('generated.components.layout.sidebar.settingssidebarcontent.version_10b7f1cc')
          : t('generated.components.layout.settingsmaincontent.installed_version_56ac4ebd')}
        : {ai.installedVersion}
      </p>
      <p className={hintClass(variant)}>
        {t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}: {ai.updaterStatusLabel}
      </p>
      {ai.updaterStatus?.availableVersion && (
        <p className={hintClass(variant)}>
          {variant === 'sidebar'
            ? t('generated.components.layout.sidebar.settingssidebarcontent.available_d7ca5b14')
            : t('generated.components.layout.settingsmaincontent.available_version_9754cbd3')}
          : {ai.updaterStatus.availableVersion}
        </p>
      )}
      {ai.updaterStatus?.lastCheckedAt && (
        <p className={hintClass(variant)}>
          {variant === 'sidebar'
            ? t('generated.components.layout.sidebar.settingssidebarcontent.checked_16535227')
            : t('generated.components.layout.settingsmaincontent.last_checked_bd036721')}
          : {new Date(ai.updaterStatus.lastCheckedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}
      {ai.updaterStatus?.state === 'downloading' && (
        <p className={hintClass(variant)}>
          {t('generated.components.layout.settingsmaincontent.download_d9eb7f3e')}: {(ai.updaterStatus.downloadPercent || 0).toFixed(1)}% (
          {ai.formatBytes(ai.updaterStatus.transferred)} / {ai.formatBytes(ai.updaterStatus.total)})
        </p>
      )}
      {variant === 'sidebar' && ai.updaterStatus?.releaseNotes && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            {t('generated.components.layout.settingsmaincontent.release_notes_0b482d7f')}
          </summary>
          <div style={{ marginTop: '6px' }}>
            <ReleaseNotesContent className="ssc-hint ssc-release-notes" releaseNotes={ai.updaterStatus.releaseNotes} />
          </div>
        </details>
      )}
      {ai.updaterStatus?.error && (
        <p
          className={hintClass(variant, variant === 'main' ? 'settings-danger' : undefined)}
          style={variant === 'sidebar' ? { color: 'var(--status-danger)' } : undefined}
        >
          {ai.updaterStatus.error}
        </p>
      )}
      {ai.updaterMessage && (
        <p className={hintClass(variant)} style={variant === 'sidebar' ? { whiteSpace: 'pre-wrap' } : undefined}>
          {ai.updaterMessage}
        </p>
      )}
      {!ai.updaterSupported && (
        <p className={hintClass(variant)}>
          {variant === 'sidebar'
            ? t('generated.components.layout.sidebar.settingssidebarcontent.only_available_in_installed_builds_eacd8bec')
            : t('generated.components.layout.settingsmaincontent.auto_updates_are_only_available_in_installed_production_abb1a98e')}
        </p>
      )}
      <SettingsSwitch
        variant={variant}
        compact={variant === 'sidebar'}
        checked={settings.autoUpdateEnabled}
        label={
          variant === 'sidebar'
            ? t('generated.components.layout.sidebar.settingssidebarcontent.automatically_check_and_download_updates_6ffcd411')
            : t('generated.components.layout.settingsmaincontent.automatically_check_and_download_updates_in_the_backgrou_dbe47c67')
        }
        onChange={(checked) => void onUpdateSettings({ autoUpdateEnabled: checked })}
      />
      <div className={actionRowClass(variant)}>
        <button className="staging-tool-btn" onClick={ai.handleRunOneClickUpdate} disabled={ai.oneClickUpdateDisabled}>
          {ai.oneClickUpdateLabel}
        </button>
      </div>
    </>
  );

  return variant === 'sidebar' ? (
    <div className="ssc-section">
      <div className="ssc-section-title">{t('generated.components.layout.settingsmaincontent.app_updates_c9f65ab0')}</div>
      {content}
    </div>
  ) : (
    <section className="settings-card">
      <h3>{t('generated.components.layout.settingsmaincontent.app_updates_c9f65ab0')}</h3>
      {content}
    </section>
  );
};

export const SettingsReleaseNotesCard = ({ releaseNotes }: { releaseNotes: string | null | undefined }) => {
  const { t } = useI18n();
  if (!releaseNotes) return null;
  return (
    <section className="settings-card">
      <h3>{t('generated.components.layout.settingsmaincontent.release_notes_0b482d7f')}</h3>
      <ReleaseNotesContent className="settings-release-notes" releaseNotes={releaseNotes} />
    </section>
  );
};

export const SettingsJobsSection = ({
  jobs,
  onClearJobs,
  variant,
  locale,
}: {
  jobs: GitJobEventDto[];
  onClearJobs: () => void;
  variant: SettingsLayoutVariant;
  locale: string;
}) => {
  const { t } = useI18n();
  const content = (
    <>
      {jobs.length === 0 && <p className={hintClass(variant)}>{t('generated.components.layout.settingsmaincontent.no_jobs_available_87989fb1')}</p>}
      {jobs.map((job) =>
        variant === 'sidebar' ? (
          <div key={job.eventId ?? `${job.id}-${job.timestamp}-${job.status}-${job.message ?? ''}`} className="ssc-job-item">
            <div className="ssc-job-header">
              <span className="ssc-job-op">{job.operation}</span>
              <span className={`ssc-job-status${job.status === 'failed' ? ' failed' : ''}`}>{job.status}</span>
            </div>
            {job.message && <div className="ssc-job-msg">{job.message}</div>}
            <div className="ssc-job-time">{new Date(job.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          </div>
        ) : (
          <article key={job.eventId ?? `${job.id}-${job.timestamp}-${job.status}-${job.message ?? ''}`} className="settings-job-row">
            <div className="settings-job-top-row">
              <span>{job.operation}</span>
              <span className={job.status === 'failed' ? 'settings-danger' : ''}>{job.status}</span>
            </div>
            {job.message && <div className="settings-job-message">{job.message}</div>}
            <div className="settings-job-time">
              {new Date(job.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </article>
        ),
      )}
    </>
  );

  if (variant === 'sidebar') {
    return (
      <div className="ssc-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="ssc-section-title">{t('generated.components.layout.settingsmaincontent.job_center_a5f9bea9')}</div>
          <button className="staging-tool-btn" onClick={onClearJobs}>
            {t('generated.components.layout.settingsmaincontent.clear_156e0575')}
          </button>
        </div>
        {content}
      </div>
    );
  }

  return (
    <section className="settings-card settings-card-full">
      <div className="settings-card-header-row">
        <h3>{t('generated.components.layout.settingsmaincontent.job_center_a5f9bea9')}</h3>
        <button className="staging-tool-btn" onClick={onClearJobs}>
          {t('generated.components.layout.settingsmaincontent.clear_156e0575')}
        </button>
      </div>
      {content}
    </section>
  );
};
