import { describe, expect, it, vi } from 'vitest';
import { completeForcePushDestinations } from '../GitPushDestination';

const oid = 'a'.repeat(40);
function fixture(advertisements: string[][]) {
  const read = vi.fn(async (args: string[]) => {
    if (args[0] === 'remote') return advertisements.map((_, index) => `/push-${index}.git`).join('\n');
    if (args[0] === 'ls-remote') return advertisements[Number(/push-(\d+)/.exec(args.at(-1)!)![1])].map((ref) => `${oid}\t${ref}`).join('\n');
    if (args[0] === 'rev-parse') return 'refs/heads/main';
    throw new Error('Unexpected query.');
  });
  return { read, resolve: (spec: string) => completeForcePushDestinations([spec], 'origin', true, read) };
}

describe('force push destination resolution', () => {
  it('resolves full refs and matching without network access', async () => {
    const f = fixture([]);
    expect(await f.resolve('HEAD:refs/heads/main')).toEqual(['HEAD:refs/heads/main']);
    expect(await f.resolve(':')).toEqual([':']);
    expect(f.read).not.toHaveBeenCalled();
  });

  it('uses the advertised destination at the push URL even when its namespace differs from the source', async () => {
    const f = fixture([['refs/tags/review']]);
    expect(await f.resolve('HEAD:review')).toEqual(['HEAD:refs/tags/review']);
    expect(f.read).toHaveBeenCalledWith(['remote', 'get-url', '--push', '--all', 'origin']);
    expect(f.read).toHaveBeenCalledWith(['ls-remote', '--refs', '--', '/push-0.git']);
    expect(f.read.mock.calls.some(([args]) => args[0] === 'rev-parse')).toBe(false);
  });

  it('retains source namespace inference for new destinations', async () => {
    expect(await fixture([[]]).resolve('HEAD:new')).toEqual(['HEAD:refs/heads/new']);
  });

  it('rejects ambiguous destinations and endpoints with different namespace resolutions', async () => {
    await expect(fixture([['refs/heads/review', 'refs/tags/review']]).resolve('HEAD:review')).rejects.toThrow('ambiguous');
    await expect(fixture([['refs/heads/review'], ['refs/tags/review']]).resolve('HEAD:review')).rejects.toThrow('different destinations');
  });
});
