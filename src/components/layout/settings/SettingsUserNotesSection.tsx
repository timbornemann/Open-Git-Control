import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useNotificationDialog } from '@/components/ui/notificationDialogs';
import { UserNotesDialog } from '@/components/user-notes/UserNotesDialog';
import { useUserNotesStatus } from '@/components/user-notes/useUserNotesStatus';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import type { UserNoteSummaryDto } from '@/shared/userNotes';
import { actionRowClass, SettingsSection, SettingsSwitch, type SettingsSectionProps } from './SettingsSectionPrimitives';

export function SettingsUserNotesSection({ settings, onUpdateSettings, variant }: SettingsSectionProps) {
  const { tr } = useI18n();
  const status = useUserNotesStatus();
  const { dialogOpen, openDialog, closeDialog } = useNotificationDialog(1);
  const [pages, setPages] = useState<UserNoteSummaryDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const check = async () => {
    setChecking(true);
    setError('');
    try {
      const result = await appClient.checkUserNotes();
      if (!result.success) setError(result.error || tr('Prüfung fehlgeschlagen.', 'Check failed.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setChecking(false);
    }
  };
  return (
    <SettingsSection group="user-notes" variant={variant}>
      <SettingsSwitch
        variant={variant}
        checked={settings.userNotesCheckEnabled !== false}
        label={tr('Automatisch nach Nutzerhinweisen suchen', 'Automatically check for user notices')}
        description={tr(
          'Beim Start und alle vier Stunden auf GitHub prüfen. Gespeicherte Hinweise bleiben offline lesbar.',
          'Check GitHub at startup and every four hours. Saved notices remain available offline.',
        )}
        onChange={(checked) => void onUpdateSettings({ userNotesCheckEnabled: checked })}
      />
      <p role="status">
        {checking || status?.state === 'checking'
          ? tr('Hinweise werden geprüft …', 'Checking notices …')
          : status?.lastCheckedAt
            ? `${tr('Letzte erfolgreiche Prüfung', 'Last successful check')}: ${new Date(status.lastCheckedAt).toLocaleString(settings.language === 'de' ? 'de-DE' : 'en-US')}`
            : tr('Noch keine erfolgreiche Prüfung.', 'No successful check yet.')}
      </p>
      {(error || status?.error) && (
        <p role="alert" className="user-notes-error">
          {error || status?.error}
        </p>
      )}
      <div className={actionRowClass(variant)}>
        <Button onClick={() => void check()} disabled={checking || status?.state === 'checking' || !appClient.isAvailable()}>
          {tr('Jetzt prüfen', 'Check now')}
        </Button>
      </div>
      <div className="user-notes-list">
        {!status?.notes.length && <p>{tr('Keine gespeicherten Nutzerhinweise.', 'No saved user notices.')}</p>}
        {status?.notes.map((note) => (
          <Button
            key={note.id}
            variant="secondary"
            onClick={() => {
              setPages(status.notes);
              setSelectedId(note.id);
              openDialog();
            }}
          >
            {note.title} · {note.acknowledged ? tr('Bestätigt', 'Acknowledged') : tr('Neu', 'New')}
          </Button>
        ))}
      </div>
      <UserNotesDialog open={dialogOpen} pages={pages} initialId={selectedId} onClose={closeDialog} />
    </SettingsSection>
  );
}
