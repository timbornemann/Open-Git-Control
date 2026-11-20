import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import type { BranchBackupOverview } from '@/shared/ipc/branchRecovery';
import type { IpcResult } from '@/types/ipc';
import { branchBackupClient } from '@/services/branchRecoveryClient';
import { SettingsDisclosure, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

export function BranchBackupSettings({ variant }: Pick<SettingsSectionProps, 'variant'>) {
  const { tr, language } = useI18n();
  const [overview, setOverview] = useState<BranchBackupOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const available = branchBackupClient.isAvailable();

  const update = useCallback(async (read: () => Promise<IpcResult<BranchBackupOverview>>, interactive = false) => {
    const sequence = ++request.current;
    if (interactive) {
      setBusy(true);
      setError('');
    }
    try {
      const result = await read();
      if (request.current !== sequence) return;
      if (!result.success) throw new Error(result.error);
      setOverview(result.data);
    } catch (failure) {
      if (request.current === sequence) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (interactive && request.current === sequence) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!available || busy) return;
    void update(branchBackupClient.overview);
    const timer = setInterval(() => void update(branchBackupClient.overview), 5000);
    return () => clearInterval(timer);
  }, [available, busy, update]);

  if (!available) return null;
  return (
    <SettingsDisclosure title={tr('Git-Commit-Sicherungen', 'Git commit backups')}>
      <SettingsSwitch
        variant={variant}
        label={tr('Geöffnete Repositorys sichern', 'Back up open repositories')}
        description={tr(
          'Sichert lokale Branchstände bei Änderungen. Drei geprüfte Bundles je Repository werden aufbewahrt.',
          'Backs up local branch tips when they change. Three verified bundles are retained per repository.',
        )}
        checked={overview?.enabled ?? false}
        disabled={busy || !overview?.directory}
        onChange={(enabled) => void update(() => branchBackupClient.enable(enabled), true)}
      />
      <div className="settings-inline-actions">
        <Button disabled={busy} onClick={() => void update(branchBackupClient.chooseDirectory, true)}>
          {tr('Zielverzeichnis auswählen …', 'Choose destination …')}
        </Button>
        {overview?.directory && <code>{overview.directory}</code>}
      </div>
      {error && (
        <p className="storage-error" role="alert">
          {error}
        </p>
      )}
      {overview?.enabled && overview.repositories.length > 0 && (
        <ul className="storage-files">
          {overview.repositories.map((repo) => (
            <li key={repo.repoPath}>
              <strong>{repo.repoPath}</strong>
              {' · '}
              {repo.verifiedAt
                ? new Date(repo.verifiedAt).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')
                : tr('Noch keine geprüfte Sicherung', 'No verified backup yet')}
              {repo.lastError && <p className="storage-error">{repo.lastError}</p>}
            </li>
          ))}
        </ul>
      )}
    </SettingsDisclosure>
  );
}
