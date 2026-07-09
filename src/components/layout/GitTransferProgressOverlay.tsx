import React from 'react';
import { DownloadCloud } from 'lucide-react';
import type { GitJobEventDto } from '@/types/aiDtos';
import { useI18n } from '@/i18n';
import { GitTransferProgressPanel } from './GitTransferProgressPanel';

type Props = {
  open: boolean;
  title: string | null;
  events: GitJobEventDto[];
};

export const GitTransferProgressOverlay: React.FC<Props> = ({ open, title, events }) => {
  const { t } = useI18n();

  if (!open) return null;

  const lines = events.map((event) => event.message).filter((message): message is string => Boolean(message && message.trim()));

  return (
    <div className="git-transfer-backdrop" role="presentation">
      <div className="git-transfer-modal git-transfer-modal-compact" role="status" aria-live="polite">
        <div className="git-transfer-modal-header">
          <DownloadCloud size={18} className="git-transfer-header-icon" aria-hidden="true" />
          <span className="git-transfer-modal-title">
            {title || t('generated.components.layout.gittransferprogressoverlay.github_update_running_3a747d60')}
          </span>
          <div className="git-transfer-header-spacer" />
          <div className="clone-spinner" />
        </div>

        <GitTransferProgressPanel
          lines={lines}
          isRunning={true}
          emptyText={t('generated.components.layout.gittransferprogressoverlay.waiting_for_git_progress_66cb9173')}
        />
      </div>
    </div>
  );
};
