import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { RepositoryRunProblem } from '@/utils/repositoryRunOutput';
import { resolveRepositoryRunFile } from '@/utils/repositoryRunFileLinks';
import { RepositoryRunFileLink, RepositoryRunLinkedText, type RepositoryRunFileLinkProps } from './RepositoryRunLinkedText';

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

export function RepositoryRunProblems({
  problems,
  onShowOutput,
  repoPath,
  onOpenFile,
}: { problems: RepositoryRunProblem[]; onShowOutput: (sequence: number) => void } & RepositoryRunFileLinkProps) {
  const { tr } = useI18n();
  if (!problems.length) return <p className="repository-run-console__empty">{tr('Keine auswertbaren Probleme gefunden.', 'No parseable problems found.')}</p>;
  return (
    <div className="repository-run-console__problems">
      {problems.map((problem) => {
        const target = problem.file ? resolveRepositoryRunFile(repoPath, problem.file, { line: problem.line, column: problem.column }) : null;
        const location = problem.file + (problem.line ? ':' + problem.line + (problem.column ? ':' + problem.column : '') : '');
        return (
          <article key={problem.sequence} className={`repository-run-console__problem ${problem.severity}`}>
            {problem.severity === 'warning' ? <AlertTriangle size={16} /> : <AlertCircle size={16} />}
            <div>
              <div className="repository-run-console__problem-meta">
                <strong>{problem.severity === 'warning' ? tr('Warnung', 'Warning') : tr('Fehler', 'Error')}</strong>
                {problem.tool && <span>{problem.tool}</span>}
                {!!problem.count && problem.count > 1 && <span>×{problem.count}</span>}
                {problem.file && (
                  <code>
                    {target ? (
                      <RepositoryRunFileLink target={target} onOpenFile={onOpenFile}>
                        {location}
                      </RepositoryRunFileLink>
                    ) : (
                      location
                    )}
                  </code>
                )}
              </div>
              <div className="repository-run-console__problem-message">
                <RepositoryRunLinkedText text={problem.message} repoPath={repoPath} onOpenFile={onOpenFile} />
              </div>
              <RepositoryRunProblemHint problem={problem} />
              {!!problem.details?.length && (
                <details>
                  <summary>
                    {tr('Technische Details', 'Technical details')} ({problem.details.length})
                  </summary>
                  <pre>
                    <RepositoryRunLinkedText text={problem.details.join('\n')} repoPath={repoPath} onOpenFile={onOpenFile} />
                  </pre>
                </details>
              )}
              <button className="staging-tool-btn" onClick={() => onShowOutput(problem.sequence)}>
                {tr('In Konsole anzeigen', 'Show in console')}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
