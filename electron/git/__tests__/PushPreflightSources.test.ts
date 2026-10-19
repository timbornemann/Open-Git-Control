import { describe, expect } from 'vitest';
import { inventoryTest } from './lfsInventoryFixture';
import { pushPreflightSources } from '../PushPreflightSources';

describe('local sources for idle push preparation', () => {
  inventoryTest('includes another local branch and an annotated selected tag without excluding other remotes', async (f) => {
    const tagged = await f.commit({ tagged: 'version\n' });
    await f.git('tag', '-a', 'selected', '-m', 'Selected release');
    await f.git('checkout', '-b', 'other', f.base);
    const other = await f.commit({ other: 'other branch\n' });
    const sources = await pushPreflightSources(
      f.repo,
      f.runner,
      {
        profiles: [{ id: 'release', name: 'Release', remoteNames: ['origin'], tagNames: ['selected'] }],
        activeProfileId: 'release',
      },
      f.lifecycle.signal,
    );
    expect(sources[0]).toBe(tagged);
    expect(new Set(sources)).toEqual(new Set([tagged, other]));
  });
});
