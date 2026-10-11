import { FolderGit2, History, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n';
import { DangerConfirm } from './DangerConfirm';
import type { RecoveryCenterProps } from './recovery-center/recoveryCenterUtils';
import { useRecoveryCenter } from './recovery-center/useRecoveryCenter';
import { RecoveryHistory } from './recovery-center/RecoveryHistory';
import { RecoveryActions } from './recovery-center/RecoveryActions';
import { RecoveryNotice } from './recovery-center/RecoveryNotice';

export function RecoveryCenter(props: RecoveryCenterProps) {
  const { tr } = useI18n();
  const state = useRecoveryCenter(props);
  const { entries, selected, isLoading, isBusy, isAvailable, loadReflog, loadIssue, dangerAction, setDangerAction } = state;
  return (
    <section className="recovery-center" aria-label={tr('Recovery Center', 'Recovery Center')}>
      <header className="recovery-center__intro">
        <p>{tr('Frühere Commits wiederfinden und auf einem neuen Branch weiterarbeiten.', 'Find earlier commits and continue working on a new branch.')}</p>
        <div className="recovery-center__intro-actions">
          <Button
            size="xs"
            variant="ghost"
            icon={isLoading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
            disabled={isLoading || isBusy || !props.repoPath || !isAvailable}
            onClick={() => void loadReflog()}
          >
            {tr('Aktualisieren', 'Refresh')}
          </Button>
        </div>
      </header>
      {!props.repoPath || !isAvailable ? (
        <div className="recovery-center__empty">
          <FolderGit2 size={28} aria-hidden="true" />
          <h2>{!props.repoPath ? tr('Repository öffnen', 'Open a repository') : tr('Git ist nicht verfügbar', 'Git is unavailable')}</h2>
          <p>
            {!props.repoPath
              ? tr('Öffne zuerst ein lokales Repository, um dessen Wiederherstellungspunkte zu sehen.', 'Open a local repository to see its recovery points.')
              : tr('Prüfe die Git-Installation unter Einstellungen → App & Diagnose.', 'Check the Git installation in Settings → App & diagnostics.')}
          </p>
        </div>
      ) : (
        <div className="recovery-center__layout">
          <RecoveryHistory state={state} />
          <main className="recovery-center__detail" aria-label={tr('Ausgewählter Wiederherstellungspunkt', 'Selected recovery point')}>
            {entries.length > 0 && <RecoveryNotice issue={loadIssue} onRetry={() => void loadReflog()} busy={isLoading || isBusy} />}
            {selected ? (
              <RecoveryActions state={state} />
            ) : (
              <div className="recovery-center__empty">
                <History size={28} aria-hidden="true" />
                <h2>{tr('Einen früheren Stand auswählen', 'Choose an earlier state')}</h2>
                <p>
                  {tr(
                    'Wähle links einen Eintrag. Hier siehst du anschließend, wie du damit weiterarbeiten kannst.',
                    'Select an entry in the history. Recovery options will appear here.',
                  )}
                </p>
              </div>
            )}
          </main>
        </div>
      )}
      {dangerAction && (
        <DangerConfirm
          open
          title={dangerAction.title}
          message={dangerAction.message}
          contextItems={dangerAction.contextItems}
          irreversible={dangerAction.irreversible}
          consequences={dangerAction.consequences}
          confirmLabel={dangerAction.confirmLabel}
          onCancel={() => setDangerAction(null)}
          onConfirm={() => {
            setDangerAction(null);
            void dangerAction.run();
          }}
        />
      )}
    </section>
  );
}
