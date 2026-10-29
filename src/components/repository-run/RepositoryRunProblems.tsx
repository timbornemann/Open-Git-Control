import { AlertCircle, AlertTriangle, Bug, Copy } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { RepositoryRunProblem } from '@/utils/repositoryRunOutput';
import { getRepositoryRunProblemHint } from '@/utils/repositoryRunBugInfo';
import { resolveRepositoryRunFile } from '@/utils/repositoryRunFileLinks';
import { RepositoryRunFileLink, RepositoryRunLinkedText, type RepositoryRunFileLinkProps } from './RepositoryRunLinkedText';

export function RepositoryRunProblemHint({ problem }: { problem: RepositoryRunProblem }) {
  const { language } = useI18n();
  const hint = getRepositoryRunProblemHint(problem, language);
  return hint ? <p className="repository-run-console__hint">{hint}</p> : null;
}

export function RepositoryRunProblems({
  problems,
  onShowOutput,
  onCreateBug,
  onCopyBugInfo,
  repoPath,
  onOpenFile,
}: {
  problems: RepositoryRunProblem[];
  onShowOutput: (sequence: number) => void;
  onCreateBug: (problem: RepositoryRunProblem) => void;
  onCopyBugInfo: (problem: RepositoryRunProblem) => void;
} & RepositoryRunFileLinkProps) {
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
              <div className="repository-run-console__problem-actions">
                <button type="button" className="staging-tool-btn" onClick={() => onShowOutput(problem.sequence)}>
                  {tr('In Konsole anzeigen', 'Show in console')}
                </button>
                <button type="button" className="staging-tool-btn" onClick={() => onCreateBug(problem)}>
                  <Bug size={13} />
                  {tr('Als Bug aufnehmen', 'Add as bug')}
                </button>
                <button type="button" className="staging-tool-btn" onClick={() => onCopyBugInfo(problem)}>
                  <Copy size={13} aria-hidden="true" />
                  {tr('Bug-Infos kopieren', 'Copy bug info')}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
