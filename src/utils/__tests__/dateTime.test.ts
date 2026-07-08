import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatRelativeTime, formatTime } from '@/utils/dateTime';

describe('dateTime utilities', () => {
  it('returns fallback for invalid date values', () => {
    expect(formatDateTime('invalid-date', 'en-US')).toBe('-');
    expect(formatTime(Number.NaN, 'en-US')).toBe('-');
    expect(formatDate(new Date('invalid'), 'en-US')).toBe('-');
    expect(formatRelativeTime('invalid-date', 'en-US')).toBe('-');
  });

  it('formats date/time values using locale APIs', () => {
    const value = new Date('2024-01-15T13:45:30.000Z');

    expect(formatDateTime(value, 'en-US')).toBe(value.toLocaleString('en-US'));
    expect(formatTime(value, 'en-US')).toBe(value.toLocaleTimeString('en-US'));
    expect(formatDate(value, 'en-US')).toBe(value.toLocaleDateString('en-US'));
  });

  it('formats relative time across all unit boundaries', () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'always', style: 'short' });

    const secondDate = new Date(now.getTime() + 30 * 1000);
    const minuteDate = new Date(now.getTime() + 2 * 60 * 1000);
    const hourDate = new Date(now.getTime() + 3 * 3600 * 1000);
    const dayDate = new Date(now.getTime() + 4 * 86400 * 1000);
    const weekDate = new Date(now.getTime() + 3 * 604800 * 1000);
    const monthDate = new Date(now.getTime() + 6 * 2629800 * 1000);
    const yearDate = new Date(now.getTime() + 7 * 31557600 * 1000);

    expect(formatRelativeTime(secondDate, 'en-US', now)).toBe(rtf.format(30, 'second'));
    expect(formatRelativeTime(minuteDate, 'en-US', now)).toBe(rtf.format(2, 'minute'));
    expect(formatRelativeTime(hourDate, 'en-US', now)).toBe(rtf.format(3, 'hour'));
    expect(formatRelativeTime(dayDate, 'en-US', now)).toBe(rtf.format(4, 'day'));
    expect(formatRelativeTime(weekDate, 'en-US', now)).toBe(rtf.format(3, 'week'));
    expect(formatRelativeTime(monthDate, 'en-US', now)).toBe(rtf.format(6, 'month'));
    expect(formatRelativeTime(yearDate, 'en-US', now)).toBe(rtf.format(7, 'year'));
  });
});
