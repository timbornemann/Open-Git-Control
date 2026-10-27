import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../../../GitService';
import { handleGitCommand } from '../gitCommandRouter';
import { explicitPushArguments, prepareForcePushArguments } from '../../../git/GitPushArguments';
import { normalizeCommandArgs } from '../../gitCommandPolicy';

const roots: string[] = [];
async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-push-refspec-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  const remote = path.join(root, 'server.git');
  fs.mkdirSync(repo);
  const service = new GitService();
  const run = (args: string[]) => service.runCommandAtPath(repo, args);
  const server = (args: string[]) => service.runCommandAtPath(remote, args);
  await run(['init', '-b', 'main']);
  for (const [key, value] of [
    ['commit.gpgSign', 'false'],
    ['user.name', 'Push Policy Test'],
    ['user.email', 'push-policy@example.test'],
    ['maintenance.auto', 'false'],
    ['gc.auto', '0'],
  ])
    await run(['config', key, value]);
  await service.runCommandAtPath(root, ['init', '--bare', remote]);
  await run(['commit', '--allow-empty', '-m', 'base']);
  const base = await run(['rev-parse', 'HEAD']);
  await run(['remote', 'add', 'origin', remote]);
  await run(['push', '-u', 'origin', 'HEAD:refs/heads/main']);
  const push = (...args: string[]) => handleGitCommand({ sender: { send: vi.fn() } }, service, 'push', args, repo);
  const prepare = async (...args: string[]) => {
    const result = await handleGitCommand({ sender: {} }, service, 'prepareForcePush', args, repo);
    if (!result.success) throw new Error(result.error);
    return (JSON.parse(result.data!) as string[]).slice(1);
  };
  const diverge = async () => {
    await run(['commit', '--allow-empty', '-m', 'local']);
    const local = await run(['rev-parse', 'HEAD']);
    await run(['checkout', '-b', 'remote-update', base]);
    await run(['commit', '--allow-empty', '-m', 'remote']);
    const remoteHead = await run(['rev-parse', 'HEAD']);
    await run(['push', 'origin', 'HEAD:refs/heads/main']);
    await run(['checkout', 'main']);
    return { local, remoteHead };
  };
  return { root, repo, service, run, server, push, prepare, base, diverge };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-push-refspec-'))
      throw new Error('Unsafe test cleanup.');
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe('git push refspec security', { timeout: 60000 }, () => {
  it('rejects force and deletion operands before any Git execution', async () => {
    const service = { runCommandAtPath: vi.fn(), runner: { run: vi.fn() }, streamCommandOutputAtPath: vi.fn() } as any;
    for (const ref of ['+HEAD:refs/heads/main', ':main', '+:main', ':refs/tags/release']) {
      expect(await handleGitCommand({ sender: {} }, service, 'push', ['origin', ref], '/repo')).toMatchObject({ success: false });
    }
    expect(await handleGitCommand({ sender: {} }, service, 'fetch', ['origin', '+refs/heads/main:refs/heads/other'], '/repo')).toMatchObject({
      success: false,
    });
    expect(service.runCommandAtPath).not.toHaveBeenCalled();
    expect(service.runner.run).not.toHaveBeenCalled();
    expect(service.streamCommandOutputAtPath).not.toHaveBeenCalled();
  });

  it('never inherits force from configured push refspecs, including a source-only explicit push', async () => {
    const f = await fixture();
    const { remoteHead } = await f.diverge();
    await f.server(['update-ref', 'refs/heads/review', remoteHead]);
    await f.run(['config', 'remote.origin.push', '+refs/heads/main:refs/heads/review']);
    const execute = vi.spyOn(f.service.runner, 'run');
    expect(await f.push('origin')).toMatchObject({ success: false });
    expect(await f.push('origin', 'main')).toMatchObject({ success: false });
    expect(await f.push('origin', 'HEAD')).toMatchObject({ success: false });
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(remoteHead);
    expect(await f.server(['rev-parse', 'refs/heads/review'])).toBe(remoteHead);
    const pushes = execute.mock.calls.filter(([, args]) => args[0] === 'push');
    expect(pushes.map(([, args]) => args)).toEqual([
      ['push', '--no-mirror', '--no-force', '--', 'origin', 'refs/heads/main:refs/heads/review'],
      ['push', '--no-mirror', '--no-force', '--', 'origin', 'main:refs/heads/review'],
      ['push', '--no-mirror', '--no-force', '--', 'origin', 'HEAD:refs/heads/main'],
    ]);
    for (const [, args, options] of pushes) {
      expect(args.some((arg) => arg.startsWith('+'))).toBe(false);
      expect(options?.envOverrides).toMatchObject({ GIT_CONFIG_KEY_0: 'remote.origin.mirror', GIT_CONFIG_VALUE_0: 'false' });
    }
  });

  it('rejects a stale lease even with a leading + and permits an explicitly leased rewrite', async () => {
    const f = await fixture();
    const { local, remoteHead } = await f.diverge();
    const stale = await f.push(`--force-with-lease=refs/heads/main:${f.base}`, 'origin', '+HEAD:refs/heads/main');
    expect(stale).toMatchObject({ success: false, error: expect.stringMatching(/stale info/i) });
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(remoteHead);
    expect(await f.push(`--force-with-lease=refs/heads/main:${remoteHead}`, 'origin', '+HEAD:refs/heads/main')).toMatchObject({ success: true });
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(local);
  });

  it('rejects the confirmed lease after a remote change and a background fetch, then permits a freshly prepared rewrite', async () => {
    const f = await fixture();
    const prepared = await f.prepare('--force-with-lease');
    const { local, remoteHead } = await f.diverge();
    await f.run(['fetch', 'origin']);
    expect(await f.run(['rev-parse', 'refs/remotes/origin/main'])).toBe(remoteHead);
    expect(await f.push(...prepared)).toMatchObject({
      success: false,
      error: expect.stringMatching(/stale info/i),
    });
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(remoteHead);
    expect(await f.push('--force-with-lease')).toMatchObject({ success: false, error: expect.stringContaining('Prepare the force push') });
    expect(await f.push(...(await f.prepare('--force-with-lease')))).toMatchObject({ success: true });
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(local);
  });

  it('does not inherit mirroring, force updates or deletions from remote configuration', async () => {
    const f = await fixture();
    const { remoteHead } = await f.diverge();
    await f.server(['update-ref', 'refs/heads/keep', f.base]);
    await f.run(['config', 'remote.origin.mirror', 'true']);
    await f.run(['config', 'remote.origin.push', ':refs/heads/keep']);
    expect(await f.push('origin', 'HEAD:refs/heads/main')).toMatchObject({ success: false });
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(remoteHead);
    expect(await f.server(['rev-parse', 'refs/heads/keep'])).toBe(f.base);
    expect(await f.server(['for-each-ref', '--format=%(refname)', 'refs/heads'])).toBe('refs/heads/keep\nrefs/heads/main');
    expect(await f.push('origin')).toMatchObject({ success: false, error: expect.stringContaining('Deletion') });
    expect(await f.server(['rev-parse', 'refs/heads/keep'])).toBe(f.base);
  });

  it('protects a destination that was absent during preparation and retains explicit upstream setup', async () => {
    const f = await fixture();
    await f.run(['commit', '--allow-empty', '-m', 'local']);
    const head = await f.run(['rev-parse', 'HEAD']);
    const prepared = await f.prepare('--force-with-lease', '-u', 'origin', 'HEAD:refs/heads/new');
    expect(prepared).toContain('--force-with-lease=refs/heads/new:');
    await f.server(['update-ref', 'refs/heads/new', f.base]);
    await f.run(['fetch', 'origin']);
    expect(await f.push(...prepared)).toMatchObject({ success: false, error: expect.stringMatching(/stale info/i) });
    expect(await f.server(['rev-parse', 'refs/heads/new'])).toBe(f.base);
    expect(await f.push(...(await f.prepare('--force-with-lease', '-u', 'origin', 'HEAD:refs/heads/new')))).toMatchObject({ success: true });
    expect(await f.server(['rev-parse', 'refs/heads/new'])).toBe(head);
    expect(await f.run(['config', '--get', 'branch.main.merge'])).toBe('refs/heads/new');
  });

  it('preserves force-with-lease matching semantics without publishing local-only branches', async () => {
    const f = await fixture();
    const { local } = await f.diverge();
    await f.run(['branch', 'local-only']);
    await f.run(['config', 'push.default', 'matching']);
    const prepared = await f.prepare('--force-with-lease');
    expect(prepared).toContain(':');
    expect(await f.push(...prepared)).toMatchObject({ success: true });
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(local);
    expect(await f.server(['for-each-ref', '--format=%(refname)', 'refs/heads/local-only'])).toBe('');
  });

  it('preserves ordinary default pushes, custom destinations, upstream setup and tag pushes', async () => {
    const f = await fixture();
    expect(await f.push('--tags')).toMatchObject({ success: true });
    await f.run(['commit', '--allow-empty', '-m', 'next']);
    const head = await f.run(['rev-parse', 'HEAD']);
    expect(await f.push()).toMatchObject({ success: true });
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(head);
    await f.run(['config', 'remote.origin.push', '+HEAD:refs/heads/custom']);
    expect(await f.push()).toMatchObject({ success: true });
    expect(await f.server(['rev-parse', 'refs/heads/custom'])).toBe(head);
    await f.run(['tag', 'release']);
    await f.run(['config', 'remote.origin.push', ':refs/heads/main']);
    expect(await f.push('--tags')).toMatchObject({ success: true });
    expect(await f.server(['rev-parse', 'refs/tags/release'])).toBe(head);
    expect(await f.server(['rev-parse', 'refs/heads/main'])).toBe(head);
    await f.run(['checkout', '-b', 'feature']);
    expect(await f.push('-u', 'origin', 'HEAD:refs/heads/feature')).toMatchObject({ success: true });
    expect(await f.run(['config', '--get', 'branch.feature.merge'])).toBe('refs/heads/feature');
  });

  it('selects the same refs as native Git for defaults and configured source-only mappings', async () => {
    const f = await fixture();
    await f.run(['commit', '--allow-empty', '-m', 'next']);
    const compare = async (args: string[]) => {
      const native = await f.run(['push', '--porcelain', '--dry-run', ...args]);
      const normalized = normalizeCommandArgs('push', args);
      const protectedArgs = args.includes('--force-with-lease') ? (await prepareForcePushArguments(normalized, f.run)).slice(1) : normalized;
      const explicit = await explicitPushArguments(protectedArgs, f.run);
      const protectedPush = await f.run(['push', '--porcelain', '--dry-run', ...explicit.slice(1)]);
      const updates = (output: string) => output.split('\n').filter((line) => /^[ *+=!\-]\t/.test(line));
      expect(updates(protectedPush), JSON.stringify(args)).toEqual(updates(native));
    };
    for (const mode of ['simple', 'current', 'upstream', 'matching']) {
      await f.run(['config', 'push.default', mode]);
      await compare([]);
    }
    await f.run(['config', 'branch.main.merge', 'refs/heads/review']);
    await f.run(['config', 'push.default', 'upstream']);
    await compare([]);
    for (const spec of [
      'HEAD:refs/heads/custom',
      'refs/heads/main:refs/heads/custom',
      'main:refs/heads/custom',
      'refs/heads/*:refs/heads/review/*',
      'main',
      '+main',
    ]) {
      await f.run(['config', 'remote.origin.push', spec]);
      await compare(['origin']);
      await compare(['origin', 'HEAD']);
      await compare(['origin', 'main']);
      await compare(['--force-with-lease', 'origin', '+main']);
    }
  });
});
