import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Archive } from 'lucide-react';
import { GitStashEntryDto } from '../../global';
import { useI18n } from '../../i18n';
import { EmptyState } from '../EmptyState';

type Props = {
  repoPath: string | null;
  onRepoChanged?: () => void;
  onShowDiff?: (stashName: string) => void;
  /** Used to trigger a stash list refresh after operations outside this panel */
  refreshTrigger?: number;
};

type StashOp = 'apply' | 'pop' | 'drop';

export const StashPanel: React.FC<Props> = ({ repoPath, onRepoChanged, refreshTrigger }) => {
  const { tr } = useI18n();
  const [collapsed, setCollapsed] = useState(true);
  const [stashes, setStashes] = useState<GitStashEntryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOp, setPendingOp] = useState<{ name: string; op: StashOp } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repoPath || !window.electronAPI) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.getStashes();
      if (result.success) {
        setStashes((result as any).data ?? []);
      } else {
        setError((result as any).error || tr('Stash-Liste konnte nicht geladen werden.', 'Failed to load stash list.'));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [repoPath, tr]);

  useEffect(() => {
    if (!collapsed) void load();
  }, [collapsed, load, refreshTrigger]);

  const runStashOp = async (stashName: string, op: StashOp) => {
    if (!window.electronAPI) return;
    try {
      let args: string[];
      if (op === 'apply') {
        args = ['stash', 'apply', stashName];
      } else if (op === 'pop') {
        args = ['stash', 'pop', stashName];
      } else {
        args = ['stash', 'drop', stashName];
      }
      const result = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (result.success) {
        await load();
        if (op !== 'drop') onRepoChanged?.();
      } else {
        setError(result.error || tr('Stash-Operation fehlgeschlagen.', 'Stash operation failed.'));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPendingOp(null);
    }
  };

  const handleOp = (stash: GitStashEntryDto, op: StashOp) => {
    if (op === 'drop') {
      setPendingOp({ name: stash.name, op });
      return;
    }
    void runStashOp(stash.name, op);
  };

  return (
    <div className="stash-panel">
      <button
        className="stash-panel-header"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? tr('Stashes anzeigen', 'Show stashes') : tr('Stashes einklappen', 'Collapse stashes')}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <Archive size={13} style={{ opacity: 0.7 }} />
        <span>{tr('Stashes', 'Stashes')}</span>
        {stashes.length > 0 && !collapsed && (
          <span className="stash-panel-count">{stashes.length}</span>
        )}
      </button>

      {!collapsed && (
        <div className="stash-panel-body">
          {loading && (
            <div className="stash-panel-hint">{tr('Lade Stashes...', 'Loading stashes...')}</div>
          )}

          {!loading && error && (
            <div className="stash-panel-hint stash-panel-hint--error">{error}</div>
          )}

          {!loading && !error && stashes.length === 0 && (
            <EmptyState
              icon={<Archive size={24} />}
              title={tr('Keine Stashes vorhanden.', 'No stashes found.')}
              description={tr('Erstelle einen Stash ueber den Stash-Button in der Toolbar.', 'Create a stash with the stash button in the toolbar.')}
            />
          )}

          {!loading && stashes.map((stash) => (
            <div key={stash.name} className="stash-entry">
              {pendingOp?.name === stash.name && pendingOp.op === 'drop' ? (
                <div className="stash-entry-confirm">
                  <span className="stash-entry-confirm-msg">
                    {tr(`"${stash.subject}" loeschen?`, `Delete "${stash.subject}"?`)}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    <button
                      className="staging-btn-sm staging-btn-danger"
                      onClick={() => { void runStashOp(stash.name, 'drop'); }}
                    >
                      {tr('Loeschen', 'Delete')}
                    </button>
                    <button
                      className="staging-btn-sm"
                      onClick={() => setPendingOp(null)}
                    >
                      {tr('Abbrechen', 'Cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="stash-entry-meta">
                    <span className="stash-entry-name">{stash.name}</span>
                    <span className="stash-entry-branch">({stash.branch})</span>
                  </div>
                  <div className="stash-entry-subject" title={stash.subject}>
                    {stash.subject}
                  </div>
                  <div className="stash-entry-actions">
                    <button
                      className="staging-btn-sm"
                      onClick={() => handleOp(stash, 'apply')}
                      title={tr('Stash anwenden (behaelt Stash)', 'Apply stash (keep stash)')}
                    >
                      {tr('Apply', 'Apply')}
                    </button>
                    <button
                      className="staging-btn-sm"
                      onClick={() => handleOp(stash, 'pop')}
                      title={tr('Stash anwenden und loeschen', 'Apply and delete stash')}
                    >
                      {tr('Pop', 'Pop')}
                    </button>
                    <button
                      className="staging-btn-sm staging-btn-danger"
                      onClick={() => handleOp(stash, 'drop')}
                      title={tr('Stash loeschen', 'Delete stash')}
                    >
                      {tr('Drop', 'Drop')}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
