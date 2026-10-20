import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { GitJobEventDto } from '@/types/aiDtos';
import { useI18n } from '@/i18n';
import { useState } from 'react';
import { appClient } from '@/services/appClient';
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
  const { t, tr } = useI18n();
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [openingRecovery, setOpeningRecovery] = useState(false);
  const openRecovery = async () => {
    setOpeningRecovery(true);
    try {
      const result = await appClient.openRecoveryUpdater();
      setRecoveryMessage(
        result.success
          ? tr('Der unabhängige Notfall-Updater wurde geöffnet.', 'The independent recovery updater has opened.')
          : result.error || tr('Start fehlgeschlagen.', 'Could not open the recovery updater.'),
      );
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningRecovery(false);
    }
  };
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
        checked={settings.autoUpdateCheckEnabled !== false}
        label={tr('Automatisch nach App-Updates suchen', 'Automatically check for app updates')}
        description={tr(
          'Beim Ausschalten werden keine automatischen Update-Abfragen an GitHub gesendet.',
          'When disabled, no automatic update checks are sent to GitHub.',
        )}
        onChange={(checked) => void onUpdateSettings({ autoUpdateCheckEnabled: checked })}
      />
      <SettingsSwitch
        variant={variant}
        compact={variant === 'sidebar'}
        checked={settings.autoUpdateEnabled}
        label={tr('Gefundene Updates automatisch herunterladen', 'Automatically download available updates')}
        description={tr('Gilt bei aktivierter automatischer Update-Suche.', 'Applies while automatic update checks are enabled.')}
        onChange={(checked) => void onUpdateSettings({ autoUpdateEnabled: checked })}
      />
      <div className={actionRowClass(variant)}>
        <Button onClick={ai.handleRunOneClickUpdate} disabled={ai.oneClickUpdateDisabled || ai.updaterStatus?.recoveryActive}>
          {ai.oneClickUpdateLabel}
        </Button>
        <Button variant="secondary" onClick={() => void openRecovery()} disabled={openingRecovery}>
          {tr('Notfall-Updater öffnen', 'Open recovery updater')}
        </Button>
      </div>
      <p className={hintClass(variant)}>
        {tr(
          'Eigenständiges Hilfsprogramm zum Aktualisieren, Reparieren oder Wiederherstellen einer älteren Version. Auch über den Programmeintrag erreichbar, wenn die App nicht startet.',
          'Independent helper to update, repair or restore an older version. Also available from its program shortcut when the app cannot start.',
        )}
      </p>
      {ai.updaterStatus?.recoveryActive && (
        <p className={hintClass(variant)} role="status">
          {tr(
            'Der Notfall-Updater ist aktiv. Updates in dieser App sind vorübergehend gesperrt.',
            'The recovery updater is active. Updates here are temporarily blocked.',
          )}
        </p>
      )}
      {recoveryMessage && (
        <p className={hintClass(variant)} role="status">
          {recoveryMessage}
        </p>
      )}
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
