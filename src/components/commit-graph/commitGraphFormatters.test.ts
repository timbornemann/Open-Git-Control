import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCommitDate } from './commitGraphFormatters';

describe('formatCommitDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the time for commits from the last day', () => {
    const value = new Date(2026, 10, 14, 9, 5, 0);
    expect(formatCommitDate(value.toISOString(), 'en-US')).toBe(value.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
  });

  it('shows a relative time within the last week', () => {
    expect(formatCommitDate(new Date(2026, 10, 12, 12, 0, 0).toISOString(), 'en-US')).toMatch(/2 days ago/);
  });

  it('omits the year for older commits of the current year', () => {
    const value = new Date(2026, 8, 3, 12, 0, 0);
    expect(formatCommitDate(value.toISOString(), 'en-US')).toBe(value.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }));
  });

  it('adds a two-digit year for commits of an earlier year', () => {
    const value = new Date(2024, 10, 14, 12, 0, 0);
    const formatted = formatCommitDate(value.toISOString(), 'en-US');
    expect(formatted).toBe(value.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' }));
    expect(formatted).toContain('24');
  });

  it('returns a placeholder for invalid dates', () => {
    expect(formatCommitDate('not a date', 'en-US')).toBe('-');
  });
});
