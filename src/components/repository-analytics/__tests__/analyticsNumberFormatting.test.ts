import { describe, expect, it, vi } from 'vitest';
import { percent } from '../AnalyticsCharts';

describe('analytics percentage labels', () => {
  it('reuses one formatter per language across large graphs without mixing decimal separators', () => {
    const NumberFormat = Intl.NumberFormat;
    const formats = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (locale, options) {
      return new NumberFormat(locale, options);
    });
    try {
      for (let row = 0; row < 500; row++) {
        expect(percent(0.815, 'en-US')).toBe('81.5%');
        expect(percent(0.815, 'de-DE')).toBe('81,5%');
      }
      expect(formats).toHaveBeenCalledTimes(2);
      expect(percent(0.001, 'en-US')).toBe('0.1%');
      expect(percent(0.001, 'de-DE')).toBe('0,1%');
      expect(percent(0, 'en-US')).toBe('0%');
      expect(percent(1, 'de-DE')).toBe('100%');
    } finally {
      formats.mockRestore();
    }
  });
});
