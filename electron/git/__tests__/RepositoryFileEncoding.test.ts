import { describe, expect, it } from 'vitest';
import { decodeRepositoryFile, detectRepositoryFileEncoding, encodeRepositoryFile } from '../RepositoryFileEncoding';

const roundTrip = (buffer: Buffer): Buffer => {
  const decoded = decodeRepositoryFile(buffer);
  return encodeRepositoryFile(decoded.text, decoded.encoding);
};

describe('RepositoryFileEncoding', () => {
  it('round-trips plain UTF-8 without altering the bytes', () => {
    const buffer = Buffer.from('line one\nzweite Zeile: äöü\n', 'utf8');
    expect(detectRepositoryFileEncoding(buffer)).toBe('utf8');
    expect(roundTrip(buffer).equals(buffer)).toBe(true);
  });

  it('round-trips UTF-8 with a BOM, preserving the BOM', () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello äöü', 'utf8')]);
    expect(detectRepositoryFileEncoding(buffer)).toBe('utf8-bom');
    expect(roundTrip(buffer).equals(buffer)).toBe(true);
  });

  it('round-trips UTF-16LE, preserving the BOM and byte order', () => {
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('conflict <<<< äöü', 'utf16le')]);
    expect(detectRepositoryFileEncoding(buffer)).toBe('utf16le');
    expect(roundTrip(buffer).equals(buffer)).toBe(true);
  });

  it('round-trips UTF-16BE, preserving the BOM and byte order', () => {
    const le = Buffer.from('big endian', 'utf16le');
    const be = Buffer.from(le);
    be.swap16();
    const buffer = Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
    expect(detectRepositoryFileEncoding(buffer)).toBe('utf16be');
    expect(roundTrip(buffer).equals(buffer)).toBe(true);
  });

  it('round-trips Latin-1 (invalid UTF-8) losslessly', () => {
    // 0xE9 alone is not valid UTF-8; it must be preserved, not replaced.
    const buffer = Buffer.from([0x63, 0x61, 0x66, 0xe9]); // "café" in Latin-1
    expect(detectRepositoryFileEncoding(buffer)).toBe('latin1');
    expect(roundTrip(buffer).equals(buffer)).toBe(true);
  });

  it('refuses to decode binary content instead of corrupting it', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]);
    expect(detectRepositoryFileEncoding(buffer)).toBe('binary');
    expect(() => decodeRepositoryFile(buffer)).toThrow(/binary/i);
  });
});
