import { describe, expect, it } from 'vitest';
import cases from '../../../src/shared/recoveryPolicyCases.json';
import { assertOfficialUpdateInfo, isAllowedUpdaterRequest } from '../updaterSourcePolicy';

describe('shared native and Electron recovery security cases', () => {
  it.each(cases.cases)('$name', (test) => {
    const info = structuredClone(cases.base) as unknown as Record<string, unknown>;
    if (test.field) {
      const parts = test.field.split('.');
      let at = info;
      for (const part of parts.slice(0, -1)) at = at[part] as Record<string, unknown>;
      at[parts.at(-1)!] = structuredClone(test.value);
    }
    info.tag = `v${info.version}`;
    if (test.valid) expect(() => assertOfficialUpdateInfo(info, 'win32')).not.toThrow();
    else expect(() => assertOfficialUpdateInfo(info, 'win32')).toThrow();
  });
  it.each(cases.urls)('checks the same official URL boundary: $url', ({ url, valid }) => {
    expect(isAllowedUpdaterRequest(url)).toBe(valid);
  });
});
