import { AlertTriangle, ArrowRight, ChevronRight, GitBranch, GitCommitHorizontal, Loader2, RotateCcw } from 'lucide-react';
import { Button, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { formatRecoveryDate, getRecoveryActionLabel, getRecoveryDescription } from './recoveryCenterUtils';
import type { RecoveryCenterState } from './useRecoveryCenter';
import { RecoveryNotice } from './RecoveryNotice';

export function RecoveryActions({ state }: { state: RecoveryCenterState }) {
  const { locale, tr } = useI18n();
  const {
    selected,
    branchName,
    setBranchName,
    branchNameTouched,
    setBranchNameTouched,
    branchNameError,
    isBusy,
    pendingAction,
    runAction,
    runDangerAware,
    createRecoveryBranch,
    actionIssue,
    successMessage,
  } = state;
  if (!selected) return null;
  const description = getRecoveryDescription(selected, tr);
  const contextItems = [
    { label: tr('Gewählter Stand', 'Selected state'), value: description },
    { label: tr('Commit', 'Commit'), value: selected.abbrevHash },
  ];
  return (
    <div className="recovery-center__detail-content">
      <header className="recovery-center__selection">
        <span className="recovery-center__eyebrow">{getRecoveryActionLabel(selected, tr)}</span>
        <h2>{description}</h2>
        <div className="recovery-center__selection-meta">
          <code>{selected.abbrevHash}</code>
          <time dateTime={selected.date}>{formatRecoveryDate(selected.date, locale)}</time>
        </div>
        <details className="recovery-center__git-details">
          <summary>
            <ChevronRight size={12} aria-hidden="true" />
            {tr('Git-Details', 'Git details')}
          </summary>
          <dl>
            <dt>{tr('Referenz', 'Reference')}</dt>
            <dd>
              <code>{selected.selector}</code>
            </dd>
            <dt>{tr('Commit', 'Commit')}</dt>
            <dd>
              <code>{selected.hash}</code>
            </dd>
            <dt>{tr('Git-Aktion', 'Git action')}</dt>
            <dd>{selected.subject}</dd>
          </dl>
        </details>
      </header>

      <section className="recovery-center__action-section" aria-labelledby="recovery-action-title">
        <h2 id="recovery-action-title">
          <span className="recovery-center__step">2</span>
          {tr('Auf einem neuen Branch weiterarbeiten', 'Continue on a new branch')}
        </h2>
        <p className="recovery-center__description">
          {tr(
            'Erstellt einen lokalen Branch mit dem gewählten Stand und öffnet ihn direkt. Deine bisherigen Branches bleiben erhalten.',
            'Creates a local branch at the selected state and opens it immediately. Your existing branches are preserved.',
          )}
        </p>
        <div className="recovery-center__branch-preview" aria-hidden="true">
          <GitCommitHorizontal size={17} />
          <code>{selected.abbrevHash}</code>
          <ArrowRight size={15} />
          <GitBranch size={17} />
          <span>{branchName.trim() || tr('Neuer Branch', 'New branch')}</span>
        </div>
        <form className="recovery-center__branch-form" onSubmit={createRecoveryBranch}>
          <label htmlFor="recovery-branch-name">{tr('Name des neuen Branches', 'New branch name')}</label>
          <div className="recovery-center__branch-controls">
            <TextField
              id="recovery-branch-name"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              onBlur={() => setBranchNameTouched(true)}
              aria-invalid={branchNameTouched && Boolean(branchNameError)}
              aria-describedby="recovery-branch-help"
              disabled={isBusy}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="submit"
              size="md"
              variant="primary"
              icon={pendingAction === 'branch' ? <Loader2 size={14} className="spin" /> : <GitBranch size={14} />}
              disabled={isBusy || Boolean(branchNameError)}
            >
              {pendingAction === 'branch' ? tr('Wird wiederhergestellt…', 'Recovering…') : tr('Branch erstellen & öffnen', 'Create branch & open')}
            </Button>
          </div>
          <p
            id="recovery-branch-help"
            className={`recovery-center__field-message${branchNameTouched && branchNameError ? ' recovery-center__field-message--error' : ''}`}
            role={branchNameTouched && branchNameError ? 'alert' : undefined}
          >
            {branchNameTouched && branchNameError
              ? branchNameError === 'empty'
                ? tr('Gib einen Branch-Namen ein.', 'Enter a branch name.')
                : tr(
                    'Verwende einen gültigen Git-Branch-Namen ohne Leerzeichen oder reservierte Zeichen.',
                    'Use a valid Git branch name without spaces or reserved characters.',
                  )
              : tr('Der Name lässt sich später ändern.', 'You can rename it later.')}
          </p>
        </form>
        <RecoveryNotice issue={actionIssue} message={successMessage} />
        <p className="recovery-center__commit-note">
          {tr(
            'Wiederhergestellt werden gespeicherte Commits. Nicht committete Dateiänderungen sind hier nicht gesichert.',
            'Recovery uses saved commits. Uncommitted file changes are not backed up here.',
          )}
        </p>
      </section>

      <details className="recovery-center__advanced">
        <summary>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{tr('Weitere Wiederherstellungsoptionen', 'More recovery options')}</span>
          <small>{tr('Ansehen oder zurücksetzen', 'Inspect or reset')}</small>
        </summary>
        <div className="recovery-center__advanced-action">
          <GitCommitHorizontal size={18} aria-hidden="true" />
          <div>
            <h3>{tr('Diesen Stand ansehen', 'Inspect this state')}</h3>
            <p>
              {tr(
                'Öffnet die Dateien dieses Commits ohne neuen Branch. Um anschließend Änderungen zu speichern, erstelle zuerst einen Branch.',
                'Opens this commit’s files without a new branch. Create a branch before saving new commits.',
              )}
            </p>
          </div>
          <Button
            size="sm"
            disabled={isBusy}
            onClick={() =>
              runDangerAware({
                title: tr('Diesen Stand ohne Branch öffnen?', 'Open this state without a branch?'),
                message: tr(
                  'Deine Arbeitsdateien wechseln zum ausgewählten Commit. Du arbeitest anschließend außerhalb eines Branches.',
                  'Your working files switch to the selected commit. You will then be working outside a branch.',
                ),
                confirmLabel: tr('Stand öffnen', 'Open state'),
                irreversible: false,
                consequences: tr(
                  'Deine Branches bleiben erhalten. Erstelle vor neuen Commits einen Branch, um sie dauerhaft zu behalten.',
                  'Your branches are preserved. Create a branch before making new commits to keep them.',
                ),
                contextItems,
                run: () =>
                  runAction(
                    'checkout',
                    ['checkout', selected.hash],
                    tr(`Commit ${selected.abbrevHash} wurde geöffnet.`, `Opened commit ${selected.abbrevHash}.`),
                  ),
              })
            }
          >
            {pendingAction === 'checkout' ? <Loader2 size={13} className="spin" /> : tr('Stand ansehen', 'Inspect state')}
          </Button>
        </div>
        <div className="recovery-center__advanced-action recovery-center__advanced-action--danger">
          <RotateCcw size={18} aria-hidden="true" />
          <div>
            <h3>{tr('Aktuellen Branch zurücksetzen', 'Reset current branch')}</h3>
            <p>
              {tr(
                'Verschiebt den aktuellen Branch auf diesen Commit und ersetzt die Arbeitsdateien. Nicht committete Änderungen gehen verloren.',
                'Moves the current branch to this commit and replaces working files. Uncommitted changes will be lost.',
              )}
            </p>
            <small>{tr('Git: Hard Reset', 'Git: hard reset')}</small>
          </div>
          <Button
            size="sm"
            variant="danger"
            icon={pendingAction === 'reset' ? <Loader2 size={13} className="spin" /> : <AlertTriangle size={13} />}
            disabled={isBusy}
            onClick={() =>
              runDangerAware({
                title: tr('Aktuellen Branch zurücksetzen?', 'Reset current branch?'),
                message: tr(
                  'Der aktuelle Branch und deine Arbeitsdateien werden auf den ausgewählten Commit zurückgesetzt.',
                  'The current branch and your working files will be reset to the selected commit.',
                ),
                confirmLabel: tr('Branch zurücksetzen', 'Reset branch'),
                irreversible: true,
                consequences: tr(
                  'Alle nicht committeten Änderungen, auch gestagte Änderungen, gehen dauerhaft verloren. Spätere Commits gehören danach nicht mehr zu diesem Branch.',
                  'All uncommitted changes, including staged changes, will be permanently lost. Later commits will no longer belong to this branch.',
                ),
                contextItems,
                run: () =>
                  runAction(
                    'reset',
                    ['reset', '--hard', selected.hash],
                    tr(`Repository wurde auf ${selected.abbrevHash} zurückgesetzt.`, `Repository was reset to ${selected.abbrevHash}.`),
                  ),
              })
            }
          >
            {tr('Zurücksetzen…', 'Reset…')}
          </Button>
        </div>
      </details>
    </div>
  );
}
