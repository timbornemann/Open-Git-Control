import { describe, expect, it } from 'vitest';
import { SecretScanService } from '../SecretScanService';
import { createGitServiceMock } from './secretScanTestUtils';

describe('bounded secret finding previews', () => {
  it.each(['ordinary-data ', '😀'])('retains the location and valid redacted context without retaining a huge %s line', async (prefix) => {
    const token = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
    const diff = ['diff --git a/app.ts b/app.ts', '+++ b/app.ts', '@@ -0,0 +1 @@', `+${prefix.repeat(20000)} ${token} ${'more-data '.repeat(20000)}`].join(
      '\n',
    );
    const service = new SecretScanService(createGitServiceMock({ 'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': diff }));
    const result = await service.scanStagedDiffs({ repoPath: '/repo', strictness: 'low', allowlistText: '' });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ filePath: 'app.ts', lineNumber: 1, ruleId: 'github-token' });
    expect(result.findings[0].contextLine.length).toBeLessThanOrEqual(2050);
    expect(result.findings[0].contextLine).toContain('[REDACTED_SECRET]');
    expect(result.findings[0].contextLine).not.toContain(token);
    expect(result.findings[0].contextLine).toContain('…');
    expect(
      [...result.findings[0].contextLine].some((character) => character.length === 1 && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff),
    ).toBe(false);
  });
});
