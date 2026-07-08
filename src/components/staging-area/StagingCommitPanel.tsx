import { useI18n } from '../../i18n';
import type { GitStatusWithConflicts } from './types';
import type { useAiCommit } from './useAiCommit';
import type { useCommitForm } from './useCommitForm';
import type { useFileOperations } from './useFileOperations';
import { formatDiffStats } from './utils';

type StagingCommitPanelProps = {
  status: GitStatusWithConflicts;
  fileOps: ReturnType<typeof useFileOperations>;
  commitForm: ReturnType<typeof useCommitForm>;
  aiCommit: ReturnType<typeof useAiCommit>;
  hasOpenConflicts: boolean;
  totalConflictBlocksAll: number;
  isCommitInputDisabled: boolean;
  aiConfigEnabled: boolean;
  aiCommitMessageStyleLabel: string;
  openAiCommitMessageDialog: () => void;
};

export const StagingCommitPanel: React.FC<StagingCommitPanelProps> = ({
  status,
  fileOps,
  commitForm,
  aiCommit,
  hasOpenConflicts,
  totalConflictBlocksAll,
  isCommitInputDisabled,
  aiConfigEnabled,
  aiCommitMessageStyleLabel,
  openAiCommitMessageDialog,
}) => {
  const { t, tr } = useI18n();

  return (
    <div className="staging-commit-area">
      <textarea
        className="staging-commit-input"
        placeholder={hasOpenConflicts ? t('generated.components.staging_area.stagingcommitpanel.resolve_conflicts_then_commit_507014dd') : t('generated.components.staging_area.stagingcommitpanel.commit_title_0f9ab32c')}
        value={commitForm.commitMsg}
        onChange={(event) => commitForm.setCommitMsg(event.target.value)}
        onKeyDown={(event) => {
          if (!isCommitInputDisabled && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commitForm.handleCommit();
          }
        }}
        disabled={isCommitInputDisabled}
      />
      <textarea
        className="staging-commit-input staging-commit-description"
        placeholder={t('generated.components.staging_area.stagingcommitpanel.commit_description_optional_ec8b5872')}
        value={commitForm.commitDescription}
        onChange={(event) => commitForm.setCommitDescription(event.target.value)}
        onKeyDown={(event) => {
          if (!isCommitInputDisabled && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commitForm.handleCommit();
          }
        }}
        disabled={isCommitInputDisabled}
      />
      <div className="staging-commit-bar" style={{ gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: hasOpenConflicts ? 'var(--status-danger)' : 'var(--text-secondary)' }}>
          {hasOpenConflicts ? t('generated.components.staging_area.stagingcommitpanel.open_conflicts_block_commit_3da4f319') : 'Ctrl+Enter'}
        </span>
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: commitForm.amendCommit ? 'var(--status-warning)' : 'var(--text-secondary)', cursor: 'pointer' }}
          title={t('generated.components.staging_area.stagingcommitpanel.amend_last_commit_amend_commit_message_is_prefilled_auto_4ff19ec5')}
        >
          <input type="checkbox" checked={commitForm.amendCommit} onChange={(event) => commitForm.setAmendCommit(event.target.checked)} />
          {t('generated.components.staging_area.stagingcommitpanel.amend_47cd3979')}
        </label>
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
          title={t('generated.components.staging_area.stagingcommitpanel.append_signed_off_by_line_signoff_1c68660a')}
        >
          <input type="checkbox" checked={commitForm.signoffCommit} onChange={(event) => commitForm.setSignoffCommit(event.target.checked)} />
          {t('generated.components.staging_area.stagingcommitpanel.signoff_91e3b208')}
        </label>
        <div style={{ flex: 1 }} />
        {aiCommit.aiProgressMessage && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '220px', maxWidth: '420px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiCommit.aiProgressMessage}>
              {aiCommit.aiProgressMessage}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {[
                `${t('generated.components.staging_area.stagingcommitpanel.phase_d4e0da46')}: ${aiCommit.aiPhase}`,
                `${t('generated.components.staging_area.stagingcommitpanel.mode_56610d60')}: ${aiCommit.aiMode}`,
                aiCommit.aiGroupId !== null ? `${t('generated.components.staging_area.stagingcommitpanel.group_a3309056')}: ${aiCommit.aiGroupId}` : null,
                aiCommit.aiGroupSize !== null ? `${t('generated.components.staging_area.stagingcommitpanel.batch_feec543c')}: ${aiCommit.aiGroupSize}` : null,
              ].filter(Boolean).join(' | ')}
            </span>
            {(aiCommit.aiProcessedFiles !== null || aiCommit.aiRemainingFiles !== null || aiCommit.aiTotalCommits !== null) && (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                {[
                  aiCommit.aiProcessedFiles !== null ? `${t('generated.components.staging_area.stagingcommitpanel.processed_89e93a3d')}: ${aiCommit.aiProcessedFiles}` : null,
                  aiCommit.aiRemainingFiles !== null ? `${t('generated.components.staging_area.stagingcommitpanel.remaining_b60fcb0b')}: ${aiCommit.aiRemainingFiles}` : null,
                  aiCommit.aiTotalCommits !== null ? `${t('generated.components.staging_area.stagingcommitpanel.commits_6bfe0aa2')}: ${aiCommit.aiTotalCommits}` : null,
                ].filter(Boolean).join(' | ')}
              </span>
            )}
            {aiCommit.aiLastCommit && (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiCommit.aiLastCommit}>
                {`${t('generated.components.staging_area.stagingcommitpanel.last_commit_6e505570')}: ${aiCommit.aiLastCommit}`}
              </span>
            )}
          </div>
        )}
        {(aiCommit.isAiCommitting || aiCommit.isAiJobRunning) && (
          <button
            className="staging-tool-btn danger"
            type="button"
            onClick={aiCommit.handleCancelAiAutoCommit}
            title={t('generated.components.staging_area.stagingcommitpanel.cancel_running_ai_auto_commit_76ac067a')}
          >
            {t('generated.components.confirm.cancel_035b7526')}
          </button>
        )}
        <button
          className="staging-tool-btn"
          type="button"
          onClick={openAiCommitMessageDialog}
          disabled={fileOps.isMutating || hasOpenConflicts || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || aiCommit.isAiMessageGenerating || !status}
          title={tr(`Commit-Message aus Notizen generieren (${aiCommitMessageStyleLabel})`, `Generate commit message from notes (${aiCommitMessageStyleLabel})`)}
        >
          {aiCommit.isAiMessageGenerating ? t('generated.components.staging_area.stagingcommitpanel.ai_generating_3587dac6') : t('generated.components.staging_area.stagingcommitpanel.ai_message_5546e8b1')}
        </button>
        <button
          className="staging-tool-btn"
          type="button"
          onClick={aiCommit.handleAiAutoCommit}
          disabled={fileOps.isMutating || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || !status}
          title={aiConfigEnabled ? t('generated.components.staging_area.stagingcommitpanel.ai_decides_staging_commit_messages_automatically_97a774eb') : t('generated.components.staging_area.stagingcommitpanel.enable_ai_auto_commit_in_settings_first_6a044c8d')}
          style={{ opacity: aiConfigEnabled ? 1 : 0.7 }}
        >
          {(aiCommit.isAiCommitting || aiCommit.isAiJobRunning) ? t('generated.components.staging_area.stagingcommitpanel.ai_is_working_2f3bf7e0') : t('generated.components.staging_area.stagingcommitpanel.ai_auto_commit_57e8ea6c')}
        </button>
        <button
          className="staging-commit-btn"
          onClick={commitForm.handleCommit}
          disabled={fileOps.isMutating || hasOpenConflicts || !commitForm.commitMsg.trim() || commitForm.isCommitting || aiCommit.isAiCommitting || !status || (status.staged.length === 0 && !commitForm.amendCommit)}
        >
          {hasOpenConflicts
            ? tr(`Konflikte (${totalConflictBlocksAll})`, `Conflicts (${totalConflictBlocksAll})`)
            : (commitForm.isCommitting ? t('generated.components.staging_area.stagingcommitpanel.committing_1888ee3c') : `${t('generated.components.commit_graph.commitgraph.commit_b9ec78bd')} (${status.staged.length} | ${formatDiffStats(fileOps.stagedStats)})`)
          }
        </button>
      </div>
    </div>
  );
};
