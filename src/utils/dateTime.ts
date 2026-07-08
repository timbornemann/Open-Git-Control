export const formatDateTime = (value: string | number | Date, locale: string, options?: Intl.DateTimeFormatOptions): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '-';
  return parsed.toLocaleString(locale, options);
};

export const formatTime = (value: string | number | Date, locale: string, options?: Intl.DateTimeFormatOptions): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '-';
  return parsed.toLocaleTimeString(locale, options);
};

export const formatDate = (value: string | number | Date, locale: string, options?: Intl.DateTimeFormatOptions): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(locale, options);
};

export const formatRelativeTime = (value: string | number | Date, locale: string, now: Date = new Date()): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '-';

  const diffSeconds = Math.round((parsed.getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });

  if (absSeconds < 60) return rtf.format(diffSeconds, 'second');
  if (absSeconds < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (absSeconds < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (absSeconds < 604800) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  if (absSeconds < 2629800) return rtf.format(Math.round(diffSeconds / 604800), 'week');
  if (absSeconds < 31557600) return rtf.format(Math.round(diffSeconds / 2629800), 'month');
  return rtf.format(Math.round(diffSeconds / 31557600), 'year');
};
