import type { RemoteTransferProgressDto } from '@/types/remoteTransferProgress';
import type { NotificationMessage } from '@/types/notifications';

export function remoteTransferProgressNotification(
  transfer: RemoteTransferProgressDto,
  tr: (de: string, en: string) => string,
): Pick<NotificationMessage, 'msg' | 'detail' | 'progress'> {
  const { phase, remote } = transfer;
  if (phase === 'publishing')
    return {
      msg: tr(`Git-Push · ${remote}`, `Git push · ${remote}`),
      detail: tr(
        'Commits und Branches werden veröffentlicht. Warte auf die Bestätigung des Servers …',
        'Publishing commits and branches. Waiting for the server to confirm …',
      ),
      progress: { value: null, label: tr('Git-Push läuft', 'Git push in progress') },
    };
  const count = (value: number) => tr(value.toLocaleString('de-DE'), value.toLocaleString('en-US'));
  const bytes = (value: number) => {
    const unit = Math.min(4, Math.max(0, Math.floor(Math.log10(Math.max(1, value)) / 3)));
    const amount = Math.round((value / 1000 ** unit) * 10) / 10;
    return `${count(amount)} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
  };
  const hasBytes = transfer.totalBytes !== undefined && transfer.totalBytes > 0 && transfer.processedBytes !== undefined;
  const value = hasBytes && phase === 'lfs-upload' ? Math.min(99, Math.max(0, Math.floor((transfer.processedBytes! / transfer.totalBytes!) * 100))) : null;
  const objects =
    transfer.totalObjects !== undefined && transfer.processedObjects !== undefined
      ? tr(
          `${count(transfer.processedObjects)} / ${count(transfer.totalObjects)} LFS-Objekte verarbeitet`,
          `${count(transfer.processedObjects)} / ${count(transfer.totalObjects)} LFS objects processed`,
        )
      : undefined;
  return {
    msg:
      phase === 'lfs-finalizing'
        ? tr(`LFS wird abgeschlossen · ${remote}`, `Finalizing LFS · ${remote}`)
        : tr(`LFS-Upload · ${remote}`, `LFS upload · ${remote}`),
    detail: [
      objects,
      hasBytes && phase === 'lfs-upload'
        ? `${bytes(transfer.processedBytes!)} / ${bytes(transfer.totalBytes!)}${phase === 'lfs-upload' && transfer.speed ? ` · ${transfer.speed}` : ''}`
        : undefined,
      tr(
        'Bereits auf dem Server vorhandene Objekte zählen mit. Der Git-Push folgt danach.',
        'Objects already on the server are included. The Git push follows afterwards.',
      ),
    ]
      .filter(Boolean)
      .join('\n'),
    progress: { value, label: tr('Fortschritt der LFS-Phase', 'LFS phase progress') },
  };
}
