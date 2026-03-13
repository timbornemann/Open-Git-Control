import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { parseGitReflog } from '../utils/gitParsing';
import type { AppSettingsDto } from '../global';
import type { GitReflogEntryDto } from '../types/git';
import { useI18n } from '../i18n';
import { DangerConfirm } from './DangerConfirm';

type Props = {
  refreshTrigger: number;
  onRepoChanged: () => void;
  settings: AppSettingsDto;
};

type DangerAction = {
  title: string;
  message: string;
  confirmLabel: string;
  run: () => Promise<void>;
} | null;

export const RecoveryCenter: React.FC<Props> = ({ refreshTrigger, onRepoChanged, settings }) => {
  const { tr } = useI18n();
  const [entries, setEntries] = useState<GitReflogEntryDto[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dangerAction, setDangerAction] = useState<DangerAction>(null);

  const loadReflog = useCallback(async () => {
    if (!window.electronAPI) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.runGitCommand('reflog', '300');
      if (!result.success) {
        setEntries([]);
        return;
      }
      const parsed = parseGitReflog(String(result.data || ''));
      setEntries(parsed);
      setSelectedHash((current) => current && parsed.some((e) => e.hash === current) ? current : (parsed[0]?.hash ?? null));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReflog();
  }, [loadReflog, refreshTrigger]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => [entry.selector, entry.subject, entry.hash, entry.abbrevHash, entry.date].join(' ').toLowerCase().includes(q));
  }, [entries, filter]);

  const selected = useMemo(() => filtered.find((e) => e.hash === selectedHash) ?? filtered[0] ?? null, [filtered, selectedHash]);

  const runAction = useCallback(async (args: string[]) => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
    if (result.success) {
      onRepoChanged();
      await loadReflog();
    }
  }, [loadReflog, onRepoChanged]);

  const runDangerAware = useCallback(async (payload: Exclude<DangerAction, null>) => {
    if (settings.confirmDangerousOps) {
      setDangerAction(payload);
      return;
    }
    await payload.run();
  }, [settings.confirmDangerousOps]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', height: '100%' }}>
      <div style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 10, borderBottom: '1px solid var(--border-color)' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tr('Reflog filtern (Commit, Aktion, Datum)', 'Filter reflog (commit, action, date)')}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ overflow: 'auto' }}>
          {isLoading && <div style={{ padding: 10 }}>{tr('Lade Reflog...', 'Loading reflog...')}</div>}
          {!isLoading && filtered.length === 0 && <div style={{ padding: 10, color: 'var(--text-secondary)' }}>{tr('Keine Reflog-Eintraege gefunden.', 'No reflog entries found.')}</div>}
          {filtered.map((entry) => (
            <button
              key={`${entry.selector}-${entry.hash}`}
              className="icon-btn"
              onClick={() => setSelectedHash(entry.hash)}
              style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0, borderBottom: '1px solid var(--border-color)', padding: '8px 10px', background: selected?.hash === entry.hash ? 'var(--bg-dark)' : 'transparent' }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{entry.selector} • {entry.date}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{entry.abbrevHash}</div>
              <div style={{ fontSize: '0.82rem' }}>{entry.subject || '-'}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!selected ? (
          <div style={{ color: 'var(--text-secondary)' }}>{tr('Waehle einen Reflog-Eintrag aus.', 'Select a reflog entry.')}</div>
        ) : (
          <>
            <div style={{ fontWeight: 700 }}>{tr('Reflog-Details', 'Reflog details')}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selected.selector}</div>
            <code style={{ fontSize: '0.8rem' }}>{selected.hash}</code>
            <div style={{ fontSize: '0.86rem' }}>{selected.subject || '-'}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selected.date}</div>

            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="icon-btn"
                onClick={() => {
                  const defaultName = `recovery-${selected.abbrevHash}`;
                  const name = window.prompt(tr('Branch-Name fuer Wiederherstellung', 'Recovery branch name'), defaultName);
                  const trimmed = String(name || '').trim();
                  if (!trimmed) return;
                  void runAction(['checkout', '-b', trimmed, selected.hash]);
                }}
              >
                {tr('Branch von Eintrag erstellen', 'Create branch from entry')}
              </button>

              <button
                className="icon-btn"
                onClick={() => void runDangerAware({
                  title: tr('Detached Checkout?', 'Detached checkout?'),
                  message: tr('Du checkst den Commit direkt aus, ohne Branch.', 'You will checkout this commit directly, without a branch.'),
                  confirmLabel: tr('Detached Checkout ausfuehren', 'Run detached checkout'),
                  run: async () => runAction(['checkout', selected.hash]),
                })}
              >
                {tr('Detached Checkout', 'Detached checkout')}
              </button>

              <button
                className="icon-btn"
                style={{ borderColor: 'var(--status-danger-border)', color: 'var(--status-danger)' }}
                onClick={() => void runDangerAware({
                  title: tr('Hard Reset ausfuehren?', 'Run hard reset?'),
                  message: tr('Setzt HEAD und Working Tree auf den Reflog-Commit zurueck. Nicht gesicherte Aenderungen gehen verloren.', 'Resets HEAD and working tree to this reflog commit. Unsaved changes will be lost.'),
                  confirmLabel: tr('Hard Reset ausfuehren', 'Run hard reset'),
                  run: async () => runAction(['reset', '--hard', selected.hash]),
                })}
              >
                {tr('Hard reset mit Bestaetigung', 'Hard reset with confirmation')}
              </button>
            </div>
          </>
        )}
      </div>

      {dangerAction && (
        <DangerConfirm
          open={true}
          title={dangerAction.title}
          message={dangerAction.message}
          confirmLabel={dangerAction.confirmLabel}
          onCancel={() => setDangerAction(null)}
          onConfirm={() => {
            const action = dangerAction;
            setDangerAction(null);
            if (action) {
              void action.run();
            }
          }}
        />
      )}
    </div>
  );
};
