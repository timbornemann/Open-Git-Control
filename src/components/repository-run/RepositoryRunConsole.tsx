import React, { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, Copy, FileWarning, Square, Terminal } from 'lucide-react';
import type { RepositoryRunStateDto } from '@/types/repositoryRun';
import { parseRepositoryRunOutput } from '@/utils/repositoryRunOutput';
import { cleanRepositoryRunLines } from '@/utils/repositoryRunMessages';
import { createRunConsoleEntries } from '@/utils/repositoryRunPresentation';
import { copyTextToClipboard } from '@/utils/clipboard';
import { useI18n } from '@/i18n';
import { useRepositoryContext } from '@/contexts/AppStateContext';
import { RepositoryRunOutputPane } from './RepositoryRunOutputPane';
import { RepositoryRunProblemHint, RepositoryRunProblems } from './RepositoryRunProblems';
import '@/styles/repository-run.css';

type Props = { run: RepositoryRunStateDto; onStop: () => void; onBack: () => void };
type ConsoleTab = 'output' | 'problems' | 'summary';

export const RepositoryRunConsole: React.FC<Props> = ({ run, onStop, onBack }) => {
  const { tr, locale } = useI18n();
  const { onToast } = useRepositoryContext();
  const tabId = useId();
  const [tab, setTab] = useState<ConsoleTab>('output');
  const [focusSequence, setFocusSequence] = useState<number>();
  useEffect(() => {
    setTab('output');
    setFocusSequence(undefined);
  }, [run.runId]);
  const lines = useMemo(() => cleanRepositoryRunLines(run.output), [run.output]);
  const entries = useMemo(() => createRunConsoleEntries(lines), [lines]);
  const problems = useMemo(() => parseRepositoryRunOutput(lines, (index) => run.steps[index]?.parser || 'none'), [lines, run.steps]);
  const errors = problems.filter((problem) => problem.severity === 'error');
  const warnings = problems.filter((problem) => problem.severity === 'warning');
  const cause = errors[0];
  const isRunning = run.status === 'running';
  const statusLabel =
    run.status === 'running'
      ? tr('Läuft', 'Running')
      : run.status === 'succeeded'
        ? tr('Erfolgreich', 'Succeeded')
        : run.status === 'cancelled'
          ? tr('Gestoppt', 'Stopped')
          : tr('Fehlgeschlagen', 'Failed');
  const outputText = useMemo(() => lines.map((line) => line.text).join('\n'), [lines]);
  const problemsText = useMemo(
    () =>
      problems
        .map(
          (problem) =>
            `${problem.file ? `${problem.file}:${problem.line}:${problem.column}` : problem.severity.toUpperCase()} ${problem.message}${problem.count ? ` (×${problem.count})` : ''}`,
        )
        .join('\n'),
    [problems],
  );
  const copy = async (text: string, copiedMessage: string) => {
    const copied = await copyTextToClipboard(text);
    onToast(copied ? copiedMessage : tr('Kopieren in die Zwischenablage fehlgeschlagen.', 'Could not copy to the clipboard.'), !copied);
  };
  const copyAction =
    tab === 'output'
      ? { text: outputText, label: tr('Ausgabe kopieren', 'Copy output'), message: tr('Konsolenausgabe kopiert.', 'Console output copied.') }
      : tab === 'problems'
        ? { text: problemsText, label: tr('Probleme kopieren', 'Copy problems'), message: tr('Probleme kopiert.', 'Problems copied.') }
        : null;
  const showOutput = (sequence: number) => {
    setFocusSequence(sequence);
    setTab('output');
  };
  return (
    <section className="repository-run-console">
      <header className="repository-run-console__header">
        <div>
          <div className="repository-run-console__title">
            <Terminal size={17} />
            {run.action.toUpperCase()}
          </div>
          <div className="repository-run-console__meta" title={run.repoPath}>
            {run.repoPath}
          </div>
        </div>
        <div className="repository-run-console__actions">
          <span className={`repository-run-console__status repository-run-console__status--${run.status}`}>{statusLabel}</span>
          {copyAction && (
            <button className="staging-tool-btn" onClick={() => void copy(copyAction.text, copyAction.message)} disabled={!copyAction.text}>
              <Copy size={13} />
              {copyAction.label}
            </button>
          )}
          {isRunning && (
            <button className="staging-tool-btn danger" onClick={onStop}>
              <Square size={13} />
              {tr('Stoppen', 'Stop')}
            </button>
          )}
          <button className="staging-tool-btn" onClick={onBack}>
            {tr('Zum Repository', 'Back to repository')}
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
      {cause && run.status === 'failed' && (
        <div className="repository-run-console__failure">
          <AlertCircle size={16} />
          <div>
            <strong>{cause.message}</strong>
            <RepositoryRunProblemHint problem={cause} />
          </div>
          <button className="staging-tool-btn" onClick={() => setTab('problems')}>
            {tr('Probleme öffnen', 'Open problems')}
          </button>
        </div>
      )}
      <div className="repository-run-console__tabs" role="tablist" aria-label={tr('Laufergebnis', 'Run result')}>
        {(['output', 'problems', 'summary'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            id={`${tabId}-${value}`}
            aria-controls={`${tabId}-panel`}
            aria-selected={tab === value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
          >
            {value === 'output' ? (
              tr('Konsole', 'Console')
            ) : value === 'problems' ? (
              <>
                <FileWarning size={13} />
                {tr('Probleme', 'Problems')} ({problems.length})
              </>
            ) : (
              tr('Zusammenfassung', 'Summary')
            )}
          </button>
        ))}
        <span className="repository-run-console__counts">
          <span className="is-error">
            {errors.length} {errors.length === 1 ? tr('Fehler', 'error') : tr('Fehler', 'errors')}
          </span>
          <span className="is-warning">
            {warnings.length} {warnings.length === 1 ? tr('Warnung', 'warning') : tr('Warnungen', 'warnings')}
          </span>
        </span>
      </div>
      <div className="repository-run-console__tab-panel" id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`}>
        {tab === 'output' && <RepositoryRunOutputPane key={run.runId} lines={lines} entries={entries} focusSequence={focusSequence} />}
        {tab === 'problems' && <RepositoryRunProblems problems={problems} onShowOutput={showOutput} />}
        {tab === 'summary' && (
          <div className="repository-run-console__summary">
            <dl>
              <div>
                <dt>{tr('Aktion', 'Action')}</dt>
                <dd>{run.action}</dd>
              </div>
              <div>
                <dt>{tr('Status', 'Status')}</dt>
                <dd>{statusLabel}</dd>
              </div>
              <div>
                <dt>{tr('Schritte', 'Steps')}</dt>
                <dd>{run.stepCount}</dd>
              </div>
              <div>
                <dt>{tr('Start', 'Started')}</dt>
                <dd>{new Date(run.startedAt).toLocaleString(locale)}</dd>
              </div>
              {run.finishedAt && (
                <div>
                  <dt>{tr('Dauer', 'Duration')}</dt>
                  <dd>{((run.finishedAt - run.startedAt) / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} s</dd>
                </div>
              )}
              {run.exitCode !== undefined && (
                <div>
                  <dt>{tr('Exit-Code', 'Exit code')}</dt>
                  <dd>{run.exitCode ?? '—'}</dd>
                </div>
              )}
            </dl>
            {run.message && <p>{run.message}</p>}
            <h3>{tr('Erkannte Probleme', 'Detected problems')}</h3>
            <RepositoryRunProblems problems={problems} onShowOutput={showOutput} />
          </div>
        )}
      </div>
    </section>
  );
};
