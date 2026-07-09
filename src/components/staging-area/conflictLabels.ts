import type { CatalogTranslateFn } from '@/i18n';
import { CONFLICT_LABELS } from './utils';

export const getConflictLabelForCode = (code: string, t: CatalogTranslateFn) => {
  if (code === 'UU') return t('generated.components.staging_area.conflictresolverpanel.both_modified_8049c5d2');
  if (code === 'AA') return t('generated.components.staging_area.conflictresolverpanel.both_added_3f407adb');
  if (code === 'DD') return t('generated.components.staging_area.conflictresolverpanel.both_deleted_93a3b84e');
  if (code === 'AU') return t('generated.components.staging_area.conflictresolverpanel.added_by_us_3a2b61da');
  if (code === 'UA') return t('generated.components.staging_area.conflictresolverpanel.added_by_them_89aa7951');
  if (code === 'DU') return t('generated.components.staging_area.conflictresolverpanel.deleted_by_us_b5e00b54');
  if (code === 'UD') return t('generated.components.staging_area.conflictresolverpanel.deleted_by_them_4bf23bbf');
  return CONFLICT_LABELS[code] || t('generated.components.staging_area.conflictresolverpanel.conflict_4f6ad783');
};
