import { describe, expect, it, vi } from 'vitest';
import { explicitPushArguments, prepareForcePushArguments } from '../GitPushArguments';

const old = 'a'.repeat(40);
const next = 'b'.repeat(40);
const lease = (ref = 'refs/heads/main', oid = old) => `--force-with-lease=${ref}:${oid}`;
function fixture(extra: Array<[string, string]> = []) {
  const config = [
    ['remote.origin.url', '/server.git'],
    ['remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'],
    ['branch.main.remote', 'origin'],
    ['branch.main.merge', 'refs/heads/main'],
    ...extra,
  ];
  const refs = new Map([
    ['refs/heads/main', next],
    ['refs/remotes/origin/main', old],
  ]);
  const read = vi.fn(async (args: string[]) => {
    if (args.includes('--type=bool')) return config.find(([key]) => key === 'push.followtags')?.[1] ?? 'false';
    if (args[0] === 'config') return config.map(([key, value]) => `${key}\n${value}\0`).join('');
    if (args[0] === 'symbolic-ref') return 'refs/heads/main';
    if (args[0] === 'remote') return '/server.git';
    if (args[0] === 'ls-remote') return '';
    if (args[0] === 'for-each-ref') return [...refs].map(([ref, oid]) => `${ref}\0${oid}`).join('\n');
    if (args[0] === 'rev-parse') return args.at(-1)!.startsWith('refs/') ? args.at(-1)! : 'refs/heads/main';
    throw new Error(`Unexpected query: ${args.join(' ')}`);
  });
  const prepare = (args = ['--force-with-lease']) => prepareForcePushArguments(args, read);
  return { refs, read, prepare };
}

describe('fixed push leases', () => {
  it('pins defaults before approval and never changes the expected value after a background fetch', async () => {
    const f = fixture();
    const prepared = await f.prepare();
    expect(prepared).toEqual(['push', '--no-follow-tags', lease(), 'origin', 'refs/heads/main:refs/heads/main']);
    f.refs.set('refs/remotes/origin/main', next);
    expect(await explicitPushArguments(prepared.slice(1), f.read)).toContain(lease());
    expect(await explicitPushArguments(prepared.slice(1), f.read)).not.toContain(lease('refs/heads/main', next));
    expect(f.read.mock.calls.some(([args]) => ['fetch', 'ls-remote', 'push'].includes(args[0]))).toBe(false);
  });

  it('refuses implicit or malformed expectations at execution', async () => {
    const f = fixture();
    for (const option of ['--force-with-lease', '--force-with-lease=refs/heads/main', '--force-with-lease=refs/heads/main:HEAD']) {
      await expect(explicitPushArguments([option], f.read)).rejects.toThrow('explicit destination and expected object ID');
    }
  });

  it('uses custom fetch mappings and protects missing tracking references as absent destinations', async () => {
    const f = fixture([
      ['remote.review.url', '/review.git'],
      ['remote.review.fetch', '+refs/heads/*:refs/tracking/review/*'],
      ['branch.main.pushremote', 'review'],
    ]);
    f.refs.set('refs/tracking/review/main', old);
    expect(await f.prepare()).toEqual(['push', '--no-follow-tags', lease(), 'review', 'refs/heads/main:refs/heads/main']);
    expect(await f.prepare(['--force-with-lease', '-u', 'review', 'HEAD:refs/heads/new'])).toEqual([
      'push',
      '-u',
      '--no-follow-tags',
      lease('refs/heads/new', ''),
      'review',
      'HEAD:refs/heads/new',
    ]);
  });

  it('preserves explicit expectations, including absent destinations and SHA-256 object IDs', async () => {
    const f = fixture();
    for (const oid of ['', 'c'.repeat(64)]) {
      const option = lease('refs/heads/main', oid);
      expect(await f.prepare([option])).toContain(option);
    }
    expect(await f.prepare([lease('refs/heads/main', next), '--force-with-lease'])).toContain(lease('refs/heads/main', next));
    expect(await f.prepare(['--force-with-lease=main'])).toContain(lease());
    expect(await f.prepare(['--force-with-lease', 'origin', 'HEAD:review'])).toContain('HEAD:refs/heads/review');
  });

  it('pins every configured destination and prevents new wildcard sources from escaping the snapshot', async () => {
    const f = fixture([
      ['remote.origin.push', '+refs/heads/*:refs/heads/*'],
      ['remote.origin.push', 'refs/tags/*:refs/tags/*'],
    ]);
    f.refs.set('refs/heads/feature', next);
    f.refs.set('refs/remotes/origin/feature', old);
    f.refs.set('refs/tags/v1', next);
    const prepared = await f.prepare();
    expect(prepared).toEqual(expect.arrayContaining([lease(), lease('refs/heads/feature'), lease('refs/tags/v1', '')]));
    expect(await explicitPushArguments(prepared.slice(1), f.read)).toEqual(expect.arrayContaining([lease(), lease('refs/heads/feature')]));
    f.refs.set('refs/heads/unreviewed', next);
    await expect(explicitPushArguments(prepared.slice(1), f.read)).rejects.toThrow('references changed after preparation');
  });

  it('preserves matching pushes without creating additional remote branches', async () => {
    const f = fixture([['push.default', 'matching']]);
    f.refs.set('refs/heads/local-only', next);
    const prepared = await f.prepare();
    expect(prepared).toEqual(['push', '--no-follow-tags', lease(), lease('refs/heads/local-only', ''), 'origin', ':']);
    expect(await explicitPushArguments(prepared.slice(1), f.read)).toContain(':');
  });

  it('freezes configured follow-tags and protects tags throughout delayed approvals', async () => {
    const f = fixture([['push.followtags', 'true']]);
    f.refs.set('refs/tags/v1', next);
    const prepared = await f.prepare();
    expect(prepared).toEqual(expect.arrayContaining(['--follow-tags', lease('refs/tags/v1', '')]));
    f.refs.set('refs/tags/new', next);
    await expect(explicitPushArguments(prepared.slice(1), f.read)).rejects.toThrow('references changed after preparation');
  });
});
