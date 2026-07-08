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
  const { tr } = useI18n();

  return (
    <div className="staging-commit-area">
      <textarea
        className="staging-commit-input"
        placeholder={hasOpenConflicts ? tr('Konflikte aufloesen, danach committen...', 'Resolve conflicts, then commit...') : tr('Commit-Titel...', 'Commit title...')}
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
        placeholder={tr('Commit-Beschreibung (optional)...', 'Commit description (optional)...')}
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
          {hasOpenConflicts ? tr('Offene Konflikte blockieren Commit', 'Open conflicts block commit') : 'Ctrl+Enter'}
        </span>
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: commitForm.amendCommit ? 'var(--status-warning)' : 'var(--text-secondary)', cursor: 'pointer' }}
          title={tr('Letzten Commit aendern (--amend). Commit-Nachricht wird automatisch vorausgefuellt.', 'Amend last commit (--amend). Commit message is prefilled automatically.')}
        >
          <input type="checkbox" checked={commitForm.amendCommit} onChange={(event) => commitForm.setAmendCommit(event.target.checked)} />
          {tr('Amend', 'Amend')}
        </label>
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
          title={tr('Signed-off-by Zeile anhaengen (--signoff)', 'Append signed-off-by line (--signoff)')}
        >
          <input type="checkbox" checked={commitForm.signoffCommit} onChange={(event) => commitForm.setSignoffCommit(event.target.checked)} />
          {tr('Signoff', 'Signoff')}
        </label>
        <div style={{ flex: 1 }} />
        {aiCommit.aiProgressMessage && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '220px', maxWidth: '420px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiCommit.aiProgressMessage}>
              {aiCommit.aiProgressMessage}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {[
                `${tr('Phase', 'Phase')}: ${aiCommit.aiPhase}`,
                `${tr('Modus', 'Mode')}: ${aiCommit.aiMode}`,
                aiCommit.aiGroupId !== null ? `${tr('Gruppe', 'Group')}: ${aiCommit.aiGroupId}` : null,
                aiCommit.aiGroupSize !== null ? `${tr('Batch', 'Batch')}: ${aiCommit.aiGroupSize}` : null,
              ].filter(Boolean).join(' | ')}
            </span>
            {(aiCommit.aiProcessedFiles !== null || aiCommit.aiRemainingFiles !== null || aiCommit.aiTotalCommits !== null) && (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                {[
                  aiCommit.aiProcessedFiles !== null ? `${tr('Verarbeitet', 'Processed')}: ${aiCommit.aiProcessedFiles}` : null,
                  aiCommit.aiRemainingFiles !== null ? `${tr('Rest', 'Remaining')}: ${aiCommit.aiRemainingFiles}` : null,
                  aiCommit.aiTotalCommits !== null ? `${tr('Commits', 'Commits')}: ${aiCommit.aiTotalCommits}` : null,
                ].filter(Boolean).join(' | ')}
              </span>
            )}
            {aiCommit.aiLastCommit && (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={aiCommit.aiLastCommit}>
                {`${tr('Letzter Commit', 'Last commit')}: ${aiCommit.aiLastCommit}`}
              </span>
            )}
          </div>
        )}
        {(aiCommit.isAiCommitting || aiCommit.isAiJobRunning) && (
          <button
            className="staging-tool-btn danger"
            type="button"
            onClick={aiCommit.handleCancelAiAutoCommit}
            title={tr('Laufenden KI Auto-Commit abbrechen', 'Cancel running AI auto-commit')}
          >
            {tr('Abbrechen', 'Cancel')}
          </button>
        )}
        <button
          className="staging-tool-btn"
          type="button"
          onClick={openAiCommitMessageDialog}
          disabled={fileOps.isMutating || hasOpenConflicts || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || aiCommit.isAiMessageGenerating || !status}
          title={tr(`Commit-Message aus Notizen generieren (${aiCommitMessageStyleLabel})`, `Generate commit message from notes (${aiCommitMessageStyleLabel})`)}
        >
          {aiCommit.isAiMessageGenerating ? tr('KI generiert...', 'AI generating...') : tr('KI Message', 'AI message')}
        </button>
        <button
          className="staging-tool-btn"
          type="button"
          onClick={aiCommit.handleAiAutoCommit}
          disabled={fileOps.isMutating || commitForm.isCommitting || aiCommit.isAiCommitting || aiCommit.isAiJobRunning || !status}
          title={aiConfigEnabled ? tr('KI entscheidet Staging + Commit-Nachrichten automatisch.', 'AI decides staging + commit messages automatically.') : tr('In Settings zuerst KI Auto-Commit aktivieren.', 'Enable AI auto-commit in settings first.')}
          style={{ opacity: aiConfigEnabled ? 1 : 0.7 }}
        >
          {(aiCommit.isAiCommitting || aiCommit.isAiJobRunning) ? tr('KI arbeitet...', 'AI is working...') : tr('KI Auto-Commit', 'AI auto-commit')}
        </button>
        <button
          className="staging-commit-btn"
          onClick={commitForm.handleCommit}
          disabled={fileOps.isMutating || hasOpenConflicts || !commitForm.commitMsg.trim() || commitForm.isCommitting || aiCommit.isAiCommitting || !status || (status.staged.length === 0 && !commitForm.amendCommit)}
        >
          {hasOpenConflicts
            ? tr(`Konflikte (${totalConflictBlocksAll})`, `Conflicts (${totalConflictBlocksAll})`)
            : (commitForm.isCommitting ? tr('Committing...', 'Committing...') : `${tr('Commit', 'Commit')} (${status.staged.length} | ${formatDiffStats(fileOps.stagedStats)})`)
          }
        </button>
      </div>
    </div>
  );
};
