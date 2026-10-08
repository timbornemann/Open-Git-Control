import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { GitJobEventDto } from '@/types/aiDtos';
import { useI18n } from '@/i18n';
import { ReleaseNotesContent } from '../ReleaseNotesContent';
import type { SettingsAiUpdaterState } from '../hooks/useSettingsAiUpdater';
import {
  actionRowClass,
  hintClass,
  SettingsDisclosure,
  SettingsSection,
  SettingsSwitch,
  type SettingsLayoutVariant,
  type SettingsSectionProps,
} from './SettingsSectionPrimitives';

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
      <dl className="settings-update-status">
        <div>
          <dt>
            {variant === 'sidebar'
              ? t('generated.components.layout.sidebar.settingssidebarcontent.version_10b7f1cc')
              : t('generated.components.layout.settingsmaincontent.installed_version_56ac4ebd')}
          </dt>
          <dd>{ai.installedVersion}</dd>
        </div>
        <div>
          <dt>{t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}</dt>
          <dd>{ai.updaterStatusLabel}</dd>
        </div>
        {ai.updaterStatus?.availableVersion && (
          <div>
            <dt>
              {variant === 'sidebar'
                ? t('generated.components.layout.sidebar.settingssidebarcontent.available_d7ca5b14')
                : t('generated.components.layout.settingsmaincontent.available_version_9754cbd3')}
            </dt>
            <dd>{ai.updaterStatus.availableVersion}</dd>
          </div>
        )}
        {ai.updaterStatus?.lastCheckedAt && (
          <div>
            <dt>
              {variant === 'sidebar'
                ? t('generated.components.layout.sidebar.settingssidebarcontent.checked_16535227')
                : t('generated.components.layout.settingsmaincontent.last_checked_bd036721')}
            </dt>
            <dd>{new Date(ai.updaterStatus.lastCheckedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</dd>
          </div>
        )}
      </dl>
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
        <Button onClick={ai.handleRunOneClickUpdate} disabled={ai.oneClickUpdateDisabled}>
          {ai.oneClickUpdateLabel}
        </Button>
      </div>
    </>
  );

  return (
    <SettingsSection group="updates" variant={variant}>
      {content}
    </SettingsSection>
  );
};

export const SettingsReleaseNotesCard = ({ releaseNotes }: { releaseNotes: string | null | undefined }) => {
  const { t } = useI18n();
  if (!releaseNotes) return null;
  return (
    <SettingsDisclosure title={t('generated.components.layout.settingsmaincontent.release_notes_0b482d7f')}>
      <ReleaseNotesContent className="settings-release-notes" releaseNotes={releaseNotes} />
    </SettingsDisclosure>
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
  const { t, tr } = useI18n();
  const statusLabels = {
    start: tr('Gestartet', 'Started'),
    progress: tr('Läuft', 'Running'),
    done: tr('Abgeschlossen', 'Completed'),
    failed: tr('Fehlgeschlagen', 'Failed'),
    cancelled: tr('Abgebrochen', 'Cancelled'),
  };
  const content = (
    <>
      {jobs.length === 0 && <p className={hintClass(variant)}>{t('generated.components.layout.settingsmaincontent.no_jobs_available_87989fb1')}</p>}
      {jobs.map((job) =>
        variant === 'sidebar' ? (
          <div key={job.eventId ?? `${job.id}-${job.timestamp}-${job.status}-${job.message ?? ''}`} className="ssc-job-item">
            <div className="ssc-job-header">
              <span className="ssc-job-op">{job.operation}</span>
              <StatusBadge tone={job.status === 'failed' ? 'danger' : job.status === 'done' ? 'success' : 'neutral'}>{statusLabels[job.status]}</StatusBadge>
            </div>
            {job.message && <div className="ssc-job-msg">{job.message}</div>}
            <div className="ssc-job-time">{new Date(job.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          </div>
        ) : (
          <article key={job.eventId ?? `${job.id}-${job.timestamp}-${job.status}-${job.message ?? ''}`} className="settings-job-row">
            <div className="settings-job-top-row">
              <span>{job.operation}</span>
              <StatusBadge tone={job.status === 'failed' ? 'danger' : job.status === 'done' ? 'success' : 'neutral'}>{statusLabels[job.status]}</StatusBadge>
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

  return (
    <SettingsSection
      group="jobs"
      variant={variant}
      actions={
        <Button onClick={onClearJobs} disabled={!jobs.length}>
          {t('generated.components.layout.settingsmaincontent.clear_156e0575')}
        </Button>
      }
    >
      <div className="settings-job-list">{content}</div>
    </SettingsSection>
  );
};
