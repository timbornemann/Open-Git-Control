import { formatDate, formatRelativeTime, formatTime } from '@/utils/dateTime';

export const formatCommitDate = (dateStr: string, locale: string): string => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return formatTime(date, locale, { hour: '2-digit', minute: '2-digit' });
    }

    if (diffDays < 7) {
      return formatRelativeTime(date, locale, now);
    }

    return formatDate(date, locale, { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
};
