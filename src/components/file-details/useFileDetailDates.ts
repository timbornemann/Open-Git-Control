import { useI18n } from '@/i18n';

export function useFileDetailDates() {
  const { t, tr, locale } = useI18n();
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return '-';

    const now = Date.now();
    const diffMs = now - parsed.getTime();
    const absMs = Math.abs(diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (absMs < minute) return t('generated.components.commitdetails.just_now_c80ae697');
    if (absMs < hour) return tr('vor ' + Math.max(1, Math.round(absMs / minute)) + ' Min', Math.max(1, Math.round(absMs / minute)) + ' min ago');
    if (absMs < day) return tr('vor ' + Math.max(1, Math.round(absMs / hour)) + ' Std', Math.max(1, Math.round(absMs / hour)) + ' h ago');
    const days = Math.max(1, Math.round(absMs / day));
    return tr('vor ' + days + ' Tag' + (days === 1 ? '' : 'en'), days + ' day' + (days === 1 ? '' : 's') + ' ago');
  };

  const formatBlameDate = (dateString: string) => {
    if (!dateString) return '-';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleDateString(locale, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return { formatDate, formatRelativeDate, formatBlameDate };
}
