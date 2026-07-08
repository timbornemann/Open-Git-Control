import React from 'react';
import { DownloadCloud } from 'lucide-react';
import { useI18n } from '../../i18n';
import { GitTransferProgressPanel } from './GitTransferProgressPanel';

type Props = {
  isCloning: boolean;
  cloneRepoName: string | null;
  cloneFinished: boolean;
  cloneError: string | null;
  cloneLog: string[];
  onClose: () => void;
};

export const CloneProgressModal: React.FC<Props> = ({
  isCloning,
  cloneRepoName,
  cloneFinished,
  cloneError,
  cloneLog,
  onClose,
}) => {
  const { t } = useI18n();

  if (!isCloning && !cloneFinished && !cloneError) return null;

  const isRunning = isCloning && !cloneFinished && !cloneError;

  return (
    <div className="git-transfer-backdrop">
      <div className="git-transfer-modal" role="dialog" aria-modal="true" aria-label={t('generated.components.layout.cloneprogressmodal.clone_repository_25099131')}>
        <div className="git-transfer-modal-header">
          <DownloadCloud size={18} className="git-transfer-header-icon" aria-hidden="true" />
          <span className="git-transfer-modal-title">
            {t('generated.components.layout.cloneprogressmodal.cloning_7c6e2dc2')}: {cloneRepoName || t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb')}
          </span>
          <div className="git-transfer-header-spacer" />
          {isRunning && <div className="clone-spinner" />}
          {cloneFinished && <span className="git-transfer-header-state complete">{t('generated.components.layout.cloneprogressmodal.done_724fd90c')}</span>}
          {cloneError && <span className="git-transfer-header-state error">{t('generated.components.layout.cloneprogressmodal.error_7d62310f')}</span>}
        </div>

        <GitTransferProgressPanel
          lines={cloneLog}
          isRunning={isRunning}
          isComplete={cloneFinished}
          error={cloneError}
          emptyText={t('generated.components.layout.cloneprogressmodal.starting_clone_process_cdb1450a')}
        />

        {(cloneFinished || cloneError) && (
          <div className="git-transfer-modal-footer">
            <button type="button" className="git-transfer-close-button" onClick={onClose}>
              {t('generated.components.actiontoastviewport.close_181764fa')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
