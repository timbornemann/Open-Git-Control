import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Shield, AlertTriangle } from 'lucide-react';
import { DialogFrame } from '@/components/DialogFrame';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { BranchCleanupGroups } from './BranchCleanupGroups';
import { useBranchCleanup } from './useBranchCleanup';
import { branchCleanupMessage, branchCleanupPhase } from './branchCleanupText';
import './branchCleanup.css';

type Props = { repoPath: string; onClose: () => void; onChanged: () => void };
export function BranchCleanupDialog({ repoPath, onClose, onChanged }: Props) {
  const { tr } = useI18n();
  const model = useBranchCleanup(repoPath, onChanged);
  const { inspection, selected, result, busy } = model;
  const [forceReview, setForceReview] = useState(false);
  const [forceConfirmed, setForceConfirmed] = useState(false);
  useEffect(() => {
    setForceReview(false);
    setForceConfirmed(false);
  }, [inspection?.id, selected]);
  const chosen = inspection?.candidates.filter((candidate) => selected.has(candidate.id)) ?? [];
  const forced = chosen.filter((candidate) => candidate.requiresForce);
  const localCount = chosen.filter((candidate) => candidate.kind === 'local').length;
  const serverCount = chosen.length - localCount;
  const protectionDirty = Boolean(inspection && model.patterns !== inspection.protectedPatterns.join('\n'));
  const close = () => {
    if (busy === 'execute') model.cancel();
    else {
      model.cancel();
      onClose();
    }
  };
  const submit = () => {
    if (protectionDirty && !result) return;
    if (result) {
      onClose();
      return;
    }
    if (forced.length && !forceReview) {
      setForceReview(true);
      return;
    }
    if (forced.length && !forceConfirmed) return;
    void model.execute(forced.map((candidate) => candidate.id));
  };
  const disabled = Boolean(busy) || (!result && (!chosen.length || protectionDirty || (forceReview && !forceConfirmed)));

  return (
    <DialogFrame
      open
      title={tr('Branches aufräumen', 'Clean up branches')}
      onClose={close}
      onConfirm={submit}
      confirmDisabled={disabled}
      confirmVariant={result ? 'default' : 'danger'}
      closeOnBackdrop={!busy}
      confirmLabel={
        result
          ? tr('Fertig', 'Done')
          : forced.length && !forceReview
            ? tr('Auswahl prüfen …', 'Review selection …')
            : tr(`${localCount} lokal und ${serverCount} auf Servern löschen`, `Delete ${localCount} local and ${serverCount} server branches`)
      }
      cancelLabel={
        model.cancelling
          ? tr('Wird abgebrochen …', 'Cancelling …')
          : busy === 'execute'
            ? tr('Weitere Löschungen stoppen', 'Stop further deletions')
            : undefined
      }
      secondaryActionLabel={forceReview && !result ? tr('Zur Auswahl', 'Back to selection') : tr('Erneut prüfen', 'Inspect again')}
      onSecondaryAction={
        busy
          ? undefined
          : forceReview && !result
            ? () => {
                setForceReview(false);
                setForceConfirmed(false);
              }
            : () => void model.refresh()
      }
    >
      <div className="branch-cleanup-dialog">
        <p className="branch-cleanup-repository" title={repoPath}>
          {repoPath}
        </p>
        {busy && (
          <p className="branch-cleanup-progress" role="status" aria-live="polite">
            <Loader2 size={16} className="branch-cleanup-spin" />
            {model.cancelling
              ? tr('Laufende Aktion abschließen und Ergebnis prüfen …', 'Finishing the active operation and verifying its outcome …')
              : branchCleanupPhase(model.phase, tr)}
          </p>
        )}
        {model.error && (
          <p role="alert" className="branch-cleanup-error">
            {branchCleanupMessage(model.error, tr)}
          </p>
        )}
        {protectionDirty && !result && (
          <p role="status">
            {tr('Schutzänderungen vor dem Löschen speichern und erneut prüfen.', 'Save protection changes and inspect again before deleting.')}
          </p>
        )}
        {result ? (
          <>
            <p role="status" className="branch-cleanup-summary">
              <CheckCircle2 size={18} />
              {tr(
                `${result.outcomes.filter((outcome) => outcome.status === 'deleted').length} Branches gelöscht.`,
                `${result.outcomes.filter((outcome) => outcome.status === 'deleted').length} branches deleted.`,
              )}
              {result.cancelled && ` ${branchCleanupMessage('cancelled', tr)}`}
            </p>
            <ul className="branch-cleanup-results">
              {result.outcomes.map((outcome) => (
                <li key={outcome.id}>
                  <strong>{outcome.name}</strong> · {outcome.kind === 'local' ? tr('Lokal', 'Local') : outcome.endpoint}
                  <span className={`branch-cleanup-outcome ${outcome.status}`}>
                    {outcome.status === 'deleted'
                      ? tr('Gelöscht', 'Deleted')
                      : outcome.status === 'skipped'
                        ? tr('Übersprungen', 'Skipped')
                        : outcome.status === 'unknown'
                          ? tr('Ergebnis ungeklärt – erneut prüfen', 'Outcome unknown – inspect again')
                          : tr('Fehlgeschlagen', 'Failed')}
                  </span>
                  <small>{branchCleanupMessage(outcome.message, tr)}</small>
                </li>
              ))}
            </ul>
          </>
        ) : forceReview ? (
          <>
            <div className="branch-cleanup-force-warning">
              <AlertTriangle size={20} />
              <p>
                {tr(
                  'Diese Branches enthalten Commits außerhalb des Vergleichsziels. Eine Übernahme ihrer Änderungen konnte nicht nachgewiesen werden. Beim Löschen kann Arbeit verloren gehen.',
                  'These branches contain commits outside the comparison target. Integration of their changes could not be verified. Deletion may lose work.',
                )}
              </p>
            </div>
            <ul>
              {forced.map((candidate) => (
                <li key={candidate.id}>
                  <strong>{candidate.name}</strong> · {candidate.kind === 'local' ? tr('Lokal', 'Local') : candidate.endpoint}
                  {' · '}
                  {tr(`${candidate.unmergedCommitCount ?? '?'} nicht übernommene Commits`, `${candidate.unmergedCommitCount ?? '?'} unmerged commits`)}
                </li>
              ))}
            </ul>
            <label className="branch-cleanup-force-confirm">
              <input type="checkbox" checked={forceConfirmed} disabled={Boolean(busy)} onChange={(event) => setForceConfirmed(event.target.checked)} />
              {tr(
                'Ich bestätige ausdrücklich das Löschen dieser Branches mit nicht übernommenen Commits.',
                'I explicitly confirm deleting these branches with unmerged commits.',
              )}
            </label>
          </>
        ) : (
          inspection && (
            <>
              <div className="branch-cleanup-targets">
                {inspection.comparisons.map((comparison) => (
                  <label key={comparison.id}>
                    <span>{comparison.id === 'local' ? tr('Vergleich für lokale Branches', 'Comparison for local branches') : comparison.label}</span>
                    <select
                      value={comparison.targetId ?? ''}
                      disabled={Boolean(busy)}
                      onChange={(event) => void model.setTarget(comparison.id, event.target.value)}
                    >
                      <option value="" disabled>
                        {tr('Vergleichsziel wählen …', 'Choose comparison target …')}
                      </option>
                      {inspection.targets
                        .filter((target) => target.comparisonId === comparison.id)
                        .map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              {inspection.warnings.length > 0 && (
                <details className="branch-cleanup-warnings">
                  <summary>
                    <AlertTriangle size={14} />
                    {tr('Prüfung teilweise eingeschränkt', 'Inspection partially limited')}
                  </summary>
                  <p>
                    {tr(
                      'Lokale Ergebnisse können auf einem älteren Stand beruhen. Nicht verifizierte Server-Branches bleiben gesperrt.',
                      'Local results may use an older state. Unverified server branches remain blocked.',
                    )}
                  </p>
                  <ul>
                    {inspection.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="branch-cleanup-summary">
                {tr(`${localCount} lokale und ${serverCount} Server-Branches ausgewählt.`, `${localCount} local and ${serverCount} server branches selected.`)}
              </p>
              <BranchCleanupGroups
                inspection={inspection}
                selected={selected}
                disabled={Boolean(busy)}
                onToggle={model.toggle}
                onSelectMerged={model.selectMerged}
              />
              <details className="branch-cleanup-protection">
                <summary>
                  <Shield size={15} />
                  {tr('Zusätzlicher Branch-Schutz', 'Additional branch protection')}
                </summary>
                <label>
                  {tr('Geschützte Namen und Muster, ein Eintrag pro Zeile', 'Protected names and patterns, one entry per line')}
                  <textarea rows={5} value={model.patterns} disabled={Boolean(busy)} onChange={(event) => model.setPatterns(event.target.value)} />
                </label>
                <p>
                  {tr(
                    '„*“ steht für beliebige Zeichen. main, master, develop und development bleiben immer geschützt. Die Muster gelten für alle Worktrees dieses Repositorys.',
                    '“*” matches any characters. main, master, develop and development always remain protected. Patterns apply to every worktree of this repository.',
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={Boolean(busy) || model.patterns === inspection.protectedPatterns.join('\n')}
                  icon={<RefreshCw size={13} />}
                  onClick={() => void model.savePatterns()}
                >
                  {tr('Schutz speichern und neu prüfen', 'Save protection and inspect again')}
                </Button>
              </details>
            </>
          )
        )}
      </div>
    </DialogFrame>
  );
}
