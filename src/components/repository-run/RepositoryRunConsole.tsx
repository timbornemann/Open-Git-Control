import React, { useMemo, useState } from 'react';
import { AlertCircle, FileWarning, Square, Terminal } from 'lucide-react';
import type { RepositoryRunStateDto } from '@/types/repositoryRun';
import { parseRepositoryRunOutput } from '@/utils/repositoryRunOutput';
import { useI18n } from '@/i18n';
import '@/styles/repository-run.css';

type Props = {
  run: RepositoryRunStateDto;
  onStop: () => void;
  onBack: () => void;
};

type ConsoleTab = 'output' | 'problems' | 'summary';

export const RepositoryRunConsole: React.FC<Props> = ({ run, onStop, onBack }) => {
  const { tr } = useI18n();
  const [tab, setTab] = useState<ConsoleTab>('output');
  const problems = useMemo(() => parseRepositoryRunOutput(run.output, (index) => run.steps[index]?.parser || 'none'), [run.output, run.steps]);
  const isRunning = run.status === 'running';
  const statusLabel =
    run.status === 'running'
      ? tr('Läuft', 'Running')
      : run.status === 'succeeded'
        ? tr('Erfolgreich', 'Succeeded')
        : run.status === 'cancelled'
          ? tr('Gestoppt', 'Stopped')
          : tr('Fehlgeschlagen', 'Failed');

  return (
    <section className="repository-run-console">
      <header className="repository-run-console__header">
        <div>
          <div className="repository-run-console__title">
            <Terminal size={17} /> {run.action.toUpperCase()}
          </div>
          <div className="repository-run-console__meta" title={run.repoPath}>
            {run.repoPath}
          </div>
        </div>
        <div className="repository-run-console__actions">
          <span className={`repository-run-console__status repository-run-console__status--${run.status}`}>{statusLabel}</span>
          {isRunning && (
            <button className="staging-tool-btn danger" onClick={onStop}>
              <Square size={13} /> {tr('Stoppen', 'Stop')}
            </button>
          )}
          <button className="staging-tool-btn" onClick={onBack}>
            {tr('Zum Graphen', 'Back to graph')}
          </button>
        </div>
      </header>
      <div className="repository-run-console__steps">
        {run.steps.map((step, index) => (
          <span key={`${step.label}-${index}`} className={index === run.activeStepIndex ? 'active' : ''}>
            {index + 1}. {step.label}
          </span>
        ))}
      </div>
      <div className="repository-run-console__tabs" role="tablist">
        <button className={tab === 'output' ? 'active' : ''} onClick={() => setTab('output')}>
          {tr('Konsole', 'Console')}
        </button>
        <button className={tab === 'problems' ? 'active' : ''} onClick={() => setTab('problems')}>
          <FileWarning size={13} /> {tr('Probleme', 'Problems')} ({problems.length})
        </button>
        <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>
          {tr('Zusammenfassung', 'Summary')}
        </button>
      </div>
      {tab === 'output' && (
        <pre className="repository-run-console__output">
          {run.output.map((line) => (
            <code key={line.sequence} className={`repository-run-console__line repository-run-console__line--${line.stream}`}>
              {line.text || ' '}
              {'\n'}
            </code>
          ))}
        </pre>
      )}
      {tab === 'problems' && (
        <div className="repository-run-console__problems">
          {problems.length === 0 ? (
            <p>{tr('Keine auswertbaren Probleme gefunden.', 'No parseable problems found.')}</p>
          ) : (
            problems.map((problem) => (
              <article key={problem.sequence} className={`repository-run-console__problem ${problem.severity}`}>
                <AlertCircle size={15} />
                <div>
                  <strong>{problem.file ? `${problem.file}:${problem.line}:${problem.column}` : problem.severity}</strong>
                  <div>{problem.message}</div>
                </div>
              </article>
            ))
          )}
        </div>
      )}
      {tab === 'summary' && (
        <div className="repository-run-console__summary">
          <p>
            {tr('Aktion', 'Action')}: <strong>{run.action}</strong>
          </p>
          <p>
            {tr('Schritte', 'Steps')}: {run.stepCount}
          </p>
          <p>
            {tr('Status', 'Status')}: {statusLabel}
          </p>
          {run.exitCode !== undefined && (
            <p>
              {tr('Exit-Code', 'Exit code')}: {run.exitCode ?? '—'}
            </p>
          )}
          {run.message && <p>{run.message}</p>}
        </div>
      )}
    </section>
  );
};
