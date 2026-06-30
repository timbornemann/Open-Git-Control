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
  const { tr } = useI18n();

  if (!isCloning && !cloneFinished && !cloneError) return null;

  const isRunning = isCloning && !cloneFinished && !cloneError;

  return (
    <div className="git-transfer-backdrop">
      <div className="git-transfer-modal" role="dialog" aria-modal="true" aria-label={tr('Repository klonen', 'Clone repository')}>
        <div className="git-transfer-modal-header">
          <DownloadCloud size={18} className="git-transfer-header-icon" aria-hidden="true" />
          <span className="git-transfer-modal-title">
            {tr('Klone', 'Cloning')}: {cloneRepoName || tr('Repository', 'Repository')}
          </span>
          <div className="git-transfer-header-spacer" />
          {isRunning && <div className="clone-spinner" />}
          {cloneFinished && <span className="git-transfer-header-state complete">{tr('Fertig', 'Done')}</span>}
          {cloneError && <span className="git-transfer-header-state error">{tr('Fehler', 'Error')}</span>}
        </div>

        <GitTransferProgressPanel
          lines={cloneLog}
          isRunning={isRunning}
          isComplete={cloneFinished}
          error={cloneError}
          emptyText={tr('Starte Clone-Prozess...', 'Starting clone process...')}
        />

        {(cloneFinished || cloneError) && (
          <div className="git-transfer-modal-footer">
            <button type="button" className="git-transfer-close-button" onClick={onClose}>
              {tr('Schliessen', 'Close')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
