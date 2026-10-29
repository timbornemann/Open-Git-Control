import type { AppLanguage } from '@/i18nCore';
import type { RepositoryRunStateDto } from '@/types/repositoryRun';
import { normalizeTerminalText } from '@/shared/terminalText';
import { cleanRepositoryRunLines } from './repositoryRunMessages';
import type { RepositoryRunProblem } from './repositoryRunOutput';

export function getRepositoryRunProblemHint(problem: RepositoryRunProblem, language: AppLanguage): string {
  const tr = (de: string, en: string) => (language === 'de' ? de : en);
  const port = problem.message.match(/\bport\s+(\d+)/i)?.[1];
  switch (problem.hint) {
    case 'port-in-use':
      return tr(
        `Beende den anderen Entwicklungsserver${port ? ` auf Port ${port}` : ''} oder wähle in deiner Projektkonfiguration einen freien Port.`,
        `Stop the other development server${port ? ` on port ${port}` : ''} or choose a free port in your project configuration.`,
      );
    case 'engine-mismatch':
      return tr(
        'Verwende eine vom Projekt unterstützte Node.js-Version. Die erwartete und die verwendete Version stehen in der Meldung.',
        'Use a Node.js version supported by the project. The message lists the expected and current versions.',
      );
    case 'missing-command':
      return tr(
        'Installiere das benötigte Werkzeug und prüfe, ob es über den PATH erreichbar ist. Starte den Schritt danach erneut.',
        'Install the required tool and check that it is available on PATH, then run the step again.',
      );
    case 'missing-dependency':
      return tr(
        'Installiere die Projektabhängigkeiten mit dem Paketmanager des Projekts und starte den Schritt erneut.',
        'Install the project dependencies using its package manager, then run the step again.',
      );
    default:
      return '';
  }
}

/** Copy the complete available diagnostic and step output without the planner draft's field limits. */
export function buildRepositoryRunBugInfo(run: RepositoryRunStateDto, problem: RepositoryRunProblem, language: AppLanguage): string {
  const tr = (de: string, en: string) => (language === 'de' ? de : en);
  const stepIndex = problem.stepIndex ?? run.output.find((line) => line.sequence === problem.sequence)?.stepIndex;
  const step = stepIndex === undefined ? undefined : run.steps[stepIndex];
  const location = problem.file
    ? problem.file + (problem.line ? `:${problem.line}${problem.column ? `:${problem.column}` : ''}` : '')
    : tr('Keine Dateiposition gemeldet.', 'No file location reported.');
  const hint = getRepositoryRunProblemHint(problem, language);
  const output = cleanRepositoryRunLines(run.output.filter((line) => line.stepIndex === stepIndex))
    .map((line) => line.text)
    .join('\n');
  const severity = { error: tr('Fehler', 'Error'), warning: tr('Warnung', 'Warning'), info: tr('Information', 'Information') }[problem.severity];
  const status = {
    running: tr('Läuft', 'Running'),
    succeeded: tr('Erfolgreich', 'Succeeded'),
    failed: tr('Fehlgeschlagen', 'Failed'),
    cancelled: tr('Gestoppt', 'Stopped'),
  }[run.status];
  const section = (label: string, value: string) => `${label}\n${normalizeTerminalText(value)}`;

  return [
    section(tr('Meldung:', 'Message:'), problem.message),
    `${tr('Schweregrad:', 'Severity:')} ${severity}`,
    ...(problem.tool ? [`${tr('Werkzeug:', 'Tool:')} ${normalizeTerminalText(problem.tool)}`] : []),
    `${tr('Vorkommen:', 'Occurrences:')} ${problem.count ?? 1}`,
    section(tr('Dateiposition:', 'File location:'), location),
    ...(hint ? [section(tr('Hinweis:', 'Hint:'), hint)] : []),
    section(
      tr('Technische Details:', 'Technical details:'),
      problem.details?.join('\n') || tr('Keine weiteren Details verfügbar.', 'No further details available.'),
    ),
    section(tr('Repository:', 'Repository:'), run.repoPath),
    section(tr('Aktion / Schritt:', 'Action / step:'), `${run.action} / ${stepIndex === undefined ? '—' : `${stepIndex + 1}. ${step?.label || '—'}`}`),
    section(
      tr('Ausgeführter Befehl:', 'Executed command:'),
      step?.command || tr('Im gespeicherten Lauf nicht verfügbar.', 'Not available in the captured run.'),
    ),
    ...(step?.shell ? [`Shell: ${step.shell}`] : []),
    ...(step ? [`Parser: ${step.parser}`] : []),
    `${tr('Lauf-ID:', 'Run ID:')} ${normalizeTerminalText(run.runId)}`,
    `${tr('Status:', 'Status:')} ${status}`,
    `${tr('Start:', 'Started:')} ${new Date(run.startedAt).toISOString()}`,
    ...(run.finishedAt !== undefined ? [`${tr('Ende:', 'Finished:')} ${new Date(run.finishedAt).toISOString()}`] : []),
    ...(run.exitCode !== undefined ? [`${tr('Exit-Code:', 'Exit code:')} ${run.exitCode ?? '—'}`] : []),
    ...(run.message ? [section(tr('Laufmeldung:', 'Run message:'), run.message)] : []),
    section(
      tr('Verfügbare Schrittausgabe:', 'Available step output:'),
      output || tr('Keine passenden Logzeilen mehr verfügbar.', 'No matching log lines remain available.'),
    ),
  ].join('\n\n');
}
