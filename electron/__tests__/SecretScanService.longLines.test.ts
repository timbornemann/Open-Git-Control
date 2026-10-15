import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../GitService';
import { SecretScanService } from '../SecretScanService';
import { GitIntegrationLifecycle } from '../git/__tests__/gitIntegrationLifecycle';
import { fixture, cleanupTransferFixtures, git } from '../git/__tests__/remoteTransferFixture';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const lifecycles: GitIntegrationLifecycle[] = [];
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.close()));
  await cleanupTransferFixtures();
}, 60_000);

describe('publishing historical files with very long lines', () => {
  it('detects boundary-spanning secrets, long assignments and following lines without leaking or duplicating findings', async () => {
    const lifecycle = new GitIntegrationLifecycle();
    lifecycles.push(lifecycle);
    await lifecycle.track(
      (async () => {
        const f = fixture(lifecycle);
        const token = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
        const aws = 'AKIA1234567890ABCDEF';
        const key = '2Qm5B1vwzeCYkFp3XflS5h6Z4y7cQQbd';
        const padding = 'x'.repeat(1024 * 1024 + 4096);
        const spaces = ' '.repeat(1024 * 1024 + 33);
        const files = {
          'bundle.js': `${'x'.repeat(65520)} ${token} ${padding} ${aws} 😀\n${token}\n`,
          '.env': `SERVICE_API_KEY=${key}${spaces}`,
          '.env.comment': `SERVICE_API_KEY=${key} #${padding}\n`,
          '.env.invalid': `SERVICE_API_KEY=${key}${spaces}NOT_A_COMMENT\n`,
          'quoted.js': `password="${padding}-${aws}-${padding}";\n`,
          'whitespace.js': `password${spaces}="${key}";\n`,
        };
        for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(f.repo, name), text);
        await lifecycle.git(f.repo, 'add', '.');
        const scanner = new SecretScanService(new GitService(undefined, lifecycle.scheduler));
        const result = await scanner.scanStagedDiffs({ repoPath: f.repo, strictness: 'medium', allowlistText: '', signal: lifecycle.signal });
        expect(result.stats).toMatchObject({ checkedLines: 7, stagedLines: 7 });
        expect(result.findings.map(({ filePath, lineNumber, ruleId }) => `${filePath}:${lineNumber}:${ruleId}`).sort()).toEqual([
          '.env.comment:1:configuration-secret-assignment',
          '.env:1:configuration-secret-assignment',
          'bundle.js:1:aws-access-key-id',
          'bundle.js:1:github-token',
          'bundle.js:2:github-token',
          'quoted.js:1:aws-access-key-id',
          'quoted.js:1:credential-assignment',
          'whitespace.js:1:credential-assignment',
        ]);
        for (const finding of result.findings) {
          expect(finding.contextLine.length).toBeLessThanOrEqual(2050);
          for (const secret of [token, aws, key]) expect(finding.contextLine).not.toContain(secret);
          if (!(finding.filePath === 'bundle.js' && finding.lineNumber === 2))
            expect(finding.contextLine).toBe('[REDACTED_SECRET] (long-line preview omitted)');
        }
        const allowlisted = await scanner.scanStagedDiffs({
          repoPath: f.repo,
          strictness: 'medium',
          allowlistText: 'path:bundle.js',
          signal: lifecycle.signal,
        });
        expect(allowlisted.findings).toHaveLength(5);
        expect(allowlisted.findings.some((finding) => finding.filePath === 'bundle.js')).toBe(false);
        const contentAllowlist = await scanner.scanStagedDiffs({ repoPath: f.repo, strictness: 'medium', allowlistText: 'regex:.*', signal: lifecycle.signal });
        expect(contentAllowlist.findings).toHaveLength(7);
        expect(contentAllowlist.findings.some((finding) => finding.filePath === 'bundle.js' && finding.lineNumber === 2)).toBe(false);
        expect(contentAllowlist.notes).toContain('Very long lines were scanned in overlapping segments; only path allowlist rules apply to these lines.');
      })(),
    );
  }, 60_000);

  it('scans and publishes the complete history including a removed line larger than 1 MiB', async () => {
    const lifecycle = new GitIntegrationLifecycle();
    lifecycles.push(lifecycle);
    await lifecycle.track(
      (async () => {
        const f = fixture(lifecycle);
        const asset = path.join(f.repo, 'asset.js');
        fs.writeFileSync(asset, `const asset = "${'x'.repeat(1024 * 1024 + 4096)}";\n`);
        await lifecycle.git(f.repo, 'add', 'asset.js');
        await lifecycle.git(f.repo, 'commit', '-m', 'Large historical asset');
        fs.unlinkSync(asset);
        await lifecycle.git(f.repo, 'add', '-u');
        await lifecycle.git(f.repo, 'commit', '-m', 'Remove old asset');
        const destination = f.bare('forgejo');
        await lifecycle.git(f.repo, 'remote', 'add', 'forgejo', destination);
        const scanner = new SecretScanService(new GitService(undefined, lifecycle.scheduler));
        f.context.authorizePush = vi.fn(async (args) => {
          const scope = await f.service.getPushScanScope(f.repo, args, f.context);
          expect(scope).not.toBeNull();
          const result = await scanner.scanPushDiffs({
            repoPath: f.repo,
            strictness: 'high',
            allowlistText: '',
            pushScanScope: scope!,
            signal: lifecycle.signal,
          });
          expect(result.findings).toEqual([]);
          expect(result.historyScanIncomplete).toBeUndefined();
          expect(result.stats.toPushLines).toBe(2);
        });
        const plan = await f.service.planPush(f.repo, { repoPath: f.repo, remoteNames: ['forgejo'] }, f.context);
        expect((await f.service.executePush(f.repo, plan.id, f.context)).state).toBe('success');
        expect(f.context.authorizePush).toHaveBeenCalledTimes(1);
        expect(git(f.repo, 'rev-parse', 'HEAD')).toBe(f.ref(destination));
        expect(git(destination, 'rev-list', '--count', 'main')).toBe('3');
      })(),
    );
  }, 60_000);
});
