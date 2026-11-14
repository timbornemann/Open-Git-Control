import { Archive, ArrowRight, ArrowRightLeft, Check, GitBranch, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { BranchChangeInspection } from '@/shared/ipc/branchChange';

export function BranchChangeRoute({ inspection }: { inspection: BranchChangeInspection }) {
  const { tr } = useI18n();
  const target = inspection.target;
  return (
    <div className="branch-change-route">
      <div>
        <span>
          <GitBranch size={13} aria-hidden="true" />
          {tr('Aktueller Branch', 'Current branch')}
        </span>
        <code>{inspection.sourceBranch || inspection.sourceHead.slice(0, 10)}</code>
      </div>
      {target && (
        <>
          <ArrowRight className="branch-change-route-arrow" size={19} aria-hidden="true" />
          <div>
            <span>
              {target.kind === 'create'
                ? tr('Neuer Branch', 'New branch')
                : target.kind === 'detached'
                  ? tr('Ziel-Commit', 'Target commit')
                  : tr('Zielbranch', 'Target branch')}
            </span>
            <code>{target.kind === 'detached' ? target.ref : target.branch}</code>
          </div>
        </>
      )}
    </div>
  );
}

export function BranchChangeSteps({ step }: { step: number }) {
  const { tr } = useI18n();
  return (
    <ol className="branch-change-steps" aria-label={tr('Schritte zum Branchwechsel', 'Branch change steps')}>
      {[tr('Änderungen prüfen', 'Review changes'), tr('Aktion wählen', 'Choose action')].map((label, index) => (
        <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'completed' : undefined}>
          <span>{index < step ? <Check size={12} aria-hidden="true" /> : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function BranchChangeChoices() {
  const { tr } = useI18n();
  return (
    <div className="branch-change-choices">
      <section className="branch-change-choice">
        <Archive size={19} aria-hidden="true" />
        <h4>{tr('Parken und wechseln', 'Park and switch')}</h4>
        <p>
          {tr(
            'Den Zielbranch ohne diese Änderungen öffnen. Die Sicherung bleibt als Stash erhalten und kann später wiederhergestellt werden.',
            'Open the target branch without these changes. The backup is kept as a stash and can be restored later.',
          )}
        </p>
      </section>
      <section className="branch-change-choice branch-change-choice--carry">
        <ArrowRightLeft size={19} aria-hidden="true" />
        <h4>{tr('Mitnehmen und wechseln', 'Carry and switch')}</h4>
        <p>
          {tr(
            'Im Zielbranch mit diesen Änderungen weiterarbeiten. Nach dem Wechsel werden Dateien und Staging-Zustand wiederhergestellt.',
            'Continue working with these changes on the target branch. Files and staged state are restored after switching.',
          )}
        </p>
      </section>
      <p className="branch-change-saved-hint">
        <ShieldCheck size={14} aria-hidden="true" />
        {tr(
          'Beide Optionen sichern gestagte, ungestagte und neue Dateien. Ignorierte Dateien bleiben ausgeschlossen.',
          'Both options save staged, unstaged and new files. Ignored files are excluded.',
        )}
      </p>
    </div>
  );
}

export function BranchChangeGuide({ inspection, step, finished }: { inspection: BranchChangeInspection; step: number; finished: boolean }) {
  const { tr } = useI18n();
  return (
    <>
      <p className="branch-change-repository">{inspection.repoPath}</p>
      <BranchChangeRoute inspection={inspection} />
      {inspection.session && !finished && (
        <div className="branch-change-saved-entry">
          <Archive size={18} aria-hidden="true" />
          <div>
            <span>{tr('Gesicherter Arbeitsstand', 'Saved working state')}</span>
            <strong>{inspection.session.name}</strong>
            <small>
              {inspection.session.sourceBranch} · {new Date(inspection.session.createdAt).toLocaleString(tr('de-DE', 'en-GB'))}
            </small>
          </div>
        </div>
      )}
      {!inspection.session && !finished && <BranchChangeSteps step={step} />}
    </>
  );
}

export function BranchChangeFilesHeading({ inspection, restore }: { inspection: BranchChangeInspection; restore: boolean }) {
  const { tr } = useI18n();
  return (
    <div className="branch-change-review-heading">
      <h4>
        {restore
          ? tr('Gesicherte Änderungen prüfen', 'Review saved changes')
          : tr(
              `${inspection.files.length} ${inspection.files.length === 1 ? 'Datei' : 'Dateien'} mit offenen Änderungen`,
              `${inspection.files.length} ${inspection.files.length === 1 ? 'file' : 'files'} with uncommitted changes`,
            )}
      </h4>
      <p>
        {restore
          ? tr(
              'Datei anklicken, um die gesicherten Änderungen vor dem Wiederherstellen anzusehen.',
              'Click a file to review the saved changes before restoring them.',
            )
          : tr(
              'Datei anklicken, um die Vorschau zu öffnen. Alle aufgeführten Änderungen werden gemeinsam gesichert.',
              'Click a file to preview it. All listed changes are saved together.',
            )}
      </p>
    </div>
  );
}

export function BranchChangeReviewHint({ restore }: { restore: boolean }) {
  const { tr } = useI18n();
  return (
    <p className="branch-change-saved-hint">
      <ShieldCheck size={14} aria-hidden="true" />
      {restore
        ? tr(
            'Die Sicherung bleibt erhalten, bis die Wiederherstellung erfolgreich abgeschlossen ist.',
            'The backup is kept until restoration completes successfully.',
          )
        : tr('Der Wechsel beginnt erst nach deiner Auswahl im nächsten Schritt.', 'Switching starts only after your choice in the next step.')}
    </p>
  );
}
