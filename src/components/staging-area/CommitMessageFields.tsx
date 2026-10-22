import { useId, useRef } from 'react';
import { ActionRequirementHelp } from '@/components/ui/ActionRequirement';
import { useI18n } from '@/i18n';
import { COMMIT_TYPES, type CommitType } from './commitSubject';
import type { useCommitForm } from './useCommitForm';

type Props = {
  commitForm: ReturnType<typeof useCommitForm>;
  disabled: boolean;
  hasOpenConflicts: boolean;
  titleRequirement: string | null;
  titleHintId: string;
};

export const CommitMessageFields = ({ commitForm, disabled, hasOpenConflicts, titleRequirement, titleHintId }: Props) => {
  const { t, tr } = useI18n();
  const fieldId = useId();
  const messageField = useRef<HTMLTextAreaElement>(null);
  const subject = commitForm.commitSubject;
  const typeLabels: Record<Exclude<CommitType, ''>, string> = {
    feat: tr('Neue Funktion', 'New feature'),
    fix: tr('Fehlerbehebung', 'Bug fix'),
    docs: tr('Dokumentation', 'Documentation'),
    perf: tr('Performance', 'Performance'),
    add: tr('Ergänzung', 'Addition'),
    refactor: tr('Umstrukturierung', 'Refactoring'),
    style: tr('Formatierung', 'Formatting'),
    test: tr('Tests', 'Tests'),
    build: tr('Build', 'Build'),
    ci: tr('Automatisierung', 'Automation'),
    chore: tr('Wartung', 'Maintenance'),
    revert: tr('Rücknahme', 'Revert'),
    remove: tr('Entfernung', 'Removal'),
  };

  return (
    <div className="staging-commit-fields">
      <div className="staging-commit-title-field">
        <div className="staging-commit-subject">
          <label className="staging-commit-field" htmlFor={`${fieldId}-type`}>
            <span>{tr('Typ', 'Type')}</span>
            <select
              id={`${fieldId}-type`}
              className="staging-commit-control"
              value={subject.type}
              title={subject.type ? typeLabels[subject.type] : tr('Commit ohne Typ', 'Commit without a type')}
              onChange={(event) => commitForm.setCommitSubject({ type: event.target.value as CommitType })}
              disabled={disabled}
            >
              <option value="" title={tr('Commit ohne Typ', 'Commit without a type')}>
                {tr('Standard', 'Default')}
              </option>
              {COMMIT_TYPES.map((type) => (
                <option key={type} value={type} title={typeLabels[type]}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="staging-commit-field" htmlFor={`${fieldId}-scope`}>
            <span>{subject.type ? tr('Bereich (optional)', 'Scope (optional)') : tr('Präfix (optional)', 'Prefix (optional)')}</span>
            <input
              id={`${fieldId}-scope`}
              className="staging-commit-control"
              placeholder={subject.type ? tr('z. B. backend', 'e.g. backend') : tr('Text vor der Nachricht', 'Text before the message')}
              value={subject.scope}
              onChange={(event) => commitForm.setCommitSubject({ scope: event.target.value })}
              disabled={disabled}
              spellCheck={false}
            />
          </label>
          <label className="staging-commit-field staging-commit-message-field" htmlFor={`${fieldId}-message`}>
            <span>{tr('Nachricht', 'Message')}</span>
            <textarea
              ref={messageField}
              id={`${fieldId}-message`}
              className="staging-commit-control staging-commit-input staging-commit-message"
              aria-describedby={titleRequirement ? titleHintId : undefined}
              placeholder={
                hasOpenConflicts
                  ? t('generated.components.staging_area.stagingcommitpanel.resolve_conflicts_then_commit_507014dd')
                  : tr('Was hat sich geändert?', 'What changed?')
              }
              value={subject.message}
              onChange={(event) => commitForm.setCommitSubject({ message: event.target.value })}
              disabled={disabled}
              rows={1}
            />
          </label>
        </div>
        {commitForm.commitMsg.trim() && (subject.type || subject.scope.trim()) && (
          <div className="staging-commit-preview">
            <span>{tr('Vorschau', 'Preview')}</span>
            <code>{commitForm.commitMsg}</code>
          </div>
        )}
        <ActionRequirementHelp id={titleHintId} reason={titleRequirement} remedy={{ onClick: () => messageField.current?.focus() }} />
      </div>
      <label className="staging-commit-field" htmlFor={`${fieldId}-description`}>
        <span>{tr('Beschreibung (optional)', 'Description (optional)')}</span>
        <textarea
          id={`${fieldId}-description`}
          className="staging-commit-input staging-commit-description"
          placeholder={tr('Zusätzlicher Kontext zu den Änderungen…', 'Additional context for these changes…')}
          value={commitForm.commitDescription}
          onChange={(event) => commitForm.setCommitDescription(event.target.value)}
          disabled={disabled}
          rows={2}
        />
      </label>
    </div>
  );
};
