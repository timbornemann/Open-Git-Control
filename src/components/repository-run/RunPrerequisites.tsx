import { AlertCircle, Check, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n';
import { RUN_PROGRAM_LABELS, getRepositoryRunPrerequisiteIssues, type RepositoryRunPrerequisitesDto } from '@/shared/repositoryRunPrerequisites';
import type { RepositoryRunStepDto } from '@/types/repositoryRun';

export function RunPrerequisites({
  report,
  checking,
  failed,
  onRecheck,
}: {
  report?: RepositoryRunPrerequisitesDto;
  checking: boolean;
  failed: boolean;
  onRecheck: () => void;
}) {
  const { tr } = useI18n();
  if (!checking && !failed && !report?.checks.length) return null;
  const checks = report?.checks.filter((check, index, entries) => entries.findIndex((entry) => entry.program === check.program) === index) ?? [];
  return (
    <section className="repository-run-prerequisites" aria-label={tr('Benötigte Programme', 'Required programs')} aria-busy={checking}>
      <div className="repository-run-prerequisites__header">
        <strong>{tr('Benötigte Programme', 'Required programs')}</strong>
        <button className="staging-tool-btn" onClick={onRecheck} disabled={checking}>
          <RefreshCw size={13} className={checking ? 'spin' : ''} />
          {checking ? tr('Prüfe…', 'Checking…') : tr('Erneut prüfen', 'Check again')}
        </button>
      </div>
      <p>
        {tr(
          'Für bekannte Vorlagen auf diesem Betriebssystem. Fehlende Programme installieren oder den Befehl anpassen; vor jedem Start wird erneut geprüft.',
          'For known templates on this operating system. Install missing programs or adjust the command; availability is checked again before every start.',
        )}
      </p>
      {failed ? (
        <p role="status">{tr('Programme konnten nicht geprüft werden. Bitte erneut prüfen.', 'Programs could not be checked. Please check again.')}</p>
      ) : (
        <ul>
          {checks.map((check) => {
            const states = report!.checks.filter((entry) => entry.program === check.program);
            const state = states.some((entry) => entry.state === 'missing')
              ? 'missing'
              : states.some((entry) => entry.state === 'unknown')
                ? 'unknown'
                : 'available';
            return (
              <li key={check.program} data-state={state}>
                {state === 'available' ? <Check size={13} /> : <AlertCircle size={13} />}
                <span>{RUN_PROGRAM_LABELS[check.program]}</span>
                <small>
                  {state === 'available'
                    ? tr('Verfügbar', 'Available')
                    : state === 'missing'
                      ? tr('Nicht gefunden', 'Not found')
                      : tr('Nicht geprüft', 'Not checked')}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function RunPrerequisiteHint({ steps, report }: { steps: Array<Omit<RepositoryRunStepDto, 'id'>>; report?: RepositoryRunPrerequisitesDto }) {
  const { tr } = useI18n();
  const { missing, unknown } = getRepositoryRunPrerequisiteIssues(steps, report);
  const labels = (programs: typeof missing) => programs.map((program) => RUN_PROGRAM_LABELS[program]).join(', ');
  if (!missing.length && !unknown.length) return null;
  return (
    <span className="repository-run-prerequisite-hint" role="status">
      <AlertCircle size={12} />
      {missing.length
        ? tr(`Benötigt: ${labels(missing)} · nicht gefunden`, `Required: ${labels(missing)} · not found`)
        : tr(`Noch zu prüfen: ${labels(unknown)}`, `Still to check: ${labels(unknown)}`)}
    </span>
  );
}
