import { describe, expect, it, vi } from 'vitest';
import { assertSafeGitRemoteTransport } from '../GitRemoteTransportSafety';
import { remoteUrl } from '../remoteTransferValidation';
import { CloneService } from '../CloneService';

describe('shared Git remote transport policy', () => {
  it.each(['1helper::payload', '::payload', 'helper://host/repo', '1helper://host/repo', 'UNSUPPORTED://host/repo', 'ext::payload'])(
    'rejects helper transport %s in every URL entry point',
    async (url) => {
      expect(() => assertSafeGitRemoteTransport(url)).toThrow();
      expect(() => remoteUrl(url)).toThrow();
      expect(() => remoteUrl(` ${url} `)).toThrow();
      const cloneWithProgress = vi.fn();
      const result = await new CloneService({ cloneWithProgress }).cloneRepo(url, '.', vi.fn());
      expect(result.success).toBe(false);
      expect(cloneWithProgress).not.toHaveBeenCalled();
    },
  );

  it('rejects hidden options and preserves the casing of standard URL schemes', () => {
    expect(() => remoteUrl(' --upload-pack=command ')).toThrow('Invalid Git remote URL');
    expect(() => assertSafeGitRemoteTransport('HTTPS://host/repo')).not.toThrow();
    expect(remoteUrl(' HTTPS://host/repo ')).toBe('HTTPS://host/repo');
  });
});
