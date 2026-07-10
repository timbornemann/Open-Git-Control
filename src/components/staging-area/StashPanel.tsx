import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Archive } from 'lucide-react';
import type { GitStashEntryDto } from '@/types/gitDtos';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { EmptyState } from '@/components/EmptyState';
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

export const StashPanel: React.FC<Props> = ({ repoPath, onRepoChanged, setInputDialog, refreshTrigger }) => {
  const { t, tr } = useI18n();
  const [collapsed, setCollapsed] = useState(true);
  const [stashes, setStashes] = useState<GitStashEntryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOp, setPendingOp] = useState<{ name: string; op: StashOp } | null>(null);
  const [runningStashOp, setRunningStashOp] = useState<{ name: string; op: StashOp } | null>(null);
  const [pendingFileOp, setPendingFileOp] = useState<{ stashName: string; path: string } | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());
  const [stashFiles, setStashFiles] = useState<Record<string, StashFileState>>({});
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const isCurrentGeneration = useCallback((generation: number, capturedRepoPath: string | null) => {
    return generation === generationRef.current && capturedRepoPath === repoPath;
  }, [repoPath]);

  useEffect(() => {
    generationRef.current += 1;
    setStashes([]);
    setExpandedFiles(new Set());
    setStashFiles({});
    setError(null);
    setPendingOp(null);
    setRunningStashOp(null);
    setPendingFileOp(null);
    setLoading(false);
  }, [repoPath]);

  const load = useCallback(async () => {
    if (!repoPath || !gitClient.isAvailable()) return;
    const generation = generationRef.current;
    const capturedRepoPath = repoPath;
    setLoading(true);
    setError(null);
    try {
      const result = await gitClient.getStashes();
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      if (result.success) {
        setStashes((result as any).data ?? []);
      } else {
        setError((result as any).error || t('generated.components.staging_area.stashpanel.failed_to_load_stash_list_29c36606'));
      }
    } catch (e: any) {
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      setError(e.message);
    } finally {
      if (isCurrentGeneration(generation, capturedRepoPath)) {
        setLoading(false);
      }
    }
  }, [isCurrentGeneration, repoPath, t]);

  const loadStashFiles = useCallback(
    async (stashName: string) => {
      if (!repoPath || !gitClient.isAvailable()) return;
      const generation = generationRef.current;
      const capturedRepoPath = repoPath;
      setStashFiles((current) => ({
        ...current,
        [stashName]: { loading: true, files: current[stashName]?.files || [], error: null },
      }));
      try {
        const result = await gitClient.runGitCommand('stash', 'show', '-u', '--name-only', stashName);
        if (!isCurrentGeneration(generation, capturedRepoPath)) return;
        if (!result.success) {
          setStashFiles((current) => ({
            ...current,
            [stashName]: {
              loading: false,
              files: [],
              error: result.error || t('generated.components.staging_area.stashpanel.failed_to_load_stash_files_7a7abbc7'),
            },
          }));
          return;
        }
        const files = Array.from(
          new Set(
            String(result.data || '')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b));
        if (!isCurrentGeneration(generation, capturedRepoPath)) return;
        setStashFiles((current) => ({
          ...current,
          [stashName]: { loading: false, files, error: null },
        }));
      } catch (e: any) {
        if (!isCurrentGeneration(generation, capturedRepoPath)) return;
        setStashFiles((current) => ({
          ...current,
          [stashName]: { loading: false, files: [], error: e.message },
        }));
      }
    },
    [isCurrentGeneration, repoPath, t],
  );

  useEffect(() => {
    if (!collapsed) void load();
  }, [collapsed, load, refreshTrigger]);

  const runStashOp = async (stashName: string, op: StashOp) => {
    if (!repoPath || !gitClient.isAvailable() || runningStashOp) return;
    const generation = generationRef.current;
    const capturedRepoPath = repoPath;
    setRunningStashOp({ name: stashName, op });
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
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      if (result.success) {
        if (op === 'pop' || op === 'drop') {
          setExpandedFiles(new Set());
          setStashFiles({});
        }
        await load();
        if (!isCurrentGeneration(generation, capturedRepoPath)) return;
        if (op !== 'drop') onRepoChanged?.();
      } else {
        setError(result.error || t('generated.components.staging_area.stashpanel.stash_operation_failed_7a8358ef'));
      }
    } catch (e: any) {
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      setError(e.message);
    } finally {
      if (isCurrentGeneration(generation, capturedRepoPath)) {
        setRunningStashOp(null);
        setPendingOp(null);
      }
    }
  };

  const handleOp = (stash: GitStashEntryDto, op: StashOp) => {
    if (op === 'drop') {
      setPendingOp({ name: stash.name, op });
      return;
    }
    void runStashOp(stash.name, op);
  };

  const branchFromStash = useCallback(
    (stash: GitStashEntryDto) => {
      if (!gitClient.isAvailable()) return;
      if (!setInputDialog) {
        setError(t('generated.components.staging_area.stashpanel.branch_dialog_is_not_available_00daf191'));
        return;
      }

      const defaultBranchName = `stash-${stash.index}`;
      setInputDialog({
        title: t('generated.components.staging_area.stashpanel.create_branch_from_stash_bada7c93'),
        message: t('generated.components.staging_area.stashpanel.git_creates_a_new_branch_from_the_original_stash_base_co_c5d0afdf'),
        fields: [
          {
            id: 'branchName',
            label: t('generated.components.staging_area.stashpanel.branch_name_f97f5dd8'),
            placeholder: defaultBranchName,
            defaultValue: defaultBranchName,
            required: true,
            validate: (value) => {
              if (!value.trim()) {
                return t('generated.components.staging_area.stashpanel.please_enter_a_branch_name_0ca67048');
              }
              return null;
            },
          },
        ],
        contextItems: [
          { label: t('generated.components.staging_area.stashpanel.stash_66a26771'), value: stash.name },
          { label: t('generated.components.commitdetails.description_3f0f0c88'), value: stash.subject },
        ],
        irreversible: false,
        consequences: t('generated.components.staging_area.stashpanel.if_applying_succeeds_git_automatically_removes_the_stash_0f54e6bb'),
        confirmLabel: t('generated.components.staging_area.stashpanel.create_branch_f1e70a0b'),
        onSubmit: async (values) => {
          if (!repoPath) return;
          const generation = generationRef.current;
          const capturedRepoPath = repoPath;
          const branchName = String(values.branchName || '').trim();
          setError(null);
          const result = await gitClient.gitStashBranch(stash.name, branchName);
          if (!isCurrentGeneration(generation, capturedRepoPath)) return;

          if (result.success) {
            setExpandedFiles(new Set());
            setStashFiles({});
            await load();
            if (!isCurrentGeneration(generation, capturedRepoPath)) return;
            onRepoChanged?.();
            return;
          }
          setError(result.error || t('generated.components.staging_area.stashpanel.failed_to_create_branch_from_stash_1bbcc9af'));
        },
      });
    },
    [isCurrentGeneration, load, onRepoChanged, repoPath, setInputDialog, t],
  );

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
    if (!repoPath || !gitClient.isAvailable() || pendingFileOp) return;
    const generation = generationRef.current;
    const capturedRepoPath = repoPath;
    setPendingFileOp({ stashName, path: filePath });
    setError(null);
    try {
      const trackedResult = await gitClient.runGitCommand('checkout', stashName, '--', filePath);
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      const finalResult = trackedResult.success ? trackedResult : await gitClient.runGitCommand('checkout', `${stashName}^3`, '--', filePath);
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;

      if (finalResult.success) {
        onRepoChanged?.();
      } else {
        setError(trackedResult.error || finalResult.error || t('generated.components.staging_area.stashpanel.could_not_apply_file_from_the_stash_cd8005a7'));
      }
    } catch (e: any) {
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      setError(e.message);
    } finally {
      if (isCurrentGeneration(generation, capturedRepoPath)) {
        setPendingFileOp(null);
      }
    }
  };

  return (
    <div className="stash-panel">
      <button
        className="stash-panel-header"
        onClick={() => setCollapsed((c) => !c)}
        title={
          collapsed
            ? t('generated.components.staging_area.stashpanel.show_stashes_846c3181')
            : t('generated.components.staging_area.stashpanel.collapse_stashes_5cded4e2')
        }
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <Archive size={13} style={{ opacity: 0.7 }} />
        <span>{t('generated.components.staging_area.stashpanel.stashes_2446335b')}</span>
        {stashes.length > 0 && !collapsed && <span className="stash-panel-count">{stashes.length}</span>}
      </button>

      {!collapsed && (
        <div className="stash-panel-body">
          {loading && <div className="stash-panel-hint">{t('generated.components.staging_area.stashpanel.loading_stashes_0cdfcdf1')}</div>}

          {!loading && error && <div className="stash-panel-hint stash-panel-hint--error">{error}</div>}

          {!loading && !error && stashes.length === 0 && (
            <EmptyState
              icon={<Archive size={24} />}
              title={t('generated.components.staging_area.stashpanel.no_stashes_found_b1e3c59f')}
              description={t('generated.components.staging_area.stashpanel.create_a_stash_from_a_file_row_context_menu_c1113ce3')}
            />
          )}

          {!loading &&
            stashes.map((stash) => {
              const isExpanded = expandedFiles.has(stash.name);
              const fileState = stashFiles[stash.name];
              return (
                <div key={stash.name} className="stash-entry">
                  {pendingOp?.name === stash.name && pendingOp.op === 'drop' ? (
                    <div className="stash-entry-confirm">
                      <span className="stash-entry-confirm-msg">{tr(`"${stash.subject}" loeschen?`, `Delete "${stash.subject}"?`)}</span>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        <button
                          className="staging-btn-sm staging-btn-danger"
                          disabled={Boolean(runningStashOp)}
                          onClick={() => {
                            void runStashOp(stash.name, 'drop');
                          }}
                        >
                          {t('generated.components.staging_area.stagingfilesections.delete_e5186a63')}
                        </button>
                        <button className="staging-btn-sm" disabled={Boolean(runningStashOp)} onClick={() => setPendingOp(null)}>
                          {t('generated.components.confirm.cancel_035b7526')}
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
                          disabled={Boolean(runningStashOp)}
                          onClick={() => toggleFiles(stash)}
                          title={
                            isExpanded
                              ? t('generated.components.staging_area.stashpanel.hide_stash_files_be566d4a')
                              : t('generated.components.staging_area.stashpanel.show_stash_files_7f625fc7')
                          }
                        >
                          {isExpanded
                            ? t('generated.components.staging_area.stashpanel.hide_files_dab93cd7')
                            : t('generated.components.commitdetails.files_f77bc482')}
                        </button>
                        <button
                          className="staging-btn-sm"
                          disabled={Boolean(runningStashOp)}
                          onClick={() => handleOp(stash, 'apply')}
                          title={t('generated.components.staging_area.stashpanel.apply_stash_keep_stash_43a20097')}
                        >
                          {runningStashOp?.name === stash.name && runningStashOp.op === 'apply'
                            ? t('generated.components.staging_area.stashpanel.applying_74286d47')
                            : t('generated.components.staging_area.stashpanel.apply_e7699992')}
                        </button>
                        <button
                          className="staging-btn-sm"
                          disabled={Boolean(runningStashOp)}
                          onClick={() => handleOp(stash, 'pop')}
                          title={t('generated.components.staging_area.stashpanel.apply_and_delete_stash_2df674b9')}
                        >
                          {t('generated.components.staging_area.stashpanel.pop_060eb5a7')}
                        </button>
                        <button
                          className="staging-btn-sm"
                          disabled={Boolean(runningStashOp)}
                          onClick={() => branchFromStash(stash)}
                          title={t('generated.components.staging_area.stashpanel.create_a_branch_from_this_stash_caa1dff5')}
                        >
                          {t('generated.components.staging_area.stashpanel.branch_0e8da813')}
                        </button>
                        <button
                          className="staging-btn-sm staging-btn-danger"
                          disabled={Boolean(runningStashOp)}
                          onClick={() => handleOp(stash, 'drop')}
                          title={t('generated.components.staging_area.stashpanel.delete_stash_6804245b')}
                        >
                          {t('generated.components.staging_area.stashpanel.drop_f1887911')}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="stash-file-list">
                          {fileState?.loading && (
                            <div className="stash-panel-hint">{t('generated.components.staging_area.stashpanel.loading_files_df8b1d70')}</div>
                          )}
                          {!fileState?.loading && fileState?.error && <div className="stash-panel-hint stash-panel-hint--error">{fileState.error}</div>}
                          {!fileState?.loading && !fileState?.error && (fileState?.files || []).length === 0 && (
                            <div className="stash-panel-hint">{t('generated.components.staging_area.stashpanel.no_files_found_5e448811')}</div>
                          )}
                          {!fileState?.loading &&
                            !fileState?.error &&
                            (fileState?.files || []).map((filePath) => (
                              <div key={`${stash.name}:${filePath}`} className="stash-file-row">
                                <span className="stash-file-path" title={filePath}>
                                  {basename(filePath)}
                                </span>
                                <button
                                  className="staging-btn-sm"
                                  disabled={pendingFileOp !== null}
                                  onClick={() => {
                                    void restoreStashFile(stash.name, filePath);
                                  }}
                                  title={t('generated.components.staging_area.stashpanel.apply_file_from_this_stash_8651c38e')}
                                >
                                  {pendingFileOp?.stashName === stash.name && pendingFileOp.path === filePath
                                    ? t('generated.components.staging_area.stashpanel.applying_74286d47')
                                    : t('generated.components.staging_area.stashpanel.apply_48b5b14b')}
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
