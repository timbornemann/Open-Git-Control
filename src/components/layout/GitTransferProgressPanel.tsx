import React, { useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useI18n, type CatalogTranslateFn } from '@/i18n';
import { summarizeGitTransferProgress } from '@/utils/gitTransferProgress';
import type { GitTransferPhaseKey, GitTransferPhaseProgress } from '@/utils/gitTransferProgress';

type Props = {
  lines: string[];
  isRunning: boolean;
  isComplete?: boolean;
  error?: string | null;
  emptyText: string;
};

const getPhaseLabel = (key: GitTransferPhaseKey, t: CatalogTranslateFn): string => {
  switch (key) {
    case 'enumerating':
      return t('generated.components.layout.gittransferprogresspanel.enumerating_dfd54b13');
    case 'counting':
      return t('generated.components.layout.gittransferprogresspanel.counting_d1387dd0');
    case 'compressing':
      return t('generated.components.layout.gittransferprogresspanel.compressing_0d99de7c');
    case 'receiving':
      return t('generated.components.layout.gittransferprogresspanel.receiving_download_6eb73bf9');
    case 'resolving':
      return t('generated.components.layout.gittransferprogresspanel.resolving_6b422f1c');
    case 'writing':
      return t('generated.components.layout.gittransferprogresspanel.writing_objects_649b0aa0');
    case 'updating':
      return t('generated.components.layout.gittransferprogresspanel.updating_files_b1ab9cbf');
    case 'checkingOut':
      return t('generated.components.layout.branchcontextmenu.checkout_d9bc41ee');
    default:
      return t('generated.components.layout.gittransferprogresspanel.git_progress_480449ca');
  }
};

const formatPhaseMeta = (phase: GitTransferPhaseProgress, t: CatalogTranslateFn): string => {
  if (!phase.observed) return t('generated.components.layout.gittransferprogresspanel.waiting_729a8a6c');

  const parts: string[] = [];
  if (phase.percent !== null) parts.push(`${phase.percent}%`);
  if (phase.current !== null && phase.total !== null) parts.push(`${phase.current}/${phase.total}`);
  if (phase.amount) parts.push(phase.amount);
  if (phase.speed) parts.push(phase.speed);
  if (parts.length > 0) return parts.join(' | ');

  return phase.done
    ? t('generated.components.layout.cloneprogressmodal.done_724fd90c')
    : t('generated.components.layout.gittransferprogresspanel.running_c78d46de');
};

export const GitTransferProgressPanel: React.FC<Props> = ({ lines, isRunning, isComplete = false, error = null, emptyText }) => {
  const { t } = useI18n();
  const summary = useMemo(() => summarizeGitTransferProgress(lines), [lines]);
  const statusText =
    error || (isComplete ? t('generated.components.layout.gittransferprogresspanel.repository_is_ready_c46ad14f') : summary.latestLine || emptyText);

  return (
    <div className="git-transfer-panel">
      <div className="git-transfer-phase-list">
        {summary.phases.map((phase) => {
          const isIndeterminate = isRunning && phase.state === 'active' && phase.percent === null;
          const fillWidth = phase.percent === null ? 0 : phase.percent;

          return (
            <div key={phase.key} className={`git-transfer-phase git-transfer-phase-${phase.state}${phase.observed ? '' : ' git-transfer-phase-unseen'}`}>
              <div className="git-transfer-phase-topline">
                <div className="git-transfer-phase-title">
                  {phase.state === 'done' ? <Check size={14} aria-hidden="true" /> : <Loader2 size={14} aria-hidden="true" />}
                  <span>{getPhaseLabel(phase.key, t)}</span>
                </div>
                <span className="git-transfer-phase-meta">{formatPhaseMeta(phase, t)}</span>
              </div>
              <div className={`git-transfer-bar${isIndeterminate ? ' indeterminate' : ''}`}>
                <div className="git-transfer-bar-fill" style={{ width: isIndeterminate ? '42%' : `${fillWidth}%` }} />
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
