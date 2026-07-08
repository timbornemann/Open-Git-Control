import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { BranchInfo, GitMergeMode, GitSubmoduleInfo, RemoteSyncState } from '@/types/git';
import { normalizeBranchRefForMerge, parseBranchSyncFromPorcelainV2, parseGitSubmoduleStatus } from '@/utils/gitParsing';
import { validateBranchName } from '@/utils/gitRefValidation';
import { isRemoteRepositoryMissingError } from '@/utils/gitPushRecovery';
import { translateFromCatalog, getLocale, trByLanguage, type AppLanguage, type TranslationVariables } from '@/i18n';
import type { ConfirmDialogState, InputDialogState, BranchContextMenuState, RemoteStatusInfo } from '@/components/layout/layoutTypes';
import { formatTime } from '@/utils/dateTime';
import { getElectronApi } from '@/services/electronApi';
import { gitClient } from '@/services/gitClient';

const EMPTY_REMOTE_SYNC_STATE: RemoteSyncState = {
  isFetching: false,
  lastFetchedAt: null,
  lastFetchError: null,
  ahead: 0,
  behind: 0,
  hasUpstream: false,
};

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  triggerRefresh: () => void;
  setGitActionToast: (toast: { msg: string; isError: boolean }) => void;
  setActiveGitActionLabel: Dispatch<SetStateAction<string | null>>;
  isGitActionRunningRef: MutableRefObject<boolean>;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  autoFetchIntervalMs: number;
  language: AppLanguage;
  onNavigateToCommit: (hash: string) => void;
};

export const useRepositoryDomain = ({
  activeRepo,
  refreshTrigger,
  triggerRefresh,
  setGitActionToast,
  setActiveGitActionLabel,
  isGitActionRunningRef,
  runGitCommand,
  setConfirmDialog,
  setInputDialog,
  autoFetchIntervalMs,
  language,
  onNavigateToCommit,
}: Params) => {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchContextMenu, setBranchContextMenu] = useState<BranchContextMenuState>(null);

  const [tags, setTags] = useState<string[]>([]);
  const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([]);
  const [hasRemoteOrigin, setHasRemoteOrigin] = useState<boolean | null>(null);
  const [submodules, setSubmodules] = useState<GitSubmoduleInfo[]>([]);

  const [remoteSync, setRemoteSync] = useState<RemoteSyncState>({
    ...EMPTY_REMOTE_SYNC_STATE,
  });

  const isRemoteFetchRunningRef = useRef(false);
  const tr = (deText: string, enText: string) => trByLanguage(language, deText, enText);
  const t = (key: string, variables?: TranslationVariables) => translateFromCatalog(language, key, variables);

  const mergeModeArgs = useCallback((mode: GitMergeMode): string[] => {
    if (mode === 'noFf') return ['--no-ff'];
    if (mode === 'squash') return ['--squash'];
    if (mode === 'ffOnly') return ['--ff-only'];
    return [];
  }, []);

  const mergeModeLabel = useCallback(
    (mode: GitMergeMode): string => {
      if (mode === 'noFf') return t('generated.components.layout.hooks.userepositorydomain.no_fast_forward_no_ff_d4cc36d1');
      if (mode === 'squash') return t('generated.components.layout.hooks.userepositorydomain.squash_merge_squash_853a2803');
      if (mode === 'ffOnly') return t('generated.components.layout.branchcontextmenu.fast_forward_only_ff_only_247cf7fb');
      return t('generated.components.layout.hooks.userepositorydomain.default_921d6fef');
    },
    [language],
  );

  const formatLastFetchedAt = useCallback(
    (timestamp: number | null) => {
      if (!timestamp) return t('generated.components.layout.hooks.userepositorydomain.not_updated_yet_67fe75b0');
      const locale = getLocale(language);
      return (
        t('generated.components.layout.hooks.userepositorydomain.last_updated_48292542') +
        ': ' +
        formatTime(timestamp, locale, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    },
    [language],
  );

  useEffect(() => {
    setRemoteSync({ ...EMPTY_REMOTE_SYNC_STATE });
    setHasRemoteOrigin(null);
    setRemotes([]);
    setBranches([]);
    setCurrentBranch('');
    setTags([]);
    setSubmodules([]);
  }, [activeRepo]);

  useEffect(() => {
    if (!activeRepo || !gitClient.isAvailable()) {
      setBranches([]);
      setCurrentBranch('');
      setHasRemoteOrigin(null);
      return;
    }

    const fetchBranches = async () => {
      try {
        const { success, data } = await gitClient.runGitCommand('branch', '-a');
        if (success && data) {
          const lines = data.split('\n').filter((l: string) => l.trim().length > 0);
          const parsedBranches = lines
            .map((line: string): BranchInfo | null => {
              const isHead = line.startsWith('*');
              const name = line.replace('*', '').trim();
              if (name.includes(' -> ')) return null;

              const scope: BranchInfo['scope'] = name.startsWith('remotes/') ? 'remote' : 'local';
              return { name, isHead, scope };
            })
            .filter((branch: BranchInfo | null): branch is BranchInfo => branch !== null);

          const headRaw = parsedBranches.find((b: BranchInfo) => b.isHead)?.name ?? '';
          const head = /^\((HEAD detached|no branch)/i.test(headRaw) ? '' : headRaw;
          setCurrentBranch(head);
          setBranches(parsedBranches);
        }
      } catch {
        // Keep the last known branch list during transient refresh failures.
      }
    };
    fetchBranches();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    const fetchRemoteTracking = async () => {
      if (!activeRepo || !gitClient.isAvailable()) {
        setRemoteSync((prev) => ({ ...prev, ahead: 0, behind: 0, hasUpstream: false }));
        return;
      }

      try {
        const { success, data } = await gitClient.getBranchStatusPorcelainV2();
        if (!success || !data) {
          return;
        }

        const parsed = parseBranchSyncFromPorcelainV2(String(data));

        setRemoteSync((prev) => ({
          ...prev,
          ahead: parsed.ahead,
          behind: parsed.behind,
          hasUpstream: parsed.hasUpstream,
        }));
      } catch {
        // Keep the last known tracking state during transient refresh failures.
      }
    };

    fetchRemoteTracking();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    const checkRemote = async () => {
      if (!activeRepo || !gitClient.isAvailable()) {
        setHasRemoteOrigin(null);
        setRemotes([]);
        return;
      }
      try {
        const r = await gitClient.runGitCommand('remote', '-v');
        if (!r.success) {
          return;
        }

        const rawRemoteOutput = String(r.data || '');
        if (!rawRemoteOutput.trim()) {
          setHasRemoteOrigin(false);
          setRemotes([]);
          return;
        }
        const lines = rawRemoteOutput
          .split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        const hasOrigin = lines.some((line) => line.startsWith('origin'));
        setHasRemoteOrigin(hasOrigin);
        const seen = new Set<string>();
        const parsed: { name: string; url: string }[] = [];
        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2 && !seen.has(parts[0])) {
            seen.add(parts[0]);
            parsed.push({ name: parts[0], url: parts[1] });
          }
        }
        setRemotes(parsed);
      } catch {
        // Keep the last known remote configuration during transient refresh failures.
      }
    };
    checkRemote();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    if (!activeRepo || !gitClient.isAvailable()) {
      setTags([]);
      return;
    }
    const fetchTags = async () => {
      try {
        const parseTags = (value: unknown) =>
          String(value || '')
            .split('\n')
            .map((t: string) => t.trim())
            .filter((t: string) => t.length > 0);

        const byVersion = await gitClient.runGitCommand('tag', '-l', '--sort=-v:refname');
        setTags(byVersion.success ? parseTags(byVersion.data) : []);
      } catch {
        setTags([]);
      }
    };
    fetchTags();
  }, [activeRepo, refreshTrigger]);

  useEffect(() => {
    if (!branchContextMenu) return;
    const close = () => setBranchContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [branchContextMenu]);

  const refreshRemoteState = useCallback(
    async (showToast = false) => {
      if (!gitClient.isAvailable() || !activeRepo) return false;
      if (isRemoteFetchRunningRef.current || isGitActionRunningRef.current) return false;

      isRemoteFetchRunningRef.current = true;
      setActiveGitActionLabel(t('generated.components.layout.hooks.userepositorydomain.running_fetch_2dde9664'));
      setRemoteSync((prev) => ({ ...prev, isFetching: true }));

      try {
        const result = await gitClient.runGitCommand('fetch', '--all', '--prune', '--tags', '--quiet');
        if (result.success) {
          setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchedAt: Date.now(), lastFetchError: null }));
          triggerRefresh();
          if (showToast) {
            setGitActionToast({ msg: t('generated.components.layout.hooks.userepositorydomain.remote_updated_d577a6b1'), isError: false });
          }
          return true;
        }

        const errorMessage = String(result.error || t('generated.components.layout.hooks.userepositorydomain.could_not_update_remote_fbb52423'));
        if (isRemoteRepositoryMissingError(errorMessage)) {
          const removeOriginResult = await gitClient.removeRemote('origin');
          const removeOriginError = String(removeOriginResult.error || '').trim();
          const originAlreadyMissing = /no such remote\s+'?origin'?/i.test(removeOriginError);

          if (removeOriginResult.success || originAlreadyMissing) {
            setHasRemoteOrigin(false);
            setRemotes((prev) => prev.filter((remote) => remote.name !== 'origin'));
            setRemoteSync((prev) => ({
              ...prev,
              isFetching: false,
              lastFetchedAt: null,
              lastFetchError: null,
              ahead: 0,
              behind: 0,
              hasUpstream: false,
            }));
            triggerRefresh();
            setGitActionToast({
              msg: t('generated.components.layout.hooks.userepositorydomain.github_repository_no_longer_exists_origin_was_removed_re_119b0bb7'),
              isError: false,
            });
            return true;
          }
        }
        setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
        if (showToast) {
          setGitActionToast({ msg: errorMessage, isError: true });
        }
        return false;
      } catch (e: any) {
        const errorMessage = e?.message || t('generated.components.layout.hooks.userepositorydomain.could_not_update_remote_fbb52423');
        setRemoteSync((prev) => ({ ...prev, isFetching: false, lastFetchError: errorMessage }));
        if (showToast) {
          setGitActionToast({ msg: errorMessage, isError: true });
        }
        return false;
      } finally {
        isRemoteFetchRunningRef.current = false;
        setActiveGitActionLabel((current) => (current === t('generated.components.layout.hooks.userepositorydomain.running_fetch_2dde9664') ? null : current));
      }
    },
    [activeRepo, isGitActionRunningRef, setActiveGitActionLabel, setGitActionToast, triggerRefresh, language],
  );

  useEffect(() => {
    if (!activeRepo) {
      setRemoteSync({ ...EMPTY_REMOTE_SYNC_STATE });
      return;
    }

    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refreshRemoteState();
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshRemoteState();
      }
    };

    void refreshRemoteState();
    const intervalId = window.setInterval(() => {
      refreshIfVisible();
    }, autoFetchIntervalMs);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [activeRepo, autoFetchIntervalMs, refreshRemoteState]);

  useEffect(() => {
    const fetchSubmodules = async () => {
      if (!activeRepo || !gitClient.isAvailable()) {
        setSubmodules([]);
        return;
      }

      try {
        const response = await gitClient.runGitCommand('submoduleStatus');
        if (!response.success) {
          setSubmodules([]);
          return;
        }

        const parsed = parseGitSubmoduleStatus(String(response.data || '')).map((item) => ({
          path: item.path,
          commit: item.commit,
          stateCode: item.stateCode,
          isDirty: item.isDirty,
          summary: item.summary,
        }));
        setSubmodules(parsed);
      } catch {
        setSubmodules([]);
      }
    };

    fetchSubmodules();
  }, [activeRepo, refreshTrigger]);

  const handleCreateBranch = async (branchName: string) => {
    const name = branchName.trim();
    if (!name) return;
    const branchNameError = validateBranchName(name);
    if (branchNameError) {
      setGitActionToast({
        msg: t('generated.components.layout.hooks.userepositorydomain.invalid_branch_name_please_check_the_input_b2af4b45'),
        isError: true,
      });
      return;
    }
    setIsCreatingBranch(false);
    const created = await runGitCommand(['checkout', '-b', name], tr(`Branch "${name}" erstellt.`, `Created branch "${name}".`));
    if (!created) return;

    if (!hasRemoteOrigin) {
      return;
    }

    await runGitCommand(
      ['push', '-u', 'origin', name],
      tr(`Branch "${name}" erstellt, auf origin veroeffentlicht und Upstream gesetzt.`, `Created branch "${name}", pushed to origin, and set upstream.`),
      tr(`Neuer Branch "${name}" wird auf origin veroeffentlicht...`, `Publishing new branch "${name}" to origin...`),
    );
  };

  const handleDeleteBranch = async (branchName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: t('generated.components.layout.hooks.userepositorydomain.delete_branch_02a82db3'),
      message: t('generated.components.layout.hooks.userepositorydomain.the_local_branch_will_be_removed_d33d1458'),
      contextItems: [
        { label: t('generated.components.staging_area.stashpanel.branch_0e8da813'), value: branchName },
        {
          label: t('generated.components.layout.hooks.userepositorydomain.active_branch_b25dcef4'),
          value: currentBranch || t('generated.components.staging_area.usefileoperations.unknown_af8d7dc4'),
        },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.if_the_branch_is_not_on_remote_work_may_be_lost_1a9ea900'),
      confirmLabel: t('generated.components.layout.hooks.userepositorydomain.delete_branch_15da7323'),
      onConfirm: async () => {
        const ok = await runGitCommand(['branch', '-d', branchName], tr(`Branch "${branchName}" gelöscht.`, `Deleted branch "${branchName}".`));
        if (!ok) {
          setConfirmDialog({
            variant: 'danger',
            title: t('generated.components.layout.hooks.userepositorydomain.force_delete_branch_148c74d5'),
            message: t('generated.components.layout.hooks.userepositorydomain.the_branch_is_not_fully_merged_yet_delete_anyway_force_1007be11'),
            contextItems: [{ label: t('generated.components.staging_area.stashpanel.branch_0e8da813'), value: branchName }],
            irreversible: true,
            consequences: t('generated.components.layout.hooks.userepositorydomain.commits_only_in_this_branch_will_be_permanently_lost_737734f3'),
            confirmLabel: t('generated.components.layout.hooks.userepositorydomain.force_delete_f0837cd4'),
            onConfirm: async () => {
              await runGitCommand(['branch', '-D', branchName], tr(`Branch "${branchName}" force-gelöscht.`, `Force-deleted branch "${branchName}".`));
            },
          });
        }
      },
    });
  };

  const handleMergeBranch = async (branchName: string, mode: GitMergeMode = 'default') => {
    const mergeTarget = normalizeBranchRefForMerge(branchName);
    const flags = mergeModeArgs(mode);
    const cmdPreview = ['merge', ...flags, mergeTarget].join(' ');
    setConfirmDialog({
      variant: 'confirm',
      title: t('generated.components.layout.hooks.userepositorydomain.merge_branch_86c1a5e0'),
      message: t('generated.components.layout.hooks.userepositorydomain.the_selected_branch_will_be_merged_into_the_current_bran_db9e5318'),
      contextItems: [
        { label: t('generated.components.layout.hooks.userepositorydomain.source_08fe450e'), value: branchName },
        { label: t('generated.components.layout.hooks.userepositorydomain.merge_ref_e72f373b'), value: mergeTarget },
        { label: t('generated.components.staging_area.stagingcommitpanel.mode_56610d60'), value: mergeModeLabel(mode) },
        {
          label: t('generated.components.layout.hooks.userepositorydomain.target_branch_8b94f3a7'),
          value: currentBranch || t('generated.components.staging_area.usefileoperations.unknown_af8d7dc4'),
        },
        { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: `git ${cmdPreview}` },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.conflicts_may_occur_on_success_a_new_merge_commit_may_be_927ecc69'),
      confirmLabel: t('generated.components.commit_graph.commitgraph.start_merge_516b5e37'),
      onConfirm: async () => {
        await runGitCommand(['merge', ...flags, mergeTarget], tr(`Branch "${mergeTarget}" gemergt.`, `Merged branch "${mergeTarget}".`));
      },
    });
  };

  const handleRenameBranch = async (oldName: string) => {
    setInputDialog({
      title: t('generated.components.layout.hooks.userepositorydomain.rename_branch_60167942'),
      message: t('generated.components.layout.hooks.userepositorydomain.enter_the_new_branch_name_e6f8b69a'),
      fields: [
        {
          id: 'newName',
          label: t('generated.components.layout.hooks.userepositorydomain.new_branch_name_c471ecaa'),
          defaultValue: oldName,
          required: true,
          helperText: t('generated.components.layout.hooks.userepositorydomain.name_must_not_be_empty_and_should_be_unique_6230b9ad'),
          validate: (value) => {
            const trimmed = value.trim();
            if (!trimmed || trimmed === oldName) return null;
            const errorCode = validateBranchName(trimmed);
            if (!errorCode) return null;
            if (errorCode === 'contains-space') {
              return t('generated.components.layout.hooks.userepositorydomain.branch_name_must_not_contain_spaces_e2b8e90e');
            }
            return t('generated.components.layout.hooks.userepositorydomain.invalid_branch_name_ffd19575');
          },
        },
      ],
      contextItems: [{ label: t('generated.components.layout.hooks.userepositorydomain.current_name_b459982f'), value: oldName }],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.local_references_are_updated_remotes_may_need_separate_u_e8d4a4fb'),
      confirmLabel: t('generated.components.layout.branchcontextmenu.rename_cd5280ff'),
      onSubmit: async (values) => {
        const newName = (values.newName || '').trim();
        if (!newName || newName === oldName) return;
        await runGitCommand(
          ['branch', '-m', oldName, newName],
          tr(`Branch umbenannt: "${oldName}" -> "${newName}".`, `Renamed branch: "${oldName}" -> "${newName}".`),
        );
      },
    });
  };

  const handleCreateTag = async () => {
    setInputDialog({
      title: t('generated.components.sidebar.tagpanel.create_tag_9d35faa7'),
      message: t('generated.components.layout.hooks.userepositorydomain.create_a_new_tag_701b9837'),
      fields: [
        { id: 'name', label: t('generated.components.layout.hooks.userepositorydomain.tag_name_f3738999'), placeholder: 'v1.2.3', required: true },
        {
          id: 'message',
          label: t('generated.components.layout.hooks.userepositorydomain.tag_message_optional_27f056f4'),
          placeholder: t('generated.components.layout.hooks.userepositorydomain.release_note_82664eb5'),
        },
      ],
      contextItems: [
        {
          label: t('generated.components.staging_area.stashpanel.branch_0e8da813'),
          value: currentBranch || t('generated.components.staging_area.usefileoperations.unknown_af8d7dc4'),
        },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.annotated_tags_store_additional_metadata_and_message_fcf09424'),
      confirmLabel: t('generated.components.sidebar.tagpanel.create_tag_9d35faa7'),
      onSubmit: async (values) => {
        const name = (values.name || '').trim();
        if (!name) return;
        const msg = (values.message || '').trim();
        if (msg) {
          await runGitCommand(['tag', '-a', name, '-m', msg], tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`));
        } else {
          await runGitCommand(['tag', name], tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`));
        }
      },
    });
  };

  const handleDeleteTag = async (tagName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: t('generated.components.layout.hooks.userepositorydomain.delete_tag_acbb5455'),
      message: t('generated.components.layout.hooks.userepositorydomain.the_tag_will_be_removed_locally_d135897d'),
      contextItems: [{ label: t('generated.components.layout.hooks.userepositorydomain.tag_d509084a'), value: tagName }],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.if_already_pushed_the_tag_remains_on_remote_until_explic_1dcede84'),
      confirmLabel: t('generated.components.layout.hooks.userepositorydomain.delete_tag_a6dd4ad1'),
      onConfirm: async () => {
        await runGitCommand(['tag', '-d', tagName], tr(`Tag "${tagName}" gelöscht.`, `Deleted tag "${tagName}".`));
      },
    });
  };

  const handleSelectTag = useCallback(
    async (tagName: string) => {
      if (!activeRepo || !gitClient.isAvailable()) return;

      try {
        const tagRef = `refs/tags/${tagName}^{commit}`;
        const result = await gitClient.runGitCommand('show', '--quiet', '--format=%H', tagRef);
        const hash =
          String(result.data || '')
            .trim()
            .split(/\s+/)[0] || '';

        if (!result.success || !/^[0-9a-f]{40}$/i.test(hash)) {
          setGitActionToast({
            msg: result.error || tr(`Commit fuer Tag "${tagName}" konnte nicht gefunden werden.`, `Could not find the commit for tag "${tagName}".`),
            isError: true,
          });
          return;
        }

        onNavigateToCommit(hash);
      } catch (error: any) {
        setGitActionToast({
          msg: error?.message || tr(`Tag "${tagName}" konnte nicht geoeffnet werden.`, `Could not open tag "${tagName}".`),
          isError: true,
        });
      }
    },
    [activeRepo, onNavigateToCommit, setGitActionToast, language],
  );

  const handlePushTags = async () => {
    await runGitCommand(['push', '--tags'], t('generated.components.layout.hooks.userepositorydomain.pushed_tags_d74ebef5'));
  };

  const handleAddRemote = async () => {
    setInputDialog({
      title: t('generated.components.layout.hooks.userepositorydomain.add_remote_f1f0fcca'),
      message: t('generated.components.layout.hooks.userepositorydomain.connect_this_repository_to_another_remote_3956fed1'),
      fields: [
        { id: 'name', label: t('generated.components.layout.hooks.userepositorydomain.remote_name_866ee7be'), placeholder: 'origin', required: true },
        {
          id: 'url',
          label: t('generated.components.layout.hooks.userepositorydomain.remote_url_544f436b'),
          placeholder: 'https://github.com/owner/repo.git',
          required: true,
          type: 'url',
        },
      ],
      contextItems: [
        {
          label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'),
          value: activeRepo ? activeRepo.split(/[\\/]/).pop() || activeRepo : t('generated.components.staging_area.usefileoperations.unknown_af8d7dc4'),
        },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.remote_will_be_saved_in_local_git_config_eb546a6d'),
      confirmLabel: t('generated.components.layout.hooks.userepositorydomain.save_remote_481a95a9'),
      onSubmit: async (values) => {
        const name = (values.name || '').trim();
        const url = (values.url || '').trim();
        if (!name || !url) return;
        await runGitCommand(['remote', 'add', name, url], tr(`Remote "${name}" hinzugefügt.`, `Added remote "${name}".`));
      },
    });
  };

  const handleRemoveRemote = async (remoteName: string) => {
    setConfirmDialog({
      variant: 'danger',
      title: t('generated.components.layout.hooks.userepositorydomain.remove_remote_73a08b94'),
      message: t('generated.components.layout.hooks.userepositorydomain.the_remote_will_be_removed_from_local_configuration_4a39ee89'),
      contextItems: [
        { label: t('generated.components.sidebar.branchpanel.remote_8a6f1451'), value: remoteName },
        {
          label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'),
          value: activeRepo ? activeRepo.split(/[\\/]/).pop() || activeRepo : t('generated.components.staging_area.usefileoperations.unknown_af8d7dc4'),
        },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.push_pull_via_this_remote_will_no_longer_be_possible_unt_40c3ada6'),
      confirmLabel: t('generated.components.sidebar.remotepanel.remove_remote_7e7dee87'),
      onConfirm: async () => {
        await runGitCommand(['remote', 'remove', remoteName], tr(`Remote "${remoteName}" entfernt.`, `Removed remote "${remoteName}".`));
      },
    });
  };

  const handleRenameRemote = async (remoteName: string) => {
    setInputDialog({
      title: t('generated.components.layout.hooks.userepositorydomain.rename_remote_0523e2db'),
      message: t('generated.components.layout.hooks.userepositorydomain.enter_the_new_name_for_this_remote_1786c8c7'),
      fields: [
        { id: 'newName', label: t('generated.components.layout.hooks.userepositorydomain.new_remote_name_ede61bf8'), defaultValue: remoteName, required: true },
      ],
      contextItems: [{ label: t('generated.components.layout.hooks.userepositorydomain.current_name_b459982f'), value: remoteName }],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.existing_push_pull_configurations_will_be_updated_75db923b'),
      confirmLabel: t('generated.components.layout.branchcontextmenu.rename_cd5280ff'),
      onSubmit: async (values) => {
        const newName = (values.newName || '').trim();
        if (!newName || newName === remoteName) return;
        await runGitCommand(
          ['remote', 'rename', remoteName, newName],
          tr(`Remote umbenannt: "${remoteName}" -> "${newName}".`, `Renamed remote: "${remoteName}" -> "${newName}".`),
        );
      },
    });
  };

  const handleSetRemoteUrl = async (remoteName: string, currentUrl: string) => {
    setInputDialog({
      title: t('generated.components.layout.hooks.userepositorydomain.change_remote_url_27e701f1'),
      message: t('generated.components.layout.hooks.userepositorydomain.enter_the_new_url_for_this_remote_7195ea0d'),
      fields: [
        {
          id: 'url',
          label: t('generated.components.layout.hooks.userepositorydomain.new_remote_url_babdec07'),
          defaultValue: currentUrl,
          required: true,
          type: 'url',
        },
      ],
      contextItems: [
        { label: t('generated.components.sidebar.branchpanel.remote_8a6f1451'), value: remoteName },
        { label: t('generated.components.layout.hooks.userepositorydomain.current_url_080057db'), value: currentUrl },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.hooks.userepositorydomain.push_pull_will_use_the_new_url_afterwards_950dc798'),
      confirmLabel: t('generated.components.layout.hooks.userepositorydomain.save_url_02471deb'),
      onSubmit: async (values) => {
        const url = (values.url || '').trim();
        if (!url || url === currentUrl) return;
        await runGitCommand(['remote', 'set-url', remoteName, url], tr(`URL für "${remoteName}" aktualisiert.`, `Updated URL for "${remoteName}".`));
      },
    });
  };

  const handleSubmoduleInitUpdate = async () => {
    await runGitCommand(['submoduleUpdateInitRecursive'], t('generated.components.layout.hooks.userepositorydomain.submodules_initialized_updated_76af1313'));
  };

  const handleSubmoduleSync = async () => {
    await runGitCommand(['submoduleSyncRecursive'], t('generated.components.layout.hooks.userepositorydomain.submodule_urls_synchronized_7dfc04ea'));
  };

  const handleOpenSubmodule = async (submodulePath: string) => {
    const electronApi = getElectronApi();
    if (!electronApi) return;
    const result = await electronApi.openSubmodule(submodulePath);
    if (!result.success) {
      setGitActionToast({ msg: result.error || t('generated.components.layout.hooks.userepositorydomain.could_not_open_submodule_39e4c0fb'), isError: true });
    }
  };

  const remoteStatus: RemoteStatusInfo = (() => {
    if (remoteSync.lastFetchError) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.remote_check_failed_306695fe'),
        detail: remoteSync.lastFetchError,
        color: 'var(--status-danger)',
        backgroundColor: 'var(--status-danger-soft)',
        borderColor: 'var(--status-danger-border)',
      };
    }

    if (hasRemoteOrigin === false) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.no_remote_configured_c025d492'),
        detail: t('generated.components.layout.hooks.userepositorydomain.this_repository_has_no_remote_yet_d5654811'),
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (remoteSync.lastFetchedAt === null) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.remote_not_checked_yet_47aad08d'),
        detail: t('generated.components.layout.hooks.userepositorydomain.no_successful_fetch_for_this_repository_yet_5234cde0'),
        color: 'var(--text-secondary)',
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
      };
    }

    if (!remoteSync.hasUpstream) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.no_tracking_branch_f236e75a'),
        detail: t('generated.components.layout.hooks.userepositorydomain.current_local_branch_does_not_track_a_remote_branch_8dc15592'),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.ahead > 0 && remoteSync.behind > 0) {
      return {
        title: t('generated.components.layout.hooks.userepositorydomain.local_and_remote_diverged_b0bb5820'),
        detail: tr(
          `Lokal ${remoteSync.ahead} voraus, Remote ${remoteSync.behind} voraus.`,
          `Local ahead by ${remoteSync.ahead}, remote ahead by ${remoteSync.behind}.`,
        ),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.behind > 0) {
      return {
        title: tr(
          `Remote ist ${remoteSync.behind} Commit${remoteSync.behind === 1 ? '' : 's'} voraus`,
          `Remote is ahead by ${remoteSync.behind} commit${remoteSync.behind === 1 ? '' : 's'}`,
        ),
        detail: t('generated.components.layout.hooks.userepositorydomain.remote_has_newer_commits_than_your_local_branch_eea6b334'),
        color: 'var(--status-warning)',
        backgroundColor: 'var(--status-warning-soft)',
        borderColor: 'var(--status-warning-border)',
      };
    }

    if (remoteSync.ahead > 0) {
      return {
        title: tr(
          `Lokal ist ${remoteSync.ahead} Commit${remoteSync.ahead === 1 ? '' : 's'} voraus`,
          `Local is ahead by ${remoteSync.ahead} commit${remoteSync.ahead === 1 ? '' : 's'}`,
        ),
        detail: t('generated.components.layout.hooks.userepositorydomain.your_local_commits_have_not_been_pushed_yet_92f12a9e'),
        color: 'var(--text-accent)',
        backgroundColor: 'var(--accent-primary-soft)',
        borderColor: 'var(--accent-primary-border)',
      };
    }

    return {
      title: t('generated.components.layout.hooks.userepositorydomain.remote_is_up_to_date_ed54ec4a'),
      detail: formatLastFetchedAt(remoteSync.lastFetchedAt),
      color: 'var(--status-success)',
      backgroundColor: 'var(--status-success-soft)',
      borderColor: 'var(--status-success-border)',
    };
  })();

  return {
    branches,
    setBranches,
    currentBranch,
    setCurrentBranch,
    isCreatingBranch,
    setIsCreatingBranch,
    branchContextMenu,
    setBranchContextMenu,
    tags,
    remotes,
    submodules,
    hasRemoteOrigin,
    setHasRemoteOrigin,
    remoteSync,
    remoteStatus,
    refreshRemoteState,
    handleCreateBranch,
    handleDeleteBranch,
    handleMergeBranch,
    handleRenameBranch,
    handleCreateTag,
    handleDeleteTag,
    handleSelectTag,
    handlePushTags,
    handleAddRemote,
    handleRemoveRemote,
    handleRenameRemote,
    handleSetRemoteUrl,
    handleSubmoduleInitUpdate,
    handleSubmoduleSync,
    handleOpenSubmodule,
  };
};
