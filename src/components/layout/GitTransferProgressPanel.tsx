import React, { useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { summarizeGitTransferProgress } from '../../utils/gitTransferProgress';
import type {
  GitTransferPhaseKey,
  GitTransferPhaseProgress,
} from '../../utils/gitTransferProgress';

type Props = {
  lines: string[];
  isRunning: boolean;
  isComplete?: boolean;
  error?: string | null;
  emptyText: string;
};

const getPhaseLabel = (key: GitTransferPhaseKey, tr: (deText: string, enText: string) => string): string => {
  switch (key) {
    case 'enumerating':
      return tr('Objekte suchen', 'Enumerating');
    case 'counting':
      return tr('Objekte zaehlen', 'Counting');
    case 'compressing':
      return tr('Pack vorbereiten', 'Compressing');
    case 'receiving':
      return tr('Receiving / Download', 'Receiving / download');
    case 'resolving':
      return tr('Resolving', 'Resolving');
    case 'writing':
      return tr('Objekte schreiben', 'Writing objects');
    case 'updating':
      return tr('Dateien aktualisieren', 'Updating files');
    case 'checkingOut':
      return tr('Checkout', 'Checkout');
    default:
      return tr('Git-Fortschritt', 'Git progress');
  }
};

const formatPhaseMeta = (
  phase: GitTransferPhaseProgress,
  tr: (deText: string, enText: string) => string,
): string => {
  if (!phase.observed) return tr('Wartet', 'Waiting');

  const parts: string[] = [];
  if (phase.percent !== null) parts.push(`${phase.percent}%`);
  if (phase.current !== null && phase.total !== null) parts.push(`${phase.current}/${phase.total}`);
  if (phase.amount) parts.push(phase.amount);
  if (phase.speed) parts.push(phase.speed);
  if (parts.length > 0) return parts.join(' | ');

  return phase.done ? tr('Fertig', 'Done') : tr('Laeuft', 'Running');
};

export const GitTransferProgressPanel: React.FC<Props> = ({
  lines,
  isRunning,
  isComplete = false,
  error = null,
  emptyText,
}) => {
  const { tr } = useI18n();
  const summary = useMemo(() => summarizeGitTransferProgress(lines), [lines]);
  const statusText = error
    || (isComplete ? tr('Repository ist bereit.', 'Repository is ready.') : summary.latestLine || emptyText);

  return (
    <div className="git-transfer-panel">
      <div className="git-transfer-phase-list">
        {summary.phases.map((phase) => {
          const isIndeterminate = isRunning && phase.state === 'active' && phase.percent === null;
          const fillWidth = phase.percent === null ? 0 : phase.percent;

          return (
            <div
              key={phase.key}
              className={`git-transfer-phase git-transfer-phase-${phase.state}${phase.observed ? '' : ' git-transfer-phase-unseen'}`}
            >
              <div className="git-transfer-phase-topline">
                <div className="git-transfer-phase-title">
                  {phase.state === 'done' ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Loader2 size={14} aria-hidden="true" />
                  )}
                  <span>{getPhaseLabel(phase.key, tr)}</span>
                </div>
                <span className="git-transfer-phase-meta">{formatPhaseMeta(phase, tr)}</span>
              </div>
              <div className={`git-transfer-bar${isIndeterminate ? ' indeterminate' : ''}`}>
                <div
                  className="git-transfer-bar-fill"
                  style={{ width: isIndeterminate ? '42%' : `${fillWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className={`git-transfer-status${error ? ' error' : isComplete ? ' complete' : ''}`}>
        <span className="git-transfer-status-dot" />
        <span>{statusText}</span>
      </div>
    </div>
  );
};
