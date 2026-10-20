import { GitBranch, Lock, Server } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { BranchCleanupCandidate, BranchCleanupTarget } from '@/shared/ipc/branchCleanup';
import { branchCleanupReasonText } from './branchCleanupText';

type Props = {
  candidates: BranchCleanupCandidate[];
  targets: BranchCleanupTarget[];
  selected: Set<string>;
  disabled: boolean;
  onToggle: (id: string) => void;
};
export function BranchCleanupCandidates({ candidates, targets, selected, disabled, onToggle }: Props) {
  const { tr, language } = useI18n();
  return (
    <div className="branch-cleanup-candidates">
      {[...candidates]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((candidate) => {
          const target = targets.find((entry) => entry.id === candidate.targetId);
          const explanations = [
            ...new Map([...candidate.reasons, ...candidate.blocks].map((reason) => [`${reason.code}:${reason.detail ?? ''}`, reason])).values(),
          ];
          return (
            <article key={candidate.id} className={`branch-cleanup-candidate${candidate.blocks.length ? ' is-blocked' : ''}`}>
              <label className="branch-cleanup-choice">
                <input
                  type="checkbox"
                  checked={selected.has(candidate.id)}
                  disabled={disabled || Boolean(candidate.blocks.length)}
                  onChange={() => onToggle(candidate.id)}
                  aria-label={tr(`${candidate.name} zum Löschen auswählen`, `Select ${candidate.name} for deletion`)}
                />
                <span className="branch-cleanup-name">
                  {candidate.blocks.length ? <Lock size={14} /> : candidate.kind === 'server' ? <Server size={14} /> : <GitBranch size={14} />}
                  <strong>{candidate.name}</strong>
                  <code>{candidate.oid.slice(0, 10)}</code>
                </span>
                <span className={`branch-cleanup-badge ${candidate.classification}`}>
                  {candidate.classification === 'merged'
                    ? tr('Zusammengeführt', 'Merged')
                    : candidate.classification === 'orphaned'
                      ? tr('Möglicherweise verwaist', 'Possibly orphaned')
                      : candidate.blocks.length
                        ? tr('Beibehalten', 'Keep')
                        : tr('Manuell prüfen', 'Manual review')}
                </span>
              </label>
              <div className="branch-cleanup-details">
                {candidate.endpoint && (
                  <div>
                    {candidate.remoteName} · {candidate.endpoint}
                  </div>
                )}
                {candidate.upstream && <div>Upstream: {candidate.upstream}</div>}
                <div>
                  {tr('Vergleich', 'Comparison')}: {target?.name ?? '—'}
                </div>
                <div>
                  {tr('Letzter Commit', 'Last commit')}:{' '}
                  {candidate.lastCommitAt === null ? '—' : new Date(candidate.lastCommitAt).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                  {candidate.unmergedCommitCount !== null && candidate.unmergedCommitCount > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      {tr(
                        `${candidate.unmergedCommitCount} Commits außerhalb des Zielverlaufs`,
                        `${candidate.unmergedCommitCount} commits outside the target history`,
                      )}
                    </>
                  )}
                </div>
                <ul>
                  {explanations.map((reason, index) => (
                    <li key={index}>{branchCleanupReasonText(reason, tr)}</li>
                  ))}
                </ul>
                {candidate.worktrees.length > 0 && (
                  <div className="branch-cleanup-worktrees">
                    {candidate.worktrees.map((worktree) => (
                      <code key={worktree}>{worktree}</code>
                    ))}
                  </div>
                )}
              </div>
            </article>
          );
        })}
    </div>
  );
}
