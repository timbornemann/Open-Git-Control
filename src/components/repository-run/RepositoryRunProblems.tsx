import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { RepositoryRunProblem } from '@/utils/repositoryRunOutput';

export function RepositoryRunProblemHint({ problem }: { problem: RepositoryRunProblem }) {
  const { tr } = useI18n();
  const port = problem.message.match(/\bport\s+(\d+)/i)?.[1];
  const hint =
    problem.hint === 'port-in-use'
      ? tr(
          `Beende den anderen Entwicklungsserver${port ? ` auf Port ${port}` : ''} oder wähle in deiner Projektkonfiguration einen freien Port.`,
          `Stop the other development server${port ? ` on port ${port}` : ''} or choose a free port in your project configuration.`,
        )
      : problem.hint === 'engine-mismatch'
        ? tr(
            'Verwende eine vom Projekt unterstützte Node.js-Version. Die erwartete und die verwendete Version stehen in der Meldung.',
            'Use a Node.js version supported by the project. The message lists the expected and current versions.',
          )
        : problem.hint === 'missing-command'
          ? tr(
              'Installiere das benötigte Werkzeug und prüfe, ob es über den PATH erreichbar ist. Starte den Schritt danach erneut.',
              'Install the required tool and check that it is available on PATH, then run the step again.',
            )
          : problem.hint === 'missing-dependency'
            ? tr(
                'Installiere die Projektabhängigkeiten mit dem Paketmanager des Projekts und starte den Schritt erneut.',
                'Install the project dependencies using its package manager, then run the step again.',
              )
            : '';
  return hint ? <p className="repository-run-console__hint">{hint}</p> : null;
}

export function RepositoryRunProblems({ problems, onShowOutput }: { problems: RepositoryRunProblem[]; onShowOutput: (sequence: number) => void }) {
  const { tr } = useI18n();
  if (!problems.length) return <p className="repository-run-console__empty">{tr('Keine auswertbaren Probleme gefunden.', 'No parseable problems found.')}</p>;
  return (
    <div className="repository-run-console__problems">
      {problems.map((problem) => (
        <article key={problem.sequence} className={`repository-run-console__problem ${problem.severity}`}>
          {problem.severity === 'warning' ? <AlertTriangle size={16} /> : <AlertCircle size={16} />}
          <div>
            <div className="repository-run-console__problem-meta">
              <strong>{problem.severity === 'warning' ? tr('Warnung', 'Warning') : tr('Fehler', 'Error')}</strong>
              {problem.tool && <span>{problem.tool}</span>}
              {!!problem.count && problem.count > 1 && <span>×{problem.count}</span>}
              {problem.file && (
                <code>
                  {problem.file}:{problem.line}:{problem.column}
                </code>
              )}
            </div>
            <div className="repository-run-console__problem-message">{problem.message}</div>
            <RepositoryRunProblemHint problem={problem} />
            {!!problem.details?.length && (
              <details>
                <summary>
                  {tr('Technische Details', 'Technical details')} ({problem.details.length})
                </summary>
                <pre>{problem.details.join('\n')}</pre>
              </details>
            )}
            <button className="staging-tool-btn" onClick={() => onShowOutput(problem.sequence)}>
              {tr('In Konsole anzeigen', 'Show in console')}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
