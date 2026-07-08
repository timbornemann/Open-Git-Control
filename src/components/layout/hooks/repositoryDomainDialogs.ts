import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { validateBranchName } from '@/utils/gitRefValidation';
import type { RepositoryTranslator } from './repositoryDomainTypes';

type BranchDialogContext = RepositoryTranslator & {
  currentBranch: string;
};

const unknownLabel = (t: RepositoryTranslator['t']) => t('generated.components.staging_area.usefileoperations.unknown_af8d7dc4');
const repoNameFromPath = (activeRepo: string | null, t: RepositoryTranslator['t']) =>
  activeRepo ? activeRepo.split(/[\\/]/).pop() || activeRepo : unknownLabel(t);

export const buildDeleteBranchDialog = ({
  branchName,
  currentBranch,
  t,
  onDelete,
}: BranchDialogContext & {
  branchName: string;
  onDelete: () => Promise<void>;
}): ConfirmDialogState => ({
  variant: 'danger',
  title: t('generated.components.layout.hooks.userepositorydomain.delete_branch_02a82db3'),
  message: t('generated.components.layout.hooks.userepositorydomain.the_local_branch_will_be_removed_d33d1458'),
  contextItems: [
    { label: t('generated.components.staging_area.stashpanel.branch_0e8da813'), value: branchName },
    {
      label: t('generated.components.layout.hooks.userepositorydomain.active_branch_b25dcef4'),
      value: currentBranch || unknownLabel(t),
    },
  ],
  irreversible: false,
  consequences: t('generated.components.layout.hooks.userepositorydomain.if_the_branch_is_not_on_remote_work_may_be_lost_1a9ea900'),
  confirmLabel: t('generated.components.layout.hooks.userepositorydomain.delete_branch_15da7323'),
  onConfirm: onDelete,
});

export const buildForceDeleteBranchDialog = ({
  branchName,
  t,
  onForceDelete,
}: RepositoryTranslator & {
  branchName: string;
  onForceDelete: () => Promise<void>;
}): ConfirmDialogState => ({
  variant: 'danger',
  title: t('generated.components.layout.hooks.userepositorydomain.force_delete_branch_148c74d5'),
  message: t('generated.components.layout.hooks.userepositorydomain.the_branch_is_not_fully_merged_yet_delete_anyway_force_1007be11'),
  contextItems: [{ label: t('generated.components.staging_area.stashpanel.branch_0e8da813'), value: branchName }],
  irreversible: true,
  consequences: t('generated.components.layout.hooks.userepositorydomain.commits_only_in_this_branch_will_be_permanently_lost_737734f3'),
  confirmLabel: t('generated.components.layout.hooks.userepositorydomain.force_delete_f0837cd4'),
  onConfirm: onForceDelete,
});

export const buildMergeBranchDialog = ({
  branchName,
  currentBranch,
  mergeTarget,
  mergeModeLabel,
  commandPreview,
  t,
  onMerge,
}: BranchDialogContext & {
  branchName: string;
  mergeTarget: string;
  mergeModeLabel: string;
  commandPreview: string;
  onMerge: () => Promise<void>;
}): ConfirmDialogState => ({
  variant: 'confirm',
  title: t('generated.components.layout.hooks.userepositorydomain.merge_branch_86c1a5e0'),
  message: t('generated.components.layout.hooks.userepositorydomain.the_selected_branch_will_be_merged_into_the_current_bran_db9e5318'),
  contextItems: [
    { label: t('generated.components.layout.hooks.userepositorydomain.source_08fe450e'), value: branchName },
    { label: t('generated.components.layout.hooks.userepositorydomain.merge_ref_e72f373b'), value: mergeTarget },
    { label: t('generated.components.staging_area.stagingcommitpanel.mode_56610d60'), value: mergeModeLabel },
    {
      label: t('generated.components.layout.hooks.userepositorydomain.target_branch_8b94f3a7'),
      value: currentBranch || unknownLabel(t),
    },
    { label: t('generated.components.commit_graph.commitgraph.command_26cfbea8'), value: `git ${commandPreview}` },
  ],
  irreversible: false,
  consequences: t('generated.components.layout.hooks.userepositorydomain.conflicts_may_occur_on_success_a_new_merge_commit_may_be_927ecc69'),
  confirmLabel: t('generated.components.commit_graph.commitgraph.start_merge_516b5e37'),
  onConfirm: onMerge,
});

export const buildRenameBranchDialog = ({
  oldName,
  t,
  onRename,
}: RepositoryTranslator & {
  oldName: string;
  onRename: (newName: string) => Promise<void>;
}): InputDialogState => ({
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
    await onRename(newName);
  },
});

export const buildCreateTagDialog = ({
  currentBranch,
  t,
  onCreate,
}: RepositoryTranslator & {
  currentBranch: string;
  onCreate: (name: string, message: string) => Promise<void>;
}): InputDialogState => ({
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
      value: currentBranch || unknownLabel(t),
    },
  ],
  irreversible: false,
  consequences: t('generated.components.layout.hooks.userepositorydomain.annotated_tags_store_additional_metadata_and_message_fcf09424'),
  confirmLabel: t('generated.components.sidebar.tagpanel.create_tag_9d35faa7'),
  onSubmit: async (values) => {
    const name = (values.name || '').trim();
    if (!name) return;
    await onCreate(name, (values.message || '').trim());
  },
});

export const buildDeleteTagDialog = ({
  tagName,
  t,
  onDelete,
}: RepositoryTranslator & {
  tagName: string;
  onDelete: () => Promise<void>;
}): ConfirmDialogState => ({
  variant: 'danger',
  title: t('generated.components.layout.hooks.userepositorydomain.delete_tag_acbb5455'),
  message: t('generated.components.layout.hooks.userepositorydomain.the_tag_will_be_removed_locally_d135897d'),
  contextItems: [{ label: t('generated.components.layout.hooks.userepositorydomain.tag_d509084a'), value: tagName }],
  irreversible: false,
  consequences: t('generated.components.layout.hooks.userepositorydomain.if_already_pushed_the_tag_remains_on_remote_until_explic_1dcede84'),
  confirmLabel: t('generated.components.layout.hooks.userepositorydomain.delete_tag_a6dd4ad1'),
  onConfirm: onDelete,
});

export const buildAddRemoteDialog = ({
  activeRepo,
  t,
  onAdd,
}: RepositoryTranslator & {
  activeRepo: string | null;
  onAdd: (name: string, url: string) => Promise<void>;
}): InputDialogState => ({
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
  contextItems: [{ label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'), value: repoNameFromPath(activeRepo, t) }],
  irreversible: false,
  consequences: t('generated.components.layout.hooks.userepositorydomain.remote_will_be_saved_in_local_git_config_eb546a6d'),
  confirmLabel: t('generated.components.layout.hooks.userepositorydomain.save_remote_481a95a9'),
  onSubmit: async (values) => {
    const name = (values.name || '').trim();
    const url = (values.url || '').trim();
    if (!name || !url) return;
    await onAdd(name, url);
  },
});

export const buildRemoveRemoteDialog = ({
  activeRepo,
  remoteName,
  t,
  onRemove,
}: RepositoryTranslator & {
  activeRepo: string | null;
  remoteName: string;
  onRemove: () => Promise<void>;
}): ConfirmDialogState => ({
  variant: 'danger',
  title: t('generated.components.layout.hooks.userepositorydomain.remove_remote_73a08b94'),
  message: t('generated.components.layout.hooks.userepositorydomain.the_remote_will_be_removed_from_local_configuration_4a39ee89'),
  contextItems: [
    { label: t('generated.components.sidebar.branchpanel.remote_8a6f1451'), value: remoteName },
    { label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'), value: repoNameFromPath(activeRepo, t) },
  ],
  irreversible: false,
  consequences: t('generated.components.layout.hooks.userepositorydomain.push_pull_via_this_remote_will_no_longer_be_possible_unt_40c3ada6'),
  confirmLabel: t('generated.components.sidebar.remotepanel.remove_remote_7e7dee87'),
  onConfirm: onRemove,
});

export const buildRenameRemoteDialog = ({
  remoteName,
  t,
  onRename,
}: RepositoryTranslator & {
  remoteName: string;
  onRename: (newName: string) => Promise<void>;
}): InputDialogState => ({
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
    await onRename(newName);
  },
});

export const buildSetRemoteUrlDialog = ({
  remoteName,
  currentUrl,
  t,
  onSetUrl,
}: RepositoryTranslator & {
  remoteName: string;
  currentUrl: string;
  onSetUrl: (url: string) => Promise<void>;
}): InputDialogState => ({
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
    await onSetUrl(url);
  },
});
