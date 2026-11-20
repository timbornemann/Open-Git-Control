import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n, type TranslateFn } from '@/i18n';
import type { BranchBackupOverview, BranchBackupRemoval, BranchBackupStatus } from '@/shared/ipc/branchRecovery';
import type { IpcResult } from '@/types/ipc';
import { branchBackupClient } from '@/services/branchRecoveryClient';
import { repoName } from '@/components/local-repositories/localRepositorySelectors';
import { SettingsDisclosure, SettingsSection, SettingsSwitch } from './SettingsSectionPrimitives';
import { formatStorageBytes } from './storageLabels';
import './branchBackupSettings.css';

export function BranchBackupSettings() {
  const { tr } = useI18n();
  const available = branchBackupClient.isAvailable();
  const [overview, setOverview] = useState<BranchBackupOverview | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await branchBackupClient.overview();
      if (current !== generation.current) return;
      if (!result.success) throw new Error(result.error);
      setOverview(result.data);
    } catch (failure) {
      if (current === generation.current) setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);

  useEffect(() => {
    if (!available || action) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [action, available, refresh]);

  const perform = async <T,>(key: string, task: () => Promise<IpcResult<T>>, accepted: (value: T) => void) => {
    if (action) return;
    generation.current++;
    setAction(key);
    setError('');
    setNotice('');
    try {
      const result = await task();
      if (!result.success) throw new Error(result.error);
      accepted(result.data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setAction(null);
    }
  };

  const change = (task: () => Promise<IpcResult<BranchBackupOverview>>) => void perform('settings', task, setOverview);
  const backup = (repoPath: string) =>
    void perform(
      repoPath,
      () => branchBackupClient.backupNow(repoPath),
      (outcome) => {
        const messages = {
          created: tr('Sicherung erstellt und geprüft.', 'Backup created and verified.'),
          'up-to-date': tr('Der aktuelle Branchstand ist bereits gesichert.', 'The current branch tips are already backed up.'),
          empty: tr('Das Repository enthält noch keine lokalen Branch-Commits.', 'This repository has no local branch commits yet.'),
        };
        setNotice(messages[outcome]);
      },
    );
  const remove = (selection: BranchBackupRemoval) =>
    void perform(
      'remove',
      () => branchBackupClient.remove(selection),
      (count) => {
        if (count)
          setNotice(count === 1 ? tr('Eine Sicherung gelöscht.', 'One backup deleted.') : tr(`${count} Sicherungen gelöscht.`, `${count} backups deleted.`));
      },
    );

  const registered = overview?.repositories.filter((repo) => repo.registered) ?? [];
  const selected = registered.filter((repo) => repo.automatic).length;
  const query = search.trim().toLocaleLowerCase();
  const visible = (overview?.repositories ?? []).filter((repo) => !query || (repo.repoPath ?? repo.repositoryKey ?? '').toLocaleLowerCase().includes(query));
  const busy = action !== null;

  return (
    <SettingsSection
      group="branch-backups"
      actions={
        available && (
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={14} />}
            disabled={busy}
            onClick={() => {
              setError('');
              void refresh();
            }}
          >
            {tr('Aktualisieren', 'Refresh')}
          </Button>
        )
      }
    >
      {!available && <p>{tr('Repository-Sicherungen stehen in der Desktop-App zur Verfügung.', 'Repository backups are available in the desktop app.')}</p>}
      {available && !overview && !error && <p role="status">{tr('Sicherungen werden geladen …', 'Loading backups …')}</p>}
      {error && (
        <p className="storage-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="backup-notice" role="status">
          {notice}
        </p>
      )}
      {action === 'remove' && <p role="status">{tr('Sicherungsauswahl wird geprüft …', 'Checking selected backups …')}</p>}
      {overview && (
        <div className="backup-settings">
          <SettingsSwitch
            variant="main"
            label={tr('Automatische Sicherungen aktivieren', 'Enable automatic backups')}
            description={tr(
              'Prüft ausgewählte Repositorys alle 15 Minuten und behält bis zu drei Versionen.',
              'Checks selected repositories every 15 minutes and keeps up to three versions.',
            )}
            checked={overview.enabled}
            disabled={busy}
            onChange={(enabled) => change(() => branchBackupClient.enable(enabled))}
          />
          <div className="backup-destination">
            <div className="backup-destination-path">
              <span>
                <FolderOpen size={16} aria-hidden="true" /> {tr('Speicherort', 'Backup destination')}
              </span>
              <code>{overview.directory}</code>
              {overview.directory === overview.defaultDirectory && <small>{tr('Standardordner', 'Default folder')}</small>}
            </div>
            <div className="settings-inline-actions">
              <Button size="sm" disabled={busy} onClick={() => change(branchBackupClient.chooseDirectory)}>
                {tr('Ordner auswählen …', 'Choose folder …')}
              </Button>
              {overview.directory !== overview.defaultDirectory && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => change(branchBackupClient.resetDirectory)}>
                  {tr('Standardordner verwenden', 'Use default folder')}
                </Button>
              )}
            </div>
          </div>
          {overview.directoryError ? (
            <p className="storage-error" role="alert">
              {tr('Speicherort nicht erreichbar', 'Backup destination unavailable')} · {overview.directoryError}
            </p>
          ) : (
            <div className="backup-total">
              <HardDrive size={16} aria-hidden="true" />
              <strong>{formatStorageBytes(overview.totalBytes)}</strong>
              <span>
                {versionCount(overview.versionCount, tr)} {tr('am Speicherort', 'at this destination')}
              </span>
            </div>
          )}
          <div className="backup-list-tools">
            <TextField
              type="search"
              aria-label={tr('Repositorys filtern', 'Filter repositories')}
              placeholder={tr('Repositorys filtern …', 'Filter repositories …')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="settings-inline-actions">
              <Button size="sm" disabled={busy || selected === registered.length} onClick={() => change(() => branchBackupClient.select({ automatic: true }))}>
                {tr('Alle auswählen', 'Select all')}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || selected === 0} onClick={() => change(() => branchBackupClient.select({ automatic: false }))}>
                {tr('Alle abwählen', 'Deselect all')}
              </Button>
            </div>
            <span className="storage-hint">
              {tr(
                `${selected} von ${registered.length} für automatische Sicherung ausgewählt`,
                `${selected} of ${registered.length} selected for automatic backup`,
              )}
            </span>
          </div>
          {visible.length === 0 && (
            <p className="storage-hint">
              {query
                ? tr('Keine passenden Repositorys.', 'No matching repositories.')
                : tr('Füge ein lokales Repository hinzu, um es hier zu sichern.', 'Add a local repository to back it up here.')}
            </p>
          )}
          <ul className="backup-repositories">
            {visible.map((repo) => (
              <li key={repo.registered ? repo.repoPath! : repo.repositoryKey!}>
                <RepositoryBackupRow
                  repo={repo}
                  disabled={busy}
                  directoryAvailable={!overview.directoryError}
                  saving={action === repo.repoPath || repo.busy}
                  onAutomatic={(automatic) => {
                    if (repo.repoPath) change(() => branchBackupClient.select({ repoPath: repo.repoPath!, automatic }));
                  }}
                  onBackup={() => {
                    if (repo.repoPath) backup(repo.repoPath);
                  }}
                  onRemove={(versionId) => {
                    if (repo.repositoryKey) remove({ repositoryKey: repo.repositoryKey, versionId });
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsSection>
  );
}

function RepositoryBackupRow({
  repo,
  disabled,
  directoryAvailable,
  saving,
  onAutomatic,
  onBackup,
  onRemove,
}: {
  repo: BranchBackupStatus;
  disabled: boolean;
  directoryAvailable: boolean;
  saving: boolean;
  onAutomatic: (automatic: boolean) => void;
  onBackup: () => void;
  onRemove: (versionId?: string) => void;
}) {
  const { tr, language } = useI18n();
  const date = (value: number) => new Date(value).toLocaleString(language === 'de' ? 'de-DE' : 'en-US');
  const name = repo.repoPath ? repoName(repo.repoPath) : tr('Unbekanntes Repository', 'Unknown repository');
  const count = repo.versions.length;
  const size = formatStorageBytes(repo.versions.reduce((sum, version) => sum + version.bytes, 0));
  return (
    <article className="backup-repository" aria-label={name}>
      <div className="backup-repository-header">
        <div className="backup-repository-path">
          <strong>{name}</strong>
          <code>{repo.repoPath ?? repo.repositoryKey}</code>
          {!repo.registered && (
            <small>{tr('Sicherungen eines nicht mehr eingebundenen Repositorys', 'Backups of a repository that is no longer registered')}</small>
          )}
        </div>
        <div className="backup-repository-summary">
          {directoryAvailable && (
            <strong>
              {versionCount(count, tr)} · {size}
            </strong>
          )}
          {repo.verifiedAt && (
            <small>
              {tr('Zuletzt geprüft', 'Last verified')} · {date(repo.verifiedAt)}
            </small>
          )}
        </div>
      </div>
      {repo.registered && (
        <div className="backup-repository-controls">
          <SettingsSwitch
            variant="main"
            compact
            label={tr('Automatisch sichern', 'Back up automatically')}
            checked={repo.automatic}
            disabled={disabled}
            onChange={onAutomatic}
          />
          <Button size="sm" disabled={disabled || !directoryAvailable || saving} onClick={onBackup}>
            {saving ? tr('Sicherung läuft …', 'Backing up …') : tr('Jetzt sichern', 'Back up now')}
          </Button>
        </div>
      )}
      {repo.lastError && <p className="storage-error">{repo.lastError}</p>}
      {count > 0 && (
        <SettingsDisclosure title={tr('Sicherungsversionen', 'Backup versions')}>
          <ul className="backup-versions">
            {repo.versions.map((version, index) => (
              <li key={version.id}>
                <span>
                  <time dateTime={new Date(version.verifiedAt).toISOString()}>{date(version.verifiedAt)}</time>
                  {index === 0 && <small> · {tr('Neueste', 'Newest')}</small>}
                </span>
                <span>{formatStorageBytes(version.bytes)}</span>
                <Button size="xs" variant="ghost" disabled={disabled || saving} onClick={() => onRemove(version.id)}>
                  {tr('Löschen …', 'Delete …')}
                </Button>
              </li>
            ))}
          </ul>
          {count > 1 && (
            <Button size="sm" disabled={disabled || saving} onClick={() => onRemove()}>
              {tr('Nur neueste Version behalten …', 'Keep newest version only …')}
            </Button>
          )}
        </SettingsDisclosure>
      )}
    </article>
  );
}

const versionCount = (count: number, tr: TranslateFn) => (count === 1 ? tr('1 Version', '1 version') : tr(`${count} Versionen`, `${count} versions`));
