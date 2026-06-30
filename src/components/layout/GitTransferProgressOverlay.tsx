import React from 'react';
import { DownloadCloud } from 'lucide-react';
import type { GitJobEventDto } from '../../global';
import { useI18n } from '../../i18n';
import { GitTransferProgressPanel } from './GitTransferProgressPanel';

type Props = {
  open: boolean;
  title: string | null;
  events: GitJobEventDto[];
};

export const GitTransferProgressOverlay: React.FC<Props> = ({
  open,
  title,
  events,
}) => {
  const { tr } = useI18n();

  if (!open) return null;

  const lines = events
    .map((event) => event.message)
    .filter((message): message is string => Boolean(message && message.trim()));

  return (
    <div className="git-transfer-backdrop" role="presentation">
      <div className="git-transfer-modal git-transfer-modal-compact" role="status" aria-live="polite">
        <div className="git-transfer-modal-header">
          <DownloadCloud size={18} className="git-transfer-header-icon" aria-hidden="true" />
          <span className="git-transfer-modal-title">
            {title || tr('GitHub-Aktualisierung laeuft...', 'GitHub update running...')}
          </span>
          <div className="git-transfer-header-spacer" />
          <div className="clone-spinner" />
        </div>

        <GitTransferProgressPanel
          lines={lines}
          isRunning={true}
          emptyText={tr('Git wartet auf Fortschritt...', 'Waiting for git progress...')}
        />
      </div>
    </div>
  );
};
