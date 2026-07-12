import { describe, expect, it } from 'vitest';
import { parseGitHubPushProtectionFailure } from './githubPushProtection';

const githubPushProtectionOutput = `remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - GITHUB PUSH PROTECTION
remote:      (?) Learn how to resolve a blocked push
remote:      https://docs.github.com/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line#resolving-a-blocked-push
remote:       —— OpenRouter API Key ————————————————————————————————
remote:        locations:
remote:          - commit: e9ca6793dddfbc8cd8b38cf228ef8ef2a24a6604
remote:            path: electron/__tests__/SecretScanService.test.ts:35
remote:        https://github.com/acme/repo/security/secret-scanning/unblock-secret/3GOqe3asA6gtN0IF3bBVDs13mQn`;

describe('parseGitHubPushProtectionFailure', () => {
  it('extracts actionable GitHub Push Protection metadata without returning raw output', () => {
    expect(parseGitHubPushProtectionFailure(githubPushProtectionOutput)).toEqual({
      documentationUrl:
        'https://docs.github.com/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line#resolving-a-blocked-push',
      securitySettingsUrl: null,
      violations: [
        {
          secretType: 'OpenRouter API Key',
          commitHash: 'e9ca6793dddfbc8cd8b38cf228ef8ef2a24a6604',
          filePath: 'electron/__tests__/SecretScanService.test.ts',
          lineNumber: 35,
          unblockUrl: 'https://github.com/acme/repo/security/secret-scanning/unblock-secret/3GOqe3asA6gtN0IF3bBVDs13mQn',
        },
      ],
    });
  });

  it('does not treat unrelated push errors as Push Protection failures', () => {
    expect(parseGitHubPushProtectionFailure('remote: error: failed to update ref')).toBeNull();
  });
});
