import { describe, expect, it } from 'vitest';
import { redactGitCredentials } from '../redaction';

describe('redactGitCredentials', () => {
  it('redacts URL, scp-style and query credentials', () => {
    expect(redactGitCredentials('fatal: https://user:pa55@example.com/repo.git')).toBe('fatal: https://[REDACTED]@example.com/repo.git');
    expect(redactGitCredentials('remote at git+ssh://deploy@example.com/repo')).toBe('remote at git+ssh://[REDACTED]@example.com/repo');
    expect(redactGitCredentials(`url ${'x'.repeat(40)}https://token@example.com/repo`)).toBe(`url ${'x'.repeat(40)}https://[REDACTED]@example.com/repo`);
    expect(redactGitCredentials("cloning ('deploy@example.com:org/repo.git')")).toBe("cloning ('[REDACTED]@example.com:org/repo.git')");
    expect(redactGitCredentials('GET /archive?access_token=abc123&ref=main')).toBe('GET /archive?access_token=[REDACTED]&ref=main');
  });

  it('stays linear for long lines a Git server can send as remote messages', () => {
    const lines = ['a'.repeat(256 * 1024), '(a'.repeat(128 * 1024), '"a'.repeat(128 * 1024), `?${'a'.repeat(256 * 1024)}`];
    const startedAt = Date.now();
    for (const line of lines) redactGitCredentials(`remote: ${line}!`);
    // The previous patterns needed minutes for these lines.
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
});
