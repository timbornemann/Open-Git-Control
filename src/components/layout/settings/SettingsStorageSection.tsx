import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { storageClient } from '@/services/storageClient';
import type { CompletedRecoveryBackup, MaintenanceRequest, StorageOverview } from '@/shared/ipc/storageMaintenance';
import { SettingsDisclosure, SettingsSection, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';
import { formatStorageBytes, storageCategoryLabel, storageReasonLabel } from './storageLabels';
import './settingsStorage.css';

export function SettingsStorageSection({ settings, onUpdateSettings, variant }: SettingsSectionProps) {
  const { tr } = useI18n();
  const [overview, setOverview] = useState<StorageOverview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [backups, setBackups] = useState<CompletedRecoveryBackup[] | null>(null),
    [chosen, setChosen] = useState<Set<string>>(new Set());
  const available = storageClient.isAvailable();
  const receive = useCallback((next: StorageOverview) => setOverview((prior) => (!prior || next.checkedAt >= prior.checkedAt ? next : prior)), []);
  const perform = useCallback(
    async (request?: MaintenanceRequest) => {
      setBusy(true);
      setError('');
      try {
        const result = await (request ? storageClient.run(request) : storageClient.inspect());
        if (!result.success) throw new Error(result.error);
        receive(result.data);
      } catch (failure) {
        setError(String(failure instanceof Error ? failure.message : failure));
      } finally {
        setBusy(false);
      }
    },
    [receive],
  );
  useEffect(() => {
    if (!available) return;
    const unsubscribe = storageClient.subscribe(receive);
    void perform();
    return unsubscribe;
  }, [available, perform, receive]);
  const loadRecovery = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await storageClient.recovery();
      if (!result.success) throw new Error(result.error);
      setBackups(result.data);
      setChosen(new Set());
    } catch (failure) {
      setError(String(failure instanceof Error ? failure.message : failure));
    } finally {
      setBusy(false);
    }
  };
  const recoveryRepos = [...new Set(backups?.map((entry) => entry.repoPath))];
  return (
    <SettingsSection group="storage" variant={variant}>
      <SettingsSwitch
        variant={variant}
        checked={settings.automaticMaintenanceEnabled !== false}
        label={tr('Automatische Datenpflege', 'Automatic data maintenance')}
        description={tr(
          'Erste Prüfung nach 30 Sekunden, danach alle sechs Stunden. Alte Bestandsdaten erhalten neue Beobachtungsfristen.',
          'First check after 30 seconds, then every six hours. Existing data starts with new observation periods.',
        )}
        onChange={(enabled) => {
          void onUpdateSettings({ automaticMaintenanceEnabled: enabled }).catch((failure) => setError(String(failure)));
        }}
      />
      <p className="storage-hint">
        {tr(
          'Repository-Dateien, Planung, Einstellungen, Anmeldungen und Wiederherstellungsdaten bleiben geschützt. Das Cache-Budget gilt nur für wiederherstellbare Daten.',
          'Repository files, planning, settings, logins and recovery data remain protected. The cache budget applies only to rebuildable data.',
        )}
      </p>
      <div className="settings-inline-actions">
        <Button disabled={!available || busy} onClick={() => void perform()}>
          {tr('Jetzt prüfen', 'Check now')}
        </Button>
        <Button disabled={!available || busy || Boolean(overview?.blockedReason)} onClick={() => void perform({ mode: 'eligible' })}>
          {tr('Fällige Bereinigung ausführen', 'Run due cleanup')}
        </Button>
        <Button
          disabled={!available || busy || Boolean(overview?.blockedReason)}
          onClick={() => void perform({ mode: 'all-caches', categories: ['previews', 'analytics', 'statistics', 'http', 'code', 'auxiliary'] })}
        >
          {tr('Wiederherstellbare Caches leeren', 'Clear rebuildable caches')}
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {busy
          ? tr('Speicher wird geprüft …', 'Checking storage …')
          : overview
            ? tr(`Stand: ${new Date(overview.checkedAt).toLocaleString('de-DE')}`, `Checked: ${new Date(overview.checkedAt).toLocaleString('en-US')}`)
            : !available
              ? tr('Speicherprüfung ist in der Desktop-App verfügbar.', 'Storage checks are available in the desktop app.')
              : ''}
      </div>
      {error && (
        <p role="alert" className="storage-error">
          {error}
        </p>
      )}
      {overview?.blockedReason && (
        <p role="alert" className="storage-error">
          {tr('Bereinigung gesperrt: ', 'Cleanup blocked: ')}
          {overview.blockedReason}
        </p>
      )}
      {overview && (
        <>
          <div className="storage-table-scroll">
            <table className="storage-table">
              <thead>
                <tr>
                  <th>{tr('Datenbereich', 'Storage area')}</th>
                  <th>{tr('Verbrauch', 'Used')}</th>
                  <th>{tr('Budget', 'Budget')}</th>
                  <th>{tr('Bereinigbar', 'Reclaimable')}</th>
                </tr>
              </thead>
              <tbody>
                {overview.groups.map((group) => (
                  <tr key={group.category}>
                    <th scope="row">{storageCategoryLabel(group.category, tr)}</th>
                    <td>{formatStorageBytes(group.bytes)}</td>
                    <td>{group.budget === null ? '—' : formatStorageBytes(group.budget)}</td>
                    <td>{formatStorageBytes(group.reclaimableBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="storage-hint">
            {tr(
              'Analysen: höchstens 256 MiB je Repository. Browser-Caches werden über Electron geleert; Dateialter allein löst keine Löschung aus.',
              'Analytics: at most 256 MiB per repository. Browser caches are cleared through Electron; file age alone never triggers deletion.',
            )}
          </p>
          {overview.removedRepositories.some((entry) => entry.expiresAt > overview.checkedAt) && (
            <SettingsDisclosure title={tr('Entfernte Repositories wieder aufnehmen', 'Reopen removed repositories')}>
              {overview.removedRepositories
                .filter((entry) => entry.expiresAt > overview.checkedAt)
                .map((ticket) => (
                  <div className="storage-return" key={ticket.entry.path}>
                    <span>
                      {ticket.entry.path}
                      <small>
                        {tr('Rückkehrfrist bis ', 'Return period until ')}
                        {new Date(ticket.expiresAt).toLocaleDateString(settings.language === 'de' ? 'de-DE' : 'en-US')}
                      </small>
                    </span>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void storageClient
                          .restore(ticket.entry.path)
                          .then(async (result) => {
                            if (!result.success) throw new Error(result.error);
                            await perform();
                          })
                          .catch((failure) => setError(String(failure)))
                          .finally(() => setBusy(false));
                      }}
                    >
                      {tr('Wieder aufnehmen', 'Reopen')}
                    </Button>
                  </div>
                ))}
            </SettingsDisclosure>
          )}
          <SettingsDisclosure title={tr('Zuordnung, Schutz und unklare Daten', 'Associations, protection and unclear data')}>
            {overview.issues.length === 0 ? (
              <p>{tr('Keine unklaren Daten festgestellt.', 'No unclear data found.')}</p>
            ) : (
              <ul className="storage-issues">
                {overview.issues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`}>
                    <span>{storageReasonLabel(issue.reason, tr)}</span>
                    {issue.path && <code>{issue.path}</code>}
                  </li>
                ))}
              </ul>
            )}
          </SettingsDisclosure>
          <SettingsDisclosure title={tr('Bereinigungsberichte (höchstens 30 / 1 MiB)', 'Cleanup reports (at most 30 / 1 MiB)')}>
            {overview.reports
              .slice()
              .reverse()
              .map((report, index) => (
                <details key={`${report.startedAt}-${index}`}>
                  <summary>
                    {new Date(report.finishedAt).toLocaleString(settings.language === 'de' ? 'de-DE' : 'en-US')} · {formatStorageBytes(report.removedBytes)} ·{' '}
                    {report.removedFiles} {tr('Dateien', 'files')}
                  </summary>
                  {[...(report.removed || []), ...report.deferred].map((item, i) => (
                    <p key={i}>
                      {storageReasonLabel(item.reason, tr)}: <code>{item.path}</code>
                    </p>
                  ))}
                  {report.removedRepositories.map((repo) => (
                    <p key={repo}>
                      {tr('Seit 90 Tagen bestätigt fehlend: ', 'Confirmed missing for 90 days: ')}
                      <code>{repo}</code>
                    </p>
                  ))}
                  {report.errors.map((failure, i) => (
                    <p className="storage-error" key={i}>
                      {failure}
                    </p>
                  ))}
                </details>
              ))}
          </SettingsDisclosure>
        </>
      )}
      <SettingsDisclosure title={tr('Wiederherstellungssicherungen bewusst bereinigen', 'Explicitly clean recovery backups')}>
        <p className="storage-hint">
          {tr(
            'Offene oder unklare Vorgänge bleiben erhalten. Abgeschlossene Sicherungen werden nur nach deiner Auswahl und Bestätigung entfernt.',
            'Open or unclear operations are retained. Completed backups are removed only after selection and confirmation.',
          )}
        </p>
        <Button disabled={!available || busy} onClick={() => void loadRecovery()}>
          {tr('Abgeschlossene Vorgänge anzeigen', 'Show completed operations')}
        </Button>
        {backups?.length === 0 && <p>{tr('Keine abgeschlossenen Vorgänge vorhanden.', 'No completed operations available.')}</p>}
        {recoveryRepos.map((repo) => (
          <fieldset className="storage-recovery" key={repo}>
            <legend>{repo}</legend>
            {backups!
              .filter((entry) => entry.repoPath === repo)
              .map((entry) => (
                <label key={entry.id}>
                  <input
                    type="checkbox"
                    checked={chosen.has(`${repo}:${entry.id}`)}
                    onChange={(event) =>
                      setChosen((prior) => {
                        const next = new Set(prior);
                        if (event.target.checked) next.add(`${repo}:${entry.id}`);
                        else next.delete(`${repo}:${entry.id}`);
                        return next;
                      })
                    }
                  />
                  <span>
                    {new Date(entry.createdAt).toLocaleString(settings.language === 'de' ? 'de-DE' : 'en-US')}
                    <code>
                      {entry.objectId
                        ? entry.reference
                        : tr('Abgeschlossenes Journal ohne Git-Sicherungsreferenz', 'Completed journal without Git backup reference')}
                    </code>
                  </span>
                </label>
              ))}
            <Button
              disabled={busy || !backups!.some((entry) => entry.repoPath === repo && chosen.has(`${repo}:${entry.id}`))}
              onClick={() => {
                setBusy(true);
                setError('');
                void storageClient
                  .removeRecovery({
                    repoPath: repo,
                    ids: backups!.filter((entry) => entry.repoPath === repo && chosen.has(`${repo}:${entry.id}`)).map((entry) => entry.id),
                  })
                  .then(async (result) => {
                    if (!result.success) throw new Error(result.error);
                    await loadRecovery();
                  })
                  .catch((failure) => setError(String(failure)))
                  .finally(() => setBusy(false));
              }}
            >
              {tr('Ausgewählte Sicherungen entfernen …', 'Remove selected backups …')}
            </Button>
          </fieldset>
        ))}
      </SettingsDisclosure>
    </SettingsSection>
  );
}
