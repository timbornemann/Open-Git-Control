import { describe, expect, it, vi } from 'vitest';
import { SecretScanService } from '../SecretScanService';

function createGitServiceMock(outputs: Record<string, string | Error>) {
  const resolve = async (args: string[]) => {
    const key = args.join(' ');
    const value = outputs[key];
    if (value instanceof Error) {
      throw value;
    }
    return typeof value === 'string' ? value : '';
  };
  return {
    runCommand: resolve,
    runCommandAtPath: async (_repoPath: string, args: string[]) => resolve(args),
    streamCommandLines: async (args: string[], onLine: (line: string) => void) => {
      const output = await resolve(args);
      output.split(/\r?\n/).forEach(onLine);
    },
    streamCommandLinesAtPath: async (_repoPath: string, args: string[], onLine: (line: string) => void) => {
      const output = await resolve(args);
      output.split(/\r?\n/).forEach(onLine);
    },
  } as any;
}

describe('SecretScanService', () => {
  it('detects high-confidence AI provider keys at low strictness', async () => {
    const keys = [
      ['openai-project-api-key', 'sk-proj-K7xP2mQ9vR4tN8cW3yL6dF1hJ5sA0bE2'],
      ['openai-service-account-api-key', 'sk-svcacct-R9pL3xW7nK2mV8qF4cJ6tA1yD5hB0sE3'],
      ['anthropic-api-key', 'sk-ant-api03-X7mQ2pV9kR4nW8cL3yF6tJ1hD5sA0bE2-G4uN9zC7xP3'],
      ['google-api-key', 'AIzaSyD7mQ2pV9kR4nW8cL3yF6tJ1hD5sA0bE2X'],
      ['groq-api-key', 'gsk_K7mP2xR9vQ4nW8cL3yF6tJ1hD5sA0bE2'],
      ['openrouter-api-key', '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'],
      ['hugging-face-access-token', 'hf_K7mP2xR9vQ4nW8cL3yF6tJ1hD5sA0bE2'],
      ['replicate-api-token', 'r8_K7mP2xR9vQ4nW8cL3yF6tJ1hD5sA0bE2'],
    ] as const;
    const stagedDiff = keys.flatMap(([, key], index) => [
      `diff --git a/src/key-${index}.ts b/src/key-${index}.ts`,
      `+++ b/src/key-${index}.ts`,
      '@@ -0,0 +1 @@',
      `+// ${key}`,
    ]);
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff.join('\n'),
      }),
    );

    const result = await service.scanStagedDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings.map((finding) => finding.ruleId).sort()).toEqual(keys.map(([ruleId]) => ruleId).sort());
  });

  it('detects less distinctive AI provider prefixes at medium strictness', async () => {
    const keys = [
      ['xai-api-key', 'xai-K7mP2xR9vQ4nW8cL3yF6tJ1hD5sA0bE2'],
      ['perplexity-api-key', 'pplx-K7mP2xR9vQ4nW8cL3yF6tJ1hD5sA0bE2'],
      ['together-ai-api-key', 'tgp_v1_K7mP2xR9vQ4nW8cL3yF6tJ1hD5sA0bE2'],
      ['fireworks-ai-api-key', 'fw_K7mP2xR9vQ4nW8cL3yF6tJ1hD5sA0bE2'],
    ] as const;
    const stagedDiff = keys.flatMap(([, key], index) => [
      `diff --git a/src/key-${index}.ts b/src/key-${index}.ts`,
      `+++ b/src/key-${index}.ts`,
      '@@ -0,0 +1 @@',
      `+// ${key}`,
    ]);
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff.join('\n'),
      }),
    );

    await expect(service.scanStagedDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' })).resolves.toMatchObject({ findings: [] });
    const result = await service.scanStagedDiffs({ repoPath: '/tmp/repo', strictness: 'medium', allowlistText: '' });

    expect(result.findings.map((finding) => finding.ruleId).sort()).toEqual(keys.map(([ruleId]) => ruleId).sort());
  });

  it('detects contextual AI keys in staged configuration files without matching the same code assignment', async () => {
    const testValue = '2Qm5B1vwzeCYkFp3XflS5h6Z4y7cQQbd';
    const stagedDiff = [
      'diff --git a/data.ini b/data.ini',
      '+++ b/data.ini',
      '@@ -0,0 +1 @@',
      `+key=${testValue}`,
      'diff --git a/.env b/.env',
      '+++ b/.env',
      '@@ -0,0 +1 @@',
      '+DASHSCOPE_API_KEY=sk-91f3a7c2e8b64d05a4f1c9e7b2d83a60',
      'diff --git a/config.conf b/config.conf',
      '+++ b/config.conf',
      '@@ -0,0 +1 @@',
      '+MISTRAL_API_KEY=mQ7pV2xR9kL4nW8cF3yJ6tD1hS5aB0eE',
      'diff --git a/.env.gemini b/.env.gemini',
      '+++ b/.env.gemini',
      '@@ -0,0 +1 @@',
      '+GEMINI_API_KEY=AQ.AbC7mQ2pV9kR4nW8cL3yF6tJ1hD5sA0bE2xZ',
      'diff --git a/src/example.ts b/src/example.ts',
      '+++ b/src/example.ts',
      '@@ -0,0 +1 @@',
      `+const key = '${testValue}';`,
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
      }),
    );

    const result = await service.scanStagedDiffs({ repoPath: '/tmp/repo', strictness: 'medium', allowlistText: '' });

    expect(result.findings).toHaveLength(4);
    expect(result.findings.map((finding) => finding.filePath).sort()).toEqual(['.env', '.env.gemini', 'config.conf', 'data.ini']);
    expect(result.findings.every((finding) => finding.ruleId === 'configuration-secret-assignment')).toBe(true);
  });

  it('does not flag a low-entropy configuration value with a generic key name', async () => {
    const stagedDiff = ['diff --git a/data.ini b/data.ini', '+++ b/data.ini', '@@ -0,0 +1 @@', '+key=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
      }),
    );

    const result = await service.scanStagedDiffs({ repoPath: '/tmp/repo', strictness: 'medium', allowlistText: '' });

    expect(result.findings).toHaveLength(0);
  });

  it('scans only the staged patch for the fast pre-commit check', async () => {
    const stagedDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const runCommandAtPath = vi.fn();
    const streamCommandLinesAtPath = vi.fn(
      async (_repoPath: string, args: string[], onLine: (line: string) => void, _signal: AbortSignal | undefined, options: any) => {
        expect(args).toEqual(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=0']);
        expect(options).toMatchObject({ redactOutput: false });
        stagedDiff.split(/\r?\n/).forEach(onLine);
      },
    );
    const service = new SecretScanService({ runCommandAtPath, streamCommandLinesAtPath } as any);

    const result = await service.scanStagedDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ source: 'staged', filePath: '.env' });
    expect(result.stats).toMatchObject({ checkedLines: 1, stagedLines: 1, toPushLines: 0, tagLines: 0 });
    expect(streamCommandLinesAtPath).toHaveBeenCalledTimes(1);
    expect(runCommandAtPath).not.toHaveBeenCalled();
  });

  it('detects staged and outgoing secrets', async () => {
    const outgoingCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const stagedDiff = [
      'diff --git a/src/app.ts b/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -0,0 +1,2 @@',
      '+const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
      '+console.log("ok");',
    ].join('\n');
    const outgoingDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'rev-list --reverse --topo-order origin/main..HEAD': outgoingCommit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${outgoingCommit}`]:
          outgoingDiff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });
    expect(result.findings.length).toBe(2);
    expect(result.findings.map((f) => f.source).sort()).toEqual(['staged', 'to-push']);
  });

  it('detects fine-grained GitHub PATs in unquoted .env assignments', async () => {
    const stagedDiff = [
      'diff --git a/.env b/.env',
      '+++ b/.env',
      '@@ -0,0 +1 @@',
      '+GITHUB_TOKEN=github_pat_11ABCDEFG0abcdefghijkl_1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN',
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
        'rev-list --reverse --topo-order HEAD --not --remotes': '',
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings.map((finding) => finding.ruleId)).toContain('github-fine-grained-pat');
    expect(result.findings.find((finding) => finding.ruleId === 'github-fine-grained-pat')?.source).toBe('staged');
  });

  it('scans every outgoing commit so a secret removed by a later commit is still found', async () => {
    const secretCommit = '1111111111111111111111111111111111111111';
    const removalCommit = '2222222222222222222222222222222222222222';
    const secretDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const removalDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -1 +0,0 @@', '-AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'rev-list --reverse --topo-order origin/main..HEAD': `${secretCommit}\n${removalCommit}`,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${secretCommit} ${removalCommit}`]: `${secretDiff}\n${removalDiff}`,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ source: 'to-push', filePath: '.env' });
    expect(result.notes.join('\n')).toContain('Scanned 2 commit(s) ahead of origin/main.');
  });

  it('accepts SHA-256 commit ids while enumerating outgoing commits', async () => {
    const sha256Commit = 'a'.repeat(64);
    const diff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'rev-list --reverse --topo-order origin/main..HEAD': sha256Commit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${sha256Commit}`]: diff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
  });

  it('respects project allowlist', async () => {
    const stagedDiff = [
      'diff --git a/src/app.ts b/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -0,0 +1 @@',
      '+const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
    ].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
      }),
    );

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: 'regex:ghp_[a-z0-9]+',
    });

    expect(result.findings).toHaveLength(0);
  });

  it('falls back to unpushed HEAD commits when no upstream is configured', async () => {
    const commitHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const outgoingCommitDiff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
        'rev-list --reverse --topo-order HEAD --not --remotes': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]:
          outgoingCommitDiff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].source).toBe('to-push');
    expect(result.notes.join('\n')).toContain('Scanned 1 commit(s) from requested push source HEAD.');
  });

  it('scans commits that would only be published by push --tags', async () => {
    const tagCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const tagDiff = ['diff --git a/release.env b/release.env', '+++ b/release.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');

    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'diff --no-ext-diff --no-textconv --no-color --unified=0 origin/main..HEAD': '',
        'rev-list --reverse --topo-order --tags --not --remotes': tagCommit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${tagCommit}`]: tagDiff,
      }),
    );

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      includeTags: true,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].source).toBe('tag');
    expect(result.stats.tagLines).toBe(1);
  });

  it('scans paths that were previously skipped by built-in ignore rules and redacts every matched secret', async () => {
    const exposedKey = 'sk_live_1234567890abcdefghijklmnop';
    const stagedDiff = ['diff --git a/dist/runtime.js b/dist/runtime.js', '+++ b/dist/runtime.js', '@@ -0,0 +1 @@', `+window.runtimeKey = ${exposedKey};`].join(
      '\n',
    );
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'diff --no-ext-diff --no-textconv --no-color --unified=0 origin/main..HEAD': '',
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ filePath: 'dist/runtime.js', contextLine: expect.stringContaining('[REDACTED_SECRET]') });
    expect(result.findings[0].contextLine).not.toContain(exposedKey);
  });

  it('decodes quoted patch file headers instead of skipping secrets in special file names', async () => {
    const stagedDiff = [
      'diff --git "a/secrets\\tconfig.env" "b/secrets\\tconfig.env"',
      '+++ "b/secrets\\tconfig.env"',
      '@@ -0,0 +1 @@',
      '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF',
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': stagedDiff,
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'diff --no-ext-diff --no-textconv --no-color --unified=0 origin/main..HEAD': '',
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].filePath).toBe('secrets\tconfig.env');
  });

  it('fails closed when it cannot enumerate outgoing commits without an upstream', async () => {
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': new Error('no upstream'),
        'rev-list --reverse --topo-order HEAD --not --remotes': new Error('repository unavailable'),
      }),
    );

    await expect(service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' })).rejects.toThrow(
      'Could not determine commits that would be pushed',
    );
  });

  it('scans the local source branch selected by an explicit push refspec', async () => {
    const commitHash = 'cccccccccccccccccccccccccccccccccccccccc';
    const branchDiff = [
      'diff --git a/config/release.ts b/config/release.ts',
      '+++ b/config/release.ts',
      '@@ -0,0 +1 @@',
      '+const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";',
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-list --reverse --topo-order release-candidate': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: branchDiff,
      }),
    );

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      revisions: ['release-candidate'],
      excludeRemote: 'backup',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.notes.join('\n')).toContain('requested push source release-candidate');
  });

  it('detects conflict-resolution-only secrets in a merge combined diff', async () => {
    const mergeCommit = 'e'.repeat(40);
    const combinedDiff = [
      'diff --cc .env',
      '--- a/.env',
      '+++ b/.env',
      '@@@ -1,1 -1,1 +1,2 @@@',
      '  SAFE=value',
      '++AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF',
    ].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'rev-parse --abbrev-ref --symbolic-full-name @{upstream}': 'origin/main',
        'rev-list --reverse --topo-order origin/main..HEAD': mergeCommit,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${mergeCommit}`]:
          combinedDiff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ filePath: '.env', lineNumber: 2, source: 'to-push' });
  });

  it('scans the full configured push source without trusting potentially stale remote-tracking refs', async () => {
    const commitHash = 'f'.repeat(40);
    const diff = ['diff --git a/.env b/.env', '+++ b/.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
        'config --get-all remote.origin.push': 'refs/heads/release:refs/heads/release',
        'rev-list --reverse --topo-order refs/heads/release': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: diff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '', pushArgs: [] });

    expect(result.findings).toHaveLength(1);
    expect(result.notes.join('\n')).toContain('refs/heads/release');
  });

  it('honors push.default=matching instead of scanning only HEAD', async () => {
    const commitHash = '1'.repeat(40);
    const diff = ['diff --git a/feature.env b/feature.env', '+++ b/feature.env', '@@ -0,0 +1 @@', '+AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF'].join('\n');
    const service = new SecretScanService(
      createGitServiceMock({
        'diff --cached --no-ext-diff --no-textconv --no-color --unified=0': '',
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
        'config --get push.default': 'matching',
        'for-each-ref --format=%(refname) refs/heads': 'refs/heads/main\nrefs/heads/feature',
        'for-each-ref --format=%(refname) refs/remotes/origin/': 'refs/remotes/origin/main\nrefs/remotes/origin/feature',
        'rev-list --reverse --topo-order refs/heads/main': '',
        'rev-list --reverse --topo-order refs/heads/feature': commitHash,
        [`show --format= --diff-merges=first-parent --no-ext-diff --no-textconv --no-color --unified=0 --find-renames --find-copies ${commitHash}`]: diff,
      }),
    );

    const result = await service.scanPushDiffs({ repoPath: '/tmp/repo', strictness: 'low', allowlistText: '', pushArgs: [] });

    expect(result.findings).toHaveLength(1);
    expect(result.notes.join('\n')).toContain('refs/heads/feature');
  });

  it('does not scan an unrelated upstream for an explicit deletion refspec', async () => {
    const runCommandAtPath = vi.fn(async (_repoPath: string, args: string[]) => {
      const key = args.join(' ');
      const values: Record<string, string> = {
        'symbolic-ref --quiet --short HEAD': 'main',
        remote: 'origin',
      };
      return values[key] || '';
    });
    const streamCommandLinesAtPath = vi.fn(async (_repoPath: string, args: string[], _onLine: (line: string) => void) => {
      if (args[0] === 'diff') return;
      throw new Error(`Unexpected commit scan: ${args.join(' ')}`);
    });
    const service = new SecretScanService({ runCommandAtPath, streamCommandLinesAtPath } as any);

    const result = await service.scanPushDiffs({
      repoPath: '/tmp/repo',
      strictness: 'low',
      allowlistText: '',
      pushArgs: ['origin', ':refs/heads/obsolete'],
    });

    expect(result.findings).toEqual([]);
    expect(result.notes).toContain('The requested push has no branch commit source to scan.');
    expect(runCommandAtPath.mock.calls.some(([, args]) => args.includes('@{upstream}'))).toBe(false);
  });
});
