import { describe, expect, it, vi } from 'vitest';
import { explicitPushArguments } from '../GitPushArguments';

const base: Array<[string, string]> = [
  ['remote.origin.url', '/server.git'],
  ['branch.main.remote', 'origin'],
  ['branch.main.merge', 'refs/heads/main'],
];
function fixture(config = base, branch = 'main') {
  const read = vi.fn(async (args: string[]) => {
    if (args.includes('--type=bool')) return config.find(([key]) => key === 'push.autosetupremote')?.[1] ?? 'false';
    if (args[0] === 'config') return config.map(([key, value]) => `${key}\n${value}\0`).join('');
    if (args[0] === 'symbolic-ref') return branch ? `refs/heads/${branch}` : '';
    if (args[0] === 'rev-parse') {
      const source = args.at(-1)!;
      if (source === 'HEAD') return branch ? `refs/heads/${branch}` : '';
      return source.startsWith('refs/') ? source : `refs/heads/${source}`;
    }
    throw new Error('Unexpected query.');
  });
  return { read, resolve: (args: string[]) => explicitPushArguments(args, read) };
}

describe('explicit push arguments', () => {
  it.each(['simple', 'current', 'upstream', 'tracking'])('keeps push.default=%s on the tracked branch', async (mode) => {
    expect(await fixture([...base, ['push.default', mode]]).resolve([])).toEqual([
      'push',
      '--no-mirror',
      '--no-force',
      '--',
      'origin',
      'refs/heads/main:refs/heads/main',
    ]);
  });

  it('preserves a differently named upstream and rejects a mismatched simple push', async () => {
    const config = base.map(([key, value]) => [key, key.endsWith('.merge') ? 'refs/heads/upstream' : value] as [string, string]);
    expect(await fixture([...config, ['push.default', 'upstream']]).resolve([])).toContain('refs/heads/main:refs/heads/upstream');
    await expect(fixture(config).resolve([])).rejects.toThrow('does not match');
    expect(await fixture([...config, ['push.default', 'current']]).resolve([])).toContain('refs/heads/main:refs/heads/main');
  });

  it('honors pushRemote, pushDefault and triangular pushes without depending on refspec defaults', async () => {
    const config: Array<[string, string]> = [...base, ['remote.review.url', '/review.git'], ['remote.pushdefault', 'review']];
    expect(await fixture(config).resolve([])).toEqual(expect.arrayContaining(['review', 'refs/heads/main:refs/heads/main']));
    expect(await fixture([...config, ['branch.main.pushremote', 'origin']]).resolve([])).toContain('origin');
    expect(await fixture(config).resolve(['origin', 'HEAD'])).toEqual(expect.arrayContaining(['origin', 'HEAD:refs/heads/main']));
    await expect(fixture([...config, ['push.default', 'upstream']]).resolve([])).rejects.toThrow('not the upstream remote');
  });

  it('preserves matching pushes using an explicit matching refspec', async () => {
    expect(await fixture([...base, ['push.default', 'matching']]).resolve([])).toEqual(['push', '--no-mirror', '--no-force', '--', 'origin', ':']);
    expect(await fixture([...base, ['remote.origin.push', ':']]).resolve([])).toEqual(['push', '--no-mirror', '--no-force', '--', 'origin', ':']);
    expect(await fixture([...base, ['remote.origin.push', '+:']]).resolve([])).toEqual(['push', '--no-mirror', '--no-force', '--', 'origin', ':']);
  });

  it('resolves every configured mapping explicitly and strips inherited force', async () => {
    const config: Array<[string, string]> = [
      ...base,
      ['remote.origin.push', '+refs/heads/main:refs/heads/review'],
      ['remote.origin.push', '+refs/tags/*:refs/tags/*'],
    ];
    expect(await fixture(config).resolve(['origin'])).toEqual([
      'push',
      '--no-mirror',
      '--no-force',
      '--',
      'origin',
      'refs/heads/main:refs/heads/review',
      'refs/tags/*:refs/tags/*',
    ]);
    expect(await fixture(config).resolve(['origin', 'main'])).toContain('main:refs/heads/review');
    expect(await fixture(config).resolve(['origin', 'HEAD'])).toContain('HEAD:refs/heads/main');
    expect(await fixture([...base, ['remote.origin.push', '+refs/heads/*:refs/heads/review/*']]).resolve(['origin', 'main'])).toContain(
      'main:refs/heads/review/main',
    );
  });

  it('blocks implicit configured deletions while an explicit mapping bypasses them', async () => {
    const f = fixture([...base, ['remote.origin.push', ':refs/heads/main']]);
    await expect(f.resolve([])).rejects.toThrow('Deletion');
    expect(await f.resolve(['origin', 'HEAD:refs/heads/main'])).toContain('HEAD:refs/heads/main');
    expect(await f.resolve(['--tags'])).toContain('refs/tags/*:refs/tags/*');
  });

  it('never forwards + to Git or changes the target of a leased source-only force refspec', async () => {
    const config: Array<[string, string]> = [...base, ['remote.origin.push', '+refs/heads/main:refs/heads/review']];
    expect(await fixture(config).resolve(['--force-with-lease', 'origin', '+main'])).toEqual([
      'push',
      '--no-mirror',
      '--no-force',
      '--force-with-lease',
      '--',
      'origin',
      'main:refs/heads/main',
    ]);
    expect(await fixture([...base, ['push.default', 'upstream'], ['remote.origin.push', 'main']]).resolve([])).toContain('main:refs/heads/main');
  });

  it('keeps missing-upstream, detached HEAD and push.default=nothing failures', async () => {
    await expect(fixture([['remote.origin.url', '/server.git']]).resolve([])).rejects.toThrow('has no upstream branch');
    await expect(fixture(base, '').resolve([])).rejects.toThrow('not currently on a branch');
    await expect(fixture(base, '').resolve(['origin', 'HEAD'])).rejects.toThrow('explicit destination');
    await expect(fixture([...base, ['push.default', 'nothing']]).resolve([])).rejects.toThrow('push.default is nothing');
  });

  it('honors automatic upstream setup and a sole remote with its case-sensitive name', async () => {
    const config: Array<[string, string]> = [
      ['remote.Review.url', '/server.git'],
      ['push.autosetupremote', 'true'],
    ];
    expect(await fixture(config).resolve([])).toEqual([
      'push',
      '--no-mirror',
      '--no-force',
      '--set-upstream',
      '--',
      'Review',
      'refs/heads/main:refs/heads/main',
    ]);
  });
});
