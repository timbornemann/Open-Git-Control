import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { parseGitReflog } from '@/utils/gitParsing';
import type { AppSettingsDto } from '@/types/appDtos';
import type { GitCommandNameDto } from '@/types/gitDtos';
import type { GitReflogEntryDto } from '@/types/git';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
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
  const { t } = useI18n();
  const [entries, setEntries] = useState<GitReflogEntryDto[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dangerAction, setDangerAction] = useState<DangerAction>(null);

  const loadReflog = useCallback(async () => {
    if (!gitClient.isAvailable()) return;
    setIsLoading(true);
    try {
      const result = await gitClient.runGitCommand('reflog', '300');
      if (!result.success) {
        setEntries([]);
        return;
      }
      const parsed = parseGitReflog(String(result.data || ''));
      setEntries(parsed);
      setSelectedHash((current) => (current && parsed.some((e) => e.hash === current) ? current : (parsed[0]?.hash ?? null)));
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

  const runAction = useCallback(
    async (args: string[]) => {
      if (!gitClient.isAvailable() || args.length === 0) return;
      const result = await gitClient.runGitCommand(args[0] as GitCommandNameDto, ...args.slice(1));
      if (result.success) {
        onRepoChanged();
        await loadReflog();
      }
    },
    [loadReflog, onRepoChanged],
  );

  const runDangerAware = useCallback(
    async (payload: Exclude<DangerAction, null>) => {
      if (settings.confirmDangerousOps) {
        setDangerAction(payload);
        return;
      }
      await payload.run();
    },
    [settings.confirmDangerousOps],
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', height: '100%' }}>
      <div style={{ borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 10, borderBottom: '1px solid var(--border-color)' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('generated.components.recoverycenter.filter_reflog_commit_action_date_b0b21090')}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ overflow: 'auto' }}>
          {isLoading && <div style={{ padding: 10 }}>{t('generated.components.recoverycenter.loading_reflog_305d6291')}</div>}
          {!isLoading && filtered.length === 0 && (
            <div style={{ padding: 10, color: 'var(--text-secondary)' }}>{t('generated.components.recoverycenter.no_reflog_entries_found_78f44a49')}</div>
          )}
          {filtered.map((entry) => (
            <button
              key={`${entry.selector}-${entry.hash}`}
              className="icon-btn"
              onClick={() => setSelectedHash(entry.hash)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                borderRadius: 0,
                borderBottom: '1px solid var(--border-color)',
                padding: '8px 10px',
                background: selected?.hash === entry.hash ? 'var(--bg-dark)' : 'transparent',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {entry.selector} • {entry.date}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{entry.abbrevHash}</div>
              <div style={{ fontSize: '0.82rem' }}>{entry.subject || '-'}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!selected ? (
          <div style={{ color: 'var(--text-secondary)' }}>{t('generated.components.recoverycenter.select_a_reflog_entry_2e3edbe5')}</div>
        ) : (
          <>
            <div style={{ fontWeight: 700 }}>{t('generated.components.recoverycenter.reflog_details_e7c5325b')}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selected.selector}</div>
            <code style={{ fontSize: '0.8rem' }}>{selected.hash}</code>
            <div style={{ fontSize: '0.86rem' }}>{selected.subject || '-'}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selected.date}</div>

            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="icon-btn"
                onClick={() => {
                  const defaultName = `recovery-${selected.abbrevHash}`;
                  const name = window.prompt(t('generated.components.recoverycenter.recovery_branch_name_7dd1650e'), defaultName);
                  const trimmed = String(name || '').trim();
                  if (!trimmed) return;
                  void runAction(['checkout', '-b', trimmed, selected.hash]);
                }}
              >
                {t('generated.components.recoverycenter.create_branch_from_entry_605eb742')}
              </button>

              <button
                className="icon-btn"
                onClick={() =>
                  void runDangerAware({
                    title: t('generated.components.recoverycenter.detached_checkout_3c9fd080'),
                    message: t('generated.components.recoverycenter.you_will_checkout_this_commit_directly_without_a_branch_153b7dd0'),
                    confirmLabel: t('generated.components.recoverycenter.run_detached_checkout_b4ea704c'),
                    run: async () => runAction(['checkout', selected.hash]),
                  })
                }
              >
                {t('generated.components.recoverycenter.detached_checkout_04424e95')}
              </button>

              <button
                className="icon-btn"
                style={{ borderColor: 'var(--status-danger-border)', color: 'var(--status-danger)' }}
                onClick={() =>
                  void runDangerAware({
                    title: t('generated.components.recoverycenter.run_hard_reset_77b9e84d'),
                    message: t('generated.components.recoverycenter.resets_head_and_working_tree_to_this_reflog_commit_unsav_7ef0a45f'),
                    confirmLabel: t('generated.components.recoverycenter.run_hard_reset_dadae533'),
                    run: async () => runAction(['reset', '--hard', selected.hash]),
                  })
                }
              >
                {t('generated.components.recoverycenter.hard_reset_with_confirmation_b178e726')}
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
