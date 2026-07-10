import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { CatalogTranslateFn } from '@/i18n';

type AbortDialogParams = {
  t: CatalogTranslateFn;
  onConfirm: () => Promise<unknown> | void;
};

const asVoidConfirm = (onConfirm: () => Promise<unknown> | void): (() => void | Promise<void>) => {
  return () => {
    const result = onConfirm();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return Promise.resolve(result).then(() => undefined);
    }
  };
};

export const buildMergeAbortDialog = ({ t, onConfirm }: AbortDialogParams): ConfirmDialogState => ({
  variant: 'danger',
  title: t('generated.components.staging_area.useconflictresolver.abort_merge_b80580e6'),
  message: t('generated.components.staging_area.useconflictresolver.the_active_merge_will_be_discarded_and_reset_to_the_pre_7fdcd8df'),
  contextItems: [{ label: t('generated.components.staging_area.useconflictresolver.action_ba062410'), value: 'git merge --abort' }],
  irreversible: true,
  consequences: t('generated.components.staging_area.useconflictresolver.all_unsaved_merge_conflict_resolutions_will_be_lost_96aa2476'),
  confirmLabel: t('generated.components.layout.main.mainprimarypane.abort_merge_8f3c2f66'),
  onConfirm: asVoidConfirm(onConfirm),
});

export const buildRebaseAbortDialog = ({ t, onConfirm }: AbortDialogParams): ConfirmDialogState => ({
  variant: 'danger',
  title: t('generated.components.staging_area.useconflictresolver.abort_rebase_1cf7416a'),
  message: t('generated.components.staging_area.useconflictresolver.the_active_rebase_will_be_discarded_and_the_previous_bra_13fdc39c'),
  contextItems: [{ label: t('generated.components.staging_area.useconflictresolver.action_ba062410'), value: 'git rebase --abort' }],
  irreversible: true,
  consequences: t('generated.components.staging_area.useconflictresolver.all_unsaved_rebase_resolutions_will_be_lost_8fee553e'),
  confirmLabel: t('generated.components.layout.main.mainprimarypane.abort_rebase_c924fd71'),
  onConfirm: asVoidConfirm(onConfirm),
});

export const buildCherryPickAbortDialog = ({ t, onConfirm }: AbortDialogParams): ConfirmDialogState => ({
  variant: 'danger',
  title: t('generated.components.layout.main.mainprimarypane.abort_cherry_pick_5b6c7d8e'),
  message: t('generated.components.staging_area.useconflictresolver.the_active_cherry_pick_will_be_discarded_a1b2c3d4'),
  contextItems: [{ label: t('generated.components.staging_area.useconflictresolver.action_ba062410'), value: 'git cherry-pick --abort' }],
  irreversible: true,
  consequences: t('generated.components.staging_area.useconflictresolver.all_unsaved_cherry_pick_resolutions_will_be_lost_e5f6a7b8'),
  confirmLabel: t('generated.components.layout.main.mainprimarypane.abort_cherry_pick_5b6c7d8e'),
  onConfirm: asVoidConfirm(onConfirm),
});
