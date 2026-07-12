import { describe, expect, it } from 'vitest';
import { addFindingPathsToSecretScanAllowlistText } from './secretScanAllowlist';

describe('addFindingPathsToSecretScanAllowlistText', () => {
  it('adds every affected path once without storing the detected secret', () => {
    const result = addFindingPathsToSecretScanAllowlistText('path:config.env', [
      { filePath: 'config.env' },
      { filePath: 'data.ini' },
      { filePath: 'data.ini' },
    ]);

    expect(result.addedPaths).toEqual(['data.ini']);
    expect(result.allowlistText).toBe('path:config.env\npath:data.ini');
  });

  it('skips paths that cannot safely be represented by the line-based format', () => {
    const result = addFindingPathsToSecretScanAllowlistText('', [{ filePath: 'valid.conf' }, { filePath: 'invalid\npath.ini' }, { filePath: '' }]);

    expect(result.addedPaths).toEqual(['valid.conf']);
    expect(result.allowlistText).toBe('path:valid.conf');
  });
});
