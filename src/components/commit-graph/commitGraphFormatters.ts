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

    // Without a year, a commit from an earlier year is indistinguishable from
    // one of the current year. A two-digit year keeps the fixed-width column.
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    if (date.getFullYear() !== now.getFullYear()) options.year = '2-digit';
    return formatDate(date, locale, options);
  } catch {
    return '';
  }
};
