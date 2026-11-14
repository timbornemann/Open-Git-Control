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

const RELATIVE_TIME_UNITS: { name: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { name: 'second', seconds: 1 },
  { name: 'minute', seconds: 60 },
  { name: 'hour', seconds: 3600 },
  { name: 'day', seconds: 86400 },
  { name: 'week', seconds: 604800 },
  { name: 'month', seconds: 2629800 },
  { name: 'year', seconds: 31557600 },
];

export const formatRelativeTime = (value: string | number | Date, locale: string, now: Date = new Date()): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '-';

  const diffSeconds = Math.round((parsed.getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });

  let unitIndex = 0;
  while (unitIndex + 1 < RELATIVE_TIME_UNITS.length && absSeconds >= RELATIVE_TIME_UNITS[unitIndex + 1].seconds) unitIndex += 1;
  const unit = RELATIVE_TIME_UNITS[unitIndex];
  const rounded = Math.round(absSeconds / unit.seconds);
  // Rounding can reach the next unit's size (59.5 min -> "60 min."); report
  // that as one of the larger unit instead.
  const next = RELATIVE_TIME_UNITS[unitIndex + 1];
  if (next && rounded * unit.seconds >= next.seconds) return rtf.format(Math.sign(diffSeconds), next.name);
  return rtf.format(Math.sign(diffSeconds) * rounded, unit.name);
};
