import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Archive } from 'lucide-react';
import { GitStashEntryDto } from '../../global';
import { useI18n } from '../../i18n';
import { gitClient } from '../../services/gitClient';
import { EmptyState } from '../EmptyState';
import type { InputDialogState } from './types';
import { basename } from './utils';

type Props = {
  repoPath: string | null;
  onRepoChanged?: () => void;
  onShowDiff?: (stashName: string) => void;
  setInputDialog?: (dialog: InputDialogState | null) => void;
  /** Used to trigger a stash list refresh after operations outside this panel */
  refreshTrigger?: number;
};

type StashOp = 'apply' | 'pop' | 'drop';
type StashFileState = {
  loading: boolean;
  files: string[];
  error: string | null;
};

export const StashPanel: React.FC<Props> = ({
  repoPath,
  onRepoChanged,
  setInputDialog,
  refreshTrigger,
}) => {
  const { tr } = useI18n();
  const [collapsed, setCollapsed] = useState(true);
  const [stashes, setStashes] = useState<GitStashEntryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOp, setPendingOp] = useState<{ name: string; op: StashOp } | null>(null);
  const [pendingFileOp, setPendingFileOp] = useState<{ stashName: string; path: string } | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());
  const [stashFiles, setStashFiles] = useState<Record<string, StashFileState>>({});
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

  const loadStashFiles = useCallback(async (stashName: string) => {
    if (!repoPath || !window.electronAPI) return;
    setStashFiles((current) => ({
      ...current,
      [stashName]: { loading: true, files: current[stashName]?.files || [], error: null },
    }));
    try {
      const result = await gitClient.runGitCommand('stash', 'show', '-u', '--name-only', stashName);
      if (!result.success) {
        setStashFiles((current) => ({
          ...current,
          [stashName]: {
            loading: false,
            files: [],
            error: result.error || tr('Stash-Dateien konnten nicht geladen werden.', 'Failed to load stash files.'),
          },
        }));
        return;
      }
      const files = Array.from(new Set(String(result.data || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      setStashFiles((current) => ({
        ...current,
        [stashName]: { loading: false, files, error: null },
      }));
    } catch (e: any) {
      setStashFiles((current) => ({
        ...current,
        [stashName]: { loading: false, files: [], error: e.message },
      }));
    }
  }, [repoPath, tr]);

  useEffect(() => {
    if (!collapsed) void load();
  }, [collapsed, load, refreshTrigger]);

  const runStashOp = async (stashName: string, op: StashOp) => {
    if (!gitClient.isAvailable()) return;
    try {
      let args: string[];
      if (op === 'apply') {
        args = ['stash', 'apply', stashName];
      } else if (op === 'pop') {
        args = ['stash', 'pop', stashName];
      } else {
        args = ['stash', 'drop', stashName];
      }
      const result = await gitClient.runGitCommand('stash', ...args.slice(1));
      if (result.success) {
        if (op === 'pop' || op === 'drop') {
          setExpandedFiles(new Set());
          setStashFiles({});
        }
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

  const branchFromStash = useCallback((stash: GitStashEntryDto) => {
    const api = window.electronAPI;
    if (!api) return;
    if (!setInputDialog) {
      setError(tr('Branch-Dialog ist nicht verfuegbar.', 'Branch dialog is not available.'));
      return;
    }

    const defaultBranchName = `stash-${stash.index}`;
    setInputDialog({
      title: tr('Branch aus Stash erstellen', 'Create branch from stash'),
      message: tr(
        'Git erstellt einen neuen Branch vom urspruenglichen Stash-Base-Commit und wendet den Stash darauf an.',
        'Git creates a new branch from the original stash base commit and applies the stash onto it.',
      ),
      fields: [{
        id: 'branchName',
        label: tr('Branch-Name', 'Branch name'),
        placeholder: defaultBranchName,
        defaultValue: defaultBranchName,
        required: true,
        validate: (value) => {
          if (!value.trim()) {
            return tr('Bitte einen Branch-Namen eingeben.', 'Please enter a branch name.');
          }
          return null;
        },
      }],
      contextItems: [
        { label: tr('Stash', 'Stash'), value: stash.name },
        { label: tr('Beschreibung', 'Description'), value: stash.subject },
      ],
      irreversible: false,
      consequences: tr(
        'Wenn das Anwenden erfolgreich ist, entfernt Git den Stash automatisch aus der Liste.',
        'If applying succeeds, Git automatically removes the stash from the list.',
      ),
      confirmLabel: tr('Branch erstellen', 'Create branch'),
      onSubmit: async (values) => {
        const branchName = String(values.branchName || '').trim();
        setError(null);
        const result = typeof api.gitStashBranch === 'function'
          ? await api.gitStashBranch(stash.name, branchName)
          : await gitClient.runGitCommand('stash', 'branch', branchName, stash.name);

        if (result.success) {
          setExpandedFiles(new Set());
          setStashFiles({});
          await load();
          onRepoChanged?.();
          return;
        }
        setError(result.error || tr('Branch konnte nicht aus dem Stash erstellt werden.', 'Failed to create branch from stash.'));
      },
    });
  }, [load, onRepoChanged, setInputDialog, tr]);

  const toggleFiles = (stash: GitStashEntryDto) => {
    setExpandedFiles((current) => {
      const next = new Set(current);
      if (next.has(stash.name)) {
        next.delete(stash.name);
      } else {
        next.add(stash.name);
        if (!stashFiles[stash.name]) void loadStashFiles(stash.name);
      }
      return next;
    });
  };

  const restoreStashFile = async (stashName: string, filePath: string) => {
    if (!gitClient.isAvailable()) return;
    setPendingFileOp({ stashName, path: filePath });
    setError(null);
    try {
      const trackedResult = await gitClient.runGitCommand('checkout', stashName, '--', filePath);
      const finalResult = trackedResult.success
        ? trackedResult
        : await gitClient.runGitCommand('checkout', `${stashName}^3`, '--', filePath);

      if (finalResult.success) {
        onRepoChanged?.();
      } else {
        setError(trackedResult.error || finalResult.error || tr('Datei konnte nicht aus dem Stash geholt werden.', 'Could not apply file from the stash.'));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPendingFileOp(null);
    }
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
              description={tr('Erstelle einen Stash ueber das Rechtsklickmenue einer Datei.', 'Create a stash from a file row context menu.')}
            />
          )}

          {!loading && stashes.map((stash) => {
            const isExpanded = expandedFiles.has(stash.name);
            const fileState = stashFiles[stash.name];
            return (
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
                        onClick={() => toggleFiles(stash)}
                        title={isExpanded ? tr('Stash-Dateien ausblenden', 'Hide stash files') : tr('Stash-Dateien anzeigen', 'Show stash files')}
                      >
                        {isExpanded ? tr('Dateien ausblenden', 'Hide files') : tr('Dateien', 'Files')}
                      </button>
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
                        className="staging-btn-sm"
                        onClick={() => branchFromStash(stash)}
                        title={tr('Branch aus diesem Stash erstellen', 'Create a branch from this stash')}
                      >
                        {tr('Branch', 'Branch')}
                      </button>
                      <button
                        className="staging-btn-sm staging-btn-danger"
                        onClick={() => handleOp(stash, 'drop')}
                        title={tr('Stash loeschen', 'Delete stash')}
                      >
                        {tr('Drop', 'Drop')}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="stash-file-list">
                        {fileState?.loading && (
                          <div className="stash-panel-hint">{tr('Lade Dateien...', 'Loading files...')}</div>
                        )}
                        {!fileState?.loading && fileState?.error && (
                          <div className="stash-panel-hint stash-panel-hint--error">{fileState.error}</div>
                        )}
                        {!fileState?.loading && !fileState?.error && (fileState?.files || []).length === 0 && (
                          <div className="stash-panel-hint">{tr('Keine Dateien gefunden.', 'No files found.')}</div>
                        )}
                        {!fileState?.loading && !fileState?.error && (fileState?.files || []).map((filePath) => (
                          <div key={`${stash.name}:${filePath}`} className="stash-file-row">
                            <span className="stash-file-path" title={filePath}>{basename(filePath)}</span>
                            <button
                              className="staging-btn-sm"
                              disabled={pendingFileOp !== null}
                              onClick={() => { void restoreStashFile(stash.name, filePath); }}
                              title={tr('Datei aus diesem Stash holen', 'Apply file from this stash')}
                            >
                              {pendingFileOp?.stashName === stash.name && pendingFileOp.path === filePath
                                ? tr('Hole...', 'Applying...')
                                : tr('Holen', 'Apply')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
