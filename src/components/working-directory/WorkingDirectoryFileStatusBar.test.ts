import { describe, expect, it } from 'vitest';
import { getEncodedTextByteLength } from './WorkingDirectoryFileStatusBar';

describe('working-directory file status byte size', () => {
  it('accounts for encoding markers and target line endings', () => {
    expect(getEncodedTextByteLength('ä\n', 'utf8', '\n')).toBe(3);
    expect(getEncodedTextByteLength('ä\n', 'utf8-bom', '\n')).toBe(6);
    expect(getEncodedTextByteLength('ä\n', 'utf16le', '\r\n')).toBe(8);
    expect(getEncodedTextByteLength('ä\n', 'latin1', '\r\n')).toBe(3);
  });
});
