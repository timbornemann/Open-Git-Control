import { describe, expect, it } from 'vitest';
import { encodeRepositoryFile, decodeRepositoryFile, type RepositoryTextEncoding } from '../../electron/git/RepositoryFileEncoding';
import { demoBlob, demoBlobBytes, readDemoBlob, sameDemoBlob } from './demoBlob';

describe('tutorial bytes match native file encoding', () => {
  const encodings: RepositoryTextEncoding[] = ['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'latin1'];
  for (const encoding of encodings) {
    it(`matches ${encoding} bytes, detection, Unicode and line endings`, () => {
      for (const text of ['', 'ASCII\n', 'Café\r\n  OGC\tTutor\r\n', '\ufeffCafé\n', ...(encoding === 'latin1' ? [] : ['A\ud800B \ud83d\ude80\n'])]) {
        if (encoding === 'latin1' && text.includes('\ufeff')) continue;
        const native = encodeRepositoryFile(text, encoding),
          blob = demoBlob(text, encoding);
        expect(Buffer.from(demoBlobBytes(blob))).toEqual(native);
        expect(readDemoBlob(blob)).toMatchObject(decodeRepositoryFile(native));
      }
    });
  }
  it('compares actual bytes across equivalent objects and rejects lossy Latin-1 writes', () => {
    expect(sameDemoBlob('ASCII', demoBlob('ASCII', 'latin1'))).toBe(true);
    expect(sameDemoBlob('Café', demoBlob('Café', 'latin1'))).toBe(false);
    expect(sameDemoBlob('text', demoBlob('text', 'utf8-bom'))).toBe(false);
    expect(() => demoBlobBytes(demoBlob('🚀', 'latin1'))).toThrow('Latin-1');
    expect(readDemoBlob('binary\0file').encoding).toBe('binary');
  });
});
