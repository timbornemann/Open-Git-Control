import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, ChevronsDown, Info, Terminal } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { RepositoryRunOutputLineDto } from '@/types/repositoryRun';
import { classifyRunMessage } from '@/utils/repositoryRunMessages';
import type { RunConsoleEntry } from '@/utils/repositoryRunPresentation';
import { RepositoryRunLinkedText, type RepositoryRunFileLinkProps } from './RepositoryRunLinkedText';

type Props = { lines: RepositoryRunOutputLineDto[]; entries: RunConsoleEntry[]; focusSequence?: number } & RepositoryRunFileLinkProps;
const EntryIcon = ({ kind }: { kind: RunConsoleEntry['kind'] }) =>
  kind === 'error' || kind === 'cascade' ? (
    <AlertCircle size={13} />
  ) : kind === 'warning' ? (
    <AlertTriangle size={13} />
  ) : kind === 'success' ? (
    <Check size={13} />
  ) : kind === 'command' ? (
    <Terminal size={13} />
  ) : kind === 'info' || kind === 'watch' ? (
    <Info size={13} />
  ) : (
    <span />
  );

export function RepositoryRunOutputPane({ lines, entries, focusSequence, repoPath, onOpenFile }: Props) {
  const { tr } = useI18n();
  const [mode, setMode] = useState<'structured' | 'plain'>('structured');
  const [filter, setFilter] = useState<'all' | 'warning' | 'error'>('all');
  const [following, setFollowing] = useState(true);
  const [wrap, setWrap] = useState(true);
  const pane = useRef<HTMLDivElement>(null);
  const explicitlyPaused = useRef(false);
  const lastSequence = lines.at(-1)?.sequence;
  useEffect(() => {
    if (following && pane.current) pane.current.scrollTop = pane.current.scrollHeight;
  }, [lastSequence, following, mode, filter]);
  useEffect(() => {
    if (focusSequence === undefined) return;
    setMode('plain');
    setFilter('all');
    explicitlyPaused.current = true;
    setFollowing(false);
  }, [focusSequence]);
  useEffect(() => {
    if (mode === 'plain' && focusSequence !== undefined) {
      pane.current?.querySelector<HTMLElement>(`[data-sequence="${focusSequence}"]`)?.scrollIntoView?.({ block: 'center' });
      pane.current?.focus({ preventScroll: true });
    }
  }, [focusSequence, mode]);
  const matches = (kind: RunConsoleEntry['kind']) => filter === 'all' || kind === filter || (filter === 'error' && kind === 'cascade');
  const shownEntries = entries.filter((entry) => matches(entry.kind));
  const shownLines = filter === 'all' ? lines : lines.filter((line) => matches(classifyRunMessage(line).kind));
  return (
    <div className="repository-run-console__pane">
      <div className="repository-run-console__output-tools">
        <div className="repository-run-console__view-switch" aria-label={tr('Ausgabedarstellung', 'Output view')}>
          <button aria-pressed={mode === 'structured'} onClick={() => setMode('structured')}>
            {tr('Aufbereitet', 'Structured')}
          </button>
          <button aria-pressed={mode === 'plain'} onClick={() => setMode('plain')}>
            {tr('Textausgabe', 'Plain text')}
          </button>
        </div>
        <label className="repository-run-console__filter">
          <span>{tr('Anzeigen', 'Show')}</span>
          <select
            className="ui-field"
            aria-label={tr('Ausgabe filtern', 'Filter output')}
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            <option value="all">{tr('Alle Meldungen', 'All messages')}</option>
            <option value="warning">{tr('Warnungen', 'Warnings')}</option>
            <option value="error">{tr('Fehler', 'Errors')}</option>
          </select>
        </label>
        <label className="repository-run-console__wrap">
          <input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />
          {tr('Zeilenumbruch', 'Wrap lines')}
        </label>
        <button
          className="staging-tool-btn repository-run-console__follow"
          aria-pressed={following}
          onClick={() =>
            setFollowing((value) => {
              explicitlyPaused.current = value;
              return !value;
            })
          }
        >
          <ChevronsDown size={13} />
          {tr('Ausgabe folgen', 'Follow output')}
        </button>
      </div>
      <div
        ref={pane}
        className={`repository-run-console__output ${wrap ? 'is-wrapped' : ''}`}
        onScroll={() => {
          const element = pane.current;
          if (element) setFollowing(!explicitlyPaused.current && element.scrollHeight - element.scrollTop - element.clientHeight < 40);
        }}
        tabIndex={0}
        aria-label={tr('Konsolenausgabe', 'Console output')}
      >
        {(mode === 'structured' ? shownEntries.length : shownLines.length) === 0 && (
          <p className="repository-run-console__empty">
            {lines.length ? tr('Keine passenden Meldungen.', 'No matching messages.') : tr('Warte auf Ausgabe…', 'Waiting for output…')}
          </p>
        )}
        {mode === 'plain' ? (
          <pre className="repository-run-console__transcript">
            {shownLines.map((line) => (
              <code
                data-sequence={line.sequence}
                key={line.sequence}
                className={`repository-run-console__line repository-run-console__line--${classifyRunMessage(line).kind}${line.sequence === focusSequence ? ' is-target' : ''}`}
              >
                <RepositoryRunLinkedText text={line.text || ' '} repoPath={repoPath} onOpenFile={onOpenFile} />
                {'\n'}
              </code>
            ))}
          </pre>
        ) : (
          shownEntries.map((entry) => (
            <div data-sequence={entry.sequence} key={entry.sequence} className={`repository-run-console__entry repository-run-console__line--${entry.kind}`}>
              <span className="repository-run-console__entry-icon">
                <EntryIcon kind={entry.kind} />
              </span>
              <div className="repository-run-console__entry-content">
                <div className="repository-run-console__entry-line">
                  {entry.tool && <span className="repository-run-console__tool">{entry.tool}</span>}
                  <code>
                    {entry.group === 'watch' ? (
                      tr(`${entry.count} Pfade werden auf Änderungen überwacht`, `Watching ${entry.count} paths for changes`)
                    ) : (
                      <RepositoryRunLinkedText text={entry.text} repoPath={repoPath} onOpenFile={onOpenFile} />
                    )}
                  </code>
                  {entry.count > 1 && entry.group !== 'watch' && <span className="repository-run-console__repeat">×{entry.count}</span>}
                </div>
                {!!entry.details.length && (
                  <details>
                    <summary>
                      {entry.group === 'watch'
                        ? tr('Pfade anzeigen', 'Show paths')
                        : entry.group === 'progress'
                          ? tr('Verlauf', 'Updates')
                          : tr('Details', 'Details')}{' '}
                      ({entry.details.length})
                    </summary>
                    <pre>
                      <RepositoryRunLinkedText text={entry.details.join('\n')} repoPath={repoPath} onOpenFile={onOpenFile} />
                    </pre>
                  </details>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
