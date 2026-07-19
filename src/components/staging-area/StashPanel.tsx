import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Archive } from 'lucide-react';
import type { GitStashEntryDto } from '@/types/gitDtos';
import { useI18n } from '@/i18n';
import { useAppToast } from '@/hooks/useAppToast';
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
};

export const StashPanel: React.FC<Props> = ({ repoPath, onRepoChanged, setInputDialog, refreshTrigger }) => {
  const { t, tr } = useI18n();
  const showToast = useAppToast();
  const [collapsed, setCollapsed] = useState(true);
  const [stashes, setStashes] = useState<GitStashEntryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOp, setPendingOp] = useState<{ name: string; op: StashOp } | null>(null);
  const [runningStashOp, setRunningStashOp] = useState<{ name: string; op: StashOp } | null>(null);
  const [isStashMutationRunning, setIsStashMutationRunning] = useState(false);
  const [pendingFileOp, setPendingFileOp] = useState<{ stashName: string; path: string } | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());
  const [stashFiles, setStashFiles] = useState<Record<string, StashFileState>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const generationRef = useRef(0);
  // State updates are asynchronous; refs make the guards effective for two clicks
  // occurring in the same event turn.
  const activeStashMutationRef = useRef<number | null>(null);
  const stashListRequestRef = useRef(0);
  const stashContentGenerationRef = useRef(0);
  const loadingStashFilesRef = useRef(new Set<string>());
  const nextOperationIdRef = useRef(0);

  const isCurrentGeneration = useCallback(
    (generation: number, capturedRepoPath: string | null) => {
      return generation === generationRef.current && capturedRepoPath === repoPath;
    },
    [repoPath],
  );

  useLayoutEffect(() => {
    generationRef.current += 1;
    setStashes([]);
    setExpandedFiles(new Set());
    setStashFiles({});
    setLoadError(null);
    setPendingOp(null);
    setRunningStashOp(null);
    setIsStashMutationRunning(false);
    setPendingFileOp(null);
    setLoading(false);
    activeStashMutationRef.current = null;
    stashListRequestRef.current += 1;
    stashContentGenerationRef.current += 1;
    loadingStashFilesRef.current.clear();
  }, [repoPath]);

  const beginStashMutation = useCallback((): number | null => {
    if (activeStashMutationRef.current !== null) return null;
    const operationId = ++nextOperationIdRef.current;
    activeStashMutationRef.current = operationId;
    stashListRequestRef.current += 1;
    stashContentGenerationRef.current += 1;
    loadingStashFilesRef.current.clear();
    setLoading(false);
    setExpandedFiles(new Set());
    setStashFiles({});
    setIsStashMutationRunning(true);
    return operationId;
  }, []);

  const finishStashMutation = useCallback(
    (operationId: number, generation: number, capturedRepoPath: string | null) => {
      if (activeStashMutationRef.current !== operationId) return;
      activeStashMutationRef.current = null;
      if (isCurrentGeneration(generation, capturedRepoPath)) {
        setIsStashMutationRunning(false);
      }
    },
    [isCurrentGeneration],
  );

  const load = useCallback(async () => {
    if (!repoPath || !gitClient.isAvailable()) return;
    const generation = generationRef.current;
    const capturedRepoPath = repoPath;
    const requestId = ++stashListRequestRef.current;
    const isCurrentRequest = () => isCurrentGeneration(generation, capturedRepoPath) && requestId === stashListRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await gitClient.getStashes(repoPath);
      if (!isCurrentRequest()) return;
      if (result.success) {
        setStashes((result as any).data ?? []);
      } else {
        const message = (result as any).error || t('generated.components.staging_area.stashpanel.failed_to_load_stash_list_29c36606');
        setLoadError(message);
        showToast(message, true);
      }
    } catch (e: any) {
      if (!isCurrentRequest()) return;
      const message = e.message || t('generated.components.staging_area.stashpanel.failed_to_load_stash_list_29c36606');
      setLoadError(message);
      showToast(message, true);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [isCurrentGeneration, repoPath, showToast, t]);

  const loadStashFiles = useCallback(
    async (stashName: string) => {
      if (!repoPath || !gitClient.isAvailable() || loadingStashFilesRef.current.has(stashName)) return;
      const generation = generationRef.current;
      const capturedRepoPath = repoPath;
      const contentGeneration = stashContentGenerationRef.current;
      const isCurrentRequest = () => isCurrentGeneration(generation, capturedRepoPath) && contentGeneration === stashContentGenerationRef.current;
      loadingStashFilesRef.current.add(stashName);
      setStashFiles((current) => ({
        ...current,
        [stashName]: { loading: true, files: current[stashName]?.files || [] },
      }));
      try {
        const result = await gitClient.runGitCommandForRepo(capturedRepoPath, 'stash', 'show', '-u', '--name-only', '-z', stashName);
        if (!isCurrentRequest()) return;
        if (!result.success) {
          setStashFiles((current) => ({ ...current, [stashName]: { loading: false, files: [] } }));
          showToast(result.error || t('generated.components.staging_area.stashpanel.failed_to_load_stash_files_7a7abbc7'), true);
          return;
        }
        const rawFiles = String(result.data || '');
        const fileTokens = rawFiles.includes('\0') ? rawFiles.split('\0') : rawFiles.split('\n').map((line) => line.replace(/\r$/, ''));
        const files = Array.from(new Set(fileTokens.filter((filePath) => filePath.length > 0))).sort((a, b) => a.localeCompare(b));
        if (!isCurrentRequest()) return;
        setStashFiles((current) => ({
          ...current,
          [stashName]: { loading: false, files },
        }));
      } catch (e: any) {
        if (!isCurrentRequest()) return;
        setStashFiles((current) => ({ ...current, [stashName]: { loading: false, files: [] } }));
        showToast(e.message || t('generated.components.staging_area.stashpanel.failed_to_load_stash_files_7a7abbc7'), true);
      } finally {
        loadingStashFilesRef.current.delete(stashName);
      }
    },
    [isCurrentGeneration, repoPath, showToast, t],
  );

  useEffect(() => {
    if (!collapsed) void load();
  }, [collapsed, load, refreshTrigger]);

  const runStashOp = async (stashName: string, op: StashOp) => {
    if (!repoPath || !gitClient.isAvailable()) return;
    const generation = generationRef.current;
    const capturedRepoPath = repoPath;
    const operationId = beginStashMutation();
    if (operationId === null) return;
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
      const result = await gitClient.runGitCommandForRepo(capturedRepoPath, 'stash', ...args.slice(1));
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
        showToast(result.error || t('generated.components.staging_area.stashpanel.stash_operation_failed_7a8358ef'), true);
      }
    } catch (e: any) {
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      showToast(e.message, true);
    } finally {
      finishStashMutation(operationId, generation, capturedRepoPath);
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
        showToast(t('generated.components.staging_area.stashpanel.branch_dialog_is_not_available_00daf191'), true);
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
          const operationId = beginStashMutation();
          if (operationId === null) return;
          const branchName = String(values.branchName || '').trim();
          try {
            const result = await gitClient.gitStashBranch(stash.name, branchName, capturedRepoPath);
            if (!isCurrentGeneration(generation, capturedRepoPath)) return;

            if (result.success) {
              setExpandedFiles(new Set());
              setStashFiles({});
              await load();
              if (!isCurrentGeneration(generation, capturedRepoPath)) return;
              onRepoChanged?.();
              return;
            }
            showToast(result.error || t('generated.components.staging_area.stashpanel.failed_to_create_branch_from_stash_1bbcc9af'), true);
          } catch (e: any) {
            if (isCurrentGeneration(generation, capturedRepoPath)) showToast(e.message, true);
          } finally {
            finishStashMutation(operationId, generation, capturedRepoPath);
          }
        },
      });
    },
    [beginStashMutation, finishStashMutation, isCurrentGeneration, load, onRepoChanged, repoPath, setInputDialog, showToast, t],
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
    if (!repoPath || !gitClient.isAvailable()) return;
    const generation = generationRef.current;
    const capturedRepoPath = repoPath;
    const operationId = beginStashMutation();
    if (operationId === null) return;
    setPendingFileOp({ stashName, path: filePath });
    try {
      const trackedResult = await gitClient.runGitCommandForRepo(capturedRepoPath, 'checkout', stashName, '--', filePath);
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      const finalResult = trackedResult.success
        ? trackedResult
        : await gitClient.runGitCommandForRepo(capturedRepoPath, 'checkout', `${stashName}^3`, '--', filePath);
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;

      if (finalResult.success) {
        onRepoChanged?.();
      } else {
        showToast(
          trackedResult.error || finalResult.error || t('generated.components.staging_area.stashpanel.could_not_apply_file_from_the_stash_cd8005a7'),
          true,
        );
      }
    } catch (e: any) {
      if (!isCurrentGeneration(generation, capturedRepoPath)) return;
      showToast(e.message, true);
    } finally {
      finishStashMutation(operationId, generation, capturedRepoPath);
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

          {!loading && loadError && (
            <button className="staging-btn-sm" onClick={() => void load()}>
              {tr('Erneut versuchen', 'Retry')}
            </button>
          )}

          {!loading && !loadError && stashes.length === 0 && (
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
                          disabled={isStashMutationRunning}
                          onClick={() => {
                            void runStashOp(stash.name, 'drop');
                          }}
                        >
                          {t('generated.components.staging_area.stagingfilesections.delete_e5186a63')}
                        </button>
                        <button className="staging-btn-sm" disabled={isStashMutationRunning} onClick={() => setPendingOp(null)}>
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
                          disabled={isStashMutationRunning}
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
                          disabled={isStashMutationRunning}
                          onClick={() => handleOp(stash, 'apply')}
                          title={t('generated.components.staging_area.stashpanel.apply_stash_keep_stash_43a20097')}
                        >
                          {runningStashOp?.name === stash.name && runningStashOp.op === 'apply'
                            ? t('generated.components.staging_area.stashpanel.applying_74286d47')
                            : t('generated.components.staging_area.stashpanel.apply_e7699992')}
                        </button>
                        <button
                          className="staging-btn-sm"
                          disabled={isStashMutationRunning}
                          onClick={() => handleOp(stash, 'pop')}
                          title={t('generated.components.staging_area.stashpanel.apply_and_delete_stash_2df674b9')}
                        >
                          {t('generated.components.staging_area.stashpanel.pop_060eb5a7')}
                        </button>
                        <button
                          className="staging-btn-sm"
                          disabled={isStashMutationRunning}
                          onClick={() => branchFromStash(stash)}
                          title={t('generated.components.staging_area.stashpanel.create_a_branch_from_this_stash_caa1dff5')}
                        >
                          {t('generated.components.staging_area.stashpanel.branch_0e8da813')}
                        </button>
                        <button
                          className="staging-btn-sm staging-btn-danger"
                          disabled={isStashMutationRunning}
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
                          {!fileState?.loading && (fileState?.files || []).length === 0 && (
                            <div className="stash-panel-hint">{t('generated.components.staging_area.stashpanel.no_files_found_5e448811')}</div>
                          )}
                          {!fileState?.loading &&
                            (fileState?.files || []).map((filePath) => (
                              <div key={`${stash.name}:${filePath}`} className="stash-file-row">
                                <span className="stash-file-path" title={filePath}>
                                  {basename(filePath)}
                                </span>
                                <button
                                  className="staging-btn-sm"
                                  disabled={isStashMutationRunning}
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
