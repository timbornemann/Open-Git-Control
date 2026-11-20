import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useI18n, type TranslateFn } from '@/i18n';
import { branchRecoveryClient } from '@/services/branchRecoveryClient';
import type { BranchHeadProblem, BranchRecoveryInspection, BranchRecoverySource } from '@/shared/ipc/branchRecovery';
import { BranchHeadNotice } from './BranchHeadNotice';

const sourceLabel = (source: BranchRecoverySource, tr: TranslateFn) => {
  switch (source) {
    case 'branch-reflog':
      return tr('Branch-Reflog', 'Branch reflog');
    case 'head-reflog':
      return tr('HEAD-Reflog', 'HEAD reflog');
    case 'last-seen':
      return tr('Zuletzt bestätigter Branchstand', 'Last verified branch tip');
    case 'bundle':
      return tr('Git-Bundle', 'Git bundle');
  }
};

export function BranchRepairPanel({
  repoPath,
  refreshTrigger,
  observedProblem,
  onRepaired,
}: {
  repoPath: string;
  refreshTrigger?: number;
  observedProblem?: BranchHeadProblem | null;
  onRepaired?: () => void;
}) {
  const { tr, language } = useI18n();
  const [inspection, setInspection] = useState<BranchRecoveryInspection | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState('');
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);

  const inspect = useCallback(async () => {
    const request = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await branchRecoveryClient.inspect(repoPath);
      if (generation.current !== request) return;
      if (!result.success) throw new Error(result.error);
      setInspection(result.data);
      setSelected(result.data?.candidates.length === 1 ? result.data.candidates[0].oid : '');
    } catch (failure) {
      if (generation.current === request) {
        setInspection(null);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void inspect();
    return invalidate;
  }, [inspect, invalidate, refreshTrigger]);

  const repair = async () => {
    if (!inspection?.confirmationId || !selected || busy) return;
    const request = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await branchRecoveryClient.repair({ repoPath, confirmationId: inspection.confirmationId, oid: selected });
      if (generation.current !== request) return;
      if (!result.success) throw new Error(result.error);
      if (!result.data) {
        void inspect();
        return;
      }
      setRestored(result.data.oid);
      setInspection(null);
      onRepaired?.();
    } catch (failure) {
      if (generation.current !== request) return;
      setInspection({ ...inspection, confirmationId: null });
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (generation.current === request) setBusy(false);
    }
  };

  const problem = inspection?.problem ?? (restored ? null : observedProblem);
  if (!problem && !error && !restored) return null;
  return (
    <section className="branch-repair-panel" aria-label={tr('Branch-Wiederherstellung', 'Branch recovery')} aria-busy={busy}>
      {restored && (
        <p role="status">
          {tr('Branch-Verweis wiederhergestellt', 'Branch reference restored')} <code>{restored.slice(0, 12)}</code>
        </p>
      )}
      {problem && <BranchHeadNotice problem={problem} />}
      {busy && !inspection && <p role="status">{tr('Wiederherstellungskandidaten werden geprüft …', 'Checking recovery candidates …')}</p>}
      {inspection?.candidates.length ? (
        <fieldset disabled={busy}>
          <legend>{tr('Commit für die Wiederherstellung auswählen', 'Choose a commit to restore')}</legend>
          {inspection.candidates.map((candidate) => (
            <label className="branch-repair-candidate" key={candidate.oid}>
              <input type="radio" name="branch-recovery-candidate" checked={selected === candidate.oid} onChange={() => setSelected(candidate.oid)} />
              <span>
                <strong>{candidate.subject}</strong>
                <code>{candidate.oid}</code>
                {candidate.committedAt && <small>{new Date(candidate.committedAt).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}</small>}
                <small>{candidate.sources.map((source) => sourceLabel(source, tr)).join(' · ')}</small>
                {candidate.indexMatch && (
                  <small>
                    {candidate.indexMatch.matches
                      ? tr(
                          `${candidate.indexMatch.entries} Indexeinträge stimmen mit diesem Commit überein.`,
                          `${candidate.indexMatch.entries} index entries match this commit.`,
                        )
                      : tr('Der Index enthält Änderungen gegenüber diesem Commit.', 'The index differs from this commit.')}
                  </small>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        inspection && (
          <p>
            {tr('Für diesen Branch ist kein geprüfter Wiederherstellungskandidat verfügbar.', 'No verified recovery candidate is available for this branch.')}
          </p>
        )
      )}
      {error && (
        <p role="alert" className="storage-error">
          {error}
        </p>
      )}
      {inspection?.confirmationId ? (
        <Button disabled={busy || !selected} onClick={() => void repair()}>
          {busy ? tr('Wiederherstellung wird geprüft …', 'Validating recovery …') : tr('Branch-Verweis wiederherstellen …', 'Restore branch reference …')}
        </Button>
      ) : (
        (error || inspection) && (
          <Button disabled={busy} onClick={() => void inspect()}>
            {tr('Erneut prüfen', 'Check again')}
          </Button>
        )
      )}
    </section>
  );
}
