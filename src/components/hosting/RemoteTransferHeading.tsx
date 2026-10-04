import { useI18n } from '@/i18n';
import { openRemoteTransferDialog } from './remoteTransferDialogState';
import type { TransferMode } from './RemoteTransferPanel';

export function RemoteTransferHeading({ repoPath, mode, onClose }: { repoPath: string; mode: TransferMode; onClose?: () => void }) {
  const { tr } = useI18n();
  const title =
    mode === 'push'
      ? tr('Push-Ziele', 'Push targets')
      : mode === 'pull'
        ? tr('Pull-Quelle', 'Pull source')
        : mode === 'fetch'
          ? tr('Fetch-Quelle', 'Fetch source')
          : tr('Remotes & Übertragungen', 'Remotes & transfers');
  return (
    <header className="hosting-heading">
      <div>
        <h2>{title}</h2>
        <small>{repoPath}</small>
      </div>
      {mode !== 'remotes' && (
        <button onClick={() => openRemoteTransferDialog({ repoPath, mode: 'remotes' })}>
          {tr('Remotes und Konten verwalten', 'Manage remotes and accounts')}
        </button>
      )}
      {onClose && <button onClick={onClose}>{tr('Schließen', 'Close')}</button>}
    </header>
  );
}
