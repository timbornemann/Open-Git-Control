import { describe, expect, it, vi } from 'vitest';
import { expandPushScanSources } from '../SecretScanPushRefspecs';

describe('prepared push scan sources', () => {
  it('expands only matching wildcard prefixes and suffixes and retains literal sources', async () => {
    const read = vi.fn(async () => 'refs/heads/release/one/stable\nrefs/heads/release/two/dev\nrefs/heads/other/stable');
    expect(await expandPushScanSources(['HEAD', 'refs/heads/release/*/stable'], false, [], read)).toEqual(['HEAD', 'refs/heads/release/one/stable']);
  });

  it('fails the scan when wildcard enumeration fails', async () => {
    await expect(expandPushScanSources(['refs/heads/*'], false, [], vi.fn().mockRejectedValue(new Error('Cannot read refs.')))).rejects.toThrow(
      'Cannot read refs.',
    );
  });
});
