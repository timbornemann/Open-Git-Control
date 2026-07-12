import React, { useMemo, useState } from 'react';
import { AlertCircle, Copy, FileWarning, Square, Terminal } from 'lucide-react';
import type { RepositoryRunStateDto } from '@/types/repositoryRun';
import { parseRepositoryRunOutput } from '@/utils/repositoryRunOutput';
import { copyTextToClipboard } from '@/utils/clipboard';
import { useI18n } from '@/i18n';
import { useRepositoryContext } from '@/contexts/AppStateContext';
import '@/styles/repository-run.css';

type Props = {
  run: RepositoryRunStateDto;
  onStop: () => void;
  onBack: () => void;
};

type ConsoleTab = 'output' | 'problems' | 'summary';

export const RepositoryRunConsole: React.FC<Props> = ({ run, onStop, onBack }) => {
  const { tr } = useI18n();
  const { onToast } = useRepositoryContext();
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
  const outputText = useMemo(() => run.output.map((line) => line.text).join('\n'), [run.output]);
  const problemsText = useMemo(
    () =>
      problems
        .map((problem) => `${problem.file ? `${problem.file}:${problem.line}:${problem.column}` : problem.severity.toUpperCase()} ${problem.message}`)
        .join('\n'),
    [problems],
  );
  const copy = async (text: string, copiedMessage: string) => {
    const copied = await copyTextToClipboard(text);
    onToast(copied ? copiedMessage : tr('Kopieren in die Zwischenablage fehlgeschlagen.', 'Could not copy to the clipboard.'), !copied);
  };
  const copyAction =
    tab === 'output'
      ? {
          text: outputText,
          label: tr('Ausgabe kopieren', 'Copy output'),
          message: tr('Konsolenausgabe kopiert.', 'Console output copied.'),
        }
      : tab === 'problems'
        ? {
            text: problemsText,
            label: tr('Probleme kopieren', 'Copy problems'),
            message: tr('Probleme kopiert.', 'Problems copied.'),
          }
        : null;

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
          {copyAction && (
            <button className="staging-tool-btn" onClick={() => void copy(copyAction.text, copyAction.message)} disabled={!copyAction.text}>
              <Copy size={13} /> {copyAction.label}
            </button>
          )}
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
        <div className="repository-run-console__pane">
          <pre className="repository-run-console__output">
            {run.output.map((line) => (
              <code key={line.sequence} className={`repository-run-console__line repository-run-console__line--${line.stream}`}>
                {line.text || ' '}
                {'\n'}
              </code>
            ))}
          </pre>
        </div>
      )}
      {tab === 'problems' && (
        <div className="repository-run-console__pane">
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
