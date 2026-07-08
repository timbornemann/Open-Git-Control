import type { DiffRequest } from '../../types/diff';
import type { CatalogTranslateFn } from '../../i18n';
import { toShortHash } from './diffViewerConstants';

export type TranslateFn = (deText: string, enText: string) => string;

export const formatBlameDate = (dateStr: string, t: CatalogTranslateFn, tr: TranslateFn) => {
  if (!dateStr) return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;

  const diffMs = Date.now() - parsed.getTime();
  const absMs = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return t('diffViewer.labels.justNow');
  }
  if (absMs < hour) {
    const mins = Math.max(1, Math.round(absMs / minute));
    return tr(`${mins} Min.`, `${mins} m.`);
  }
  if (absMs < day) {
    const hrs = Math.max(1, Math.round(absMs / hour));
    return tr(`${hrs} Std.`, `${hrs} h.`);
  }
  if (absMs < month) {
    const days = Math.max(1, Math.round(absMs / day));
    return tr(`${days} T.`, `${days} d.`);
  }
  if (absMs < year) {
    const mos = Math.max(1, Math.round(absMs / month));
    return tr(`${mos} Mon.`, `${mos} mo.`);
  }
  const yrs = Math.max(1, Math.round(absMs / year));
  return tr(`${yrs} J.`, `${yrs} y.`);
};

export const readableSourceLabel = (request: DiffRequest, t: CatalogTranslateFn, tr: TranslateFn): string => {
  if (request.source === 'staged') return t('diffViewer.labels.stagingArea');
  if (request.source === 'unstaged') return t('diffViewer.labels.workingTree');
  return tr(`Commit ${toShortHash(request.commitHash)}`, `Commit ${toShortHash(request.commitHash)}`);
};
