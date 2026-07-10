/**
 * Byte-encoding detection and lossless round-tripping for files edited through
 * the inline conflict editor.
 *
 * The conflict editor reads a file into a JavaScript string, lets the user edit
 * it, and writes it back. Doing that unconditionally as UTF-8 corrupts any file
 * that is not UTF-8 (UTF-16, Latin-1, or invalid/binary bytes) the moment it is
 * saved — even when the content was not changed. These helpers detect the
 * original encoding so an unchanged save reproduces the original bytes, and so
 * genuinely binary files are refused instead of being mangled.
 */

export type RepositoryTextEncoding = 'utf8' | 'utf8-bom' | 'utf16le' | 'utf16be' | 'latin1';

export type RepositoryFileEncoding = RepositoryTextEncoding | 'binary';

export type DecodedRepositoryFile = {
  encoding: RepositoryTextEncoding;
  text: string;
};

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

const hasPrefix = (buffer: Buffer, prefix: number[]): boolean => {
  if (buffer.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (buffer[index] !== prefix[index]) return false;
  }
  return true;
};

const isValidUtf8 = (buffer: Buffer): boolean => {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
};

/**
 * Determines how a file's bytes should be interpreted. `binary` means the file
 * must not be treated as editable text.
 */
export function detectRepositoryFileEncoding(buffer: Buffer): RepositoryFileEncoding {
  if (hasPrefix(buffer, UTF8_BOM)) return 'utf8-bom';
  if (hasPrefix(buffer, UTF16LE_BOM)) return 'utf16le';
  if (hasPrefix(buffer, UTF16BE_BOM)) return 'utf16be';

  // A NUL byte in a stream that is not BOM-tagged UTF-16 indicates binary data
  // (or an unlabelled wide encoding we cannot round-trip safely).
  if (buffer.includes(0x00)) return 'binary';

  if (isValidUtf8(buffer)) return 'utf8';

  // Not valid UTF-8 and no NUL bytes: fall back to Latin-1, which maps every
  // byte 1:1 to U+00xx and therefore round-trips losslessly.
  return 'latin1';
}

const decodeUtf16be = (body: Buffer): string => {
  if (body.length % 2 !== 0) {
    throw new Error('This file appears to be binary and cannot be edited as text.');
  }
  const swapped = Buffer.from(body);
  swapped.swap16();
  return swapped.toString('utf16le');
};

/**
 * Decodes a file to text, remembering the encoding so it can be re-encoded
 * losslessly later. Throws for binary content.
 */
export function decodeRepositoryFile(buffer: Buffer): DecodedRepositoryFile {
  const encoding = detectRepositoryFileEncoding(buffer);
  switch (encoding) {
    case 'binary':
      throw new Error('This file appears to be binary and cannot be edited as text.');
    case 'utf8-bom':
      return { encoding, text: buffer.subarray(UTF8_BOM.length).toString('utf8') };
    case 'utf16le':
      return { encoding, text: buffer.subarray(UTF16LE_BOM.length).toString('utf16le') };
    case 'utf16be':
      return { encoding, text: decodeUtf16be(buffer.subarray(UTF16BE_BOM.length)) };
    case 'latin1':
      return { encoding, text: buffer.toString('latin1') };
    case 'utf8':
    default:
      return { encoding, text: buffer.toString('utf8') };
  }
}

/**
 * Re-encodes edited text using the file's original encoding, restoring any byte
 * order mark so an unchanged save reproduces the original bytes.
 */
export function encodeRepositoryFile(text: string, encoding: RepositoryTextEncoding): Buffer {
  switch (encoding) {
    case 'utf8-bom':
      return Buffer.concat([Buffer.from(UTF8_BOM), Buffer.from(text, 'utf8')]);
    case 'utf16le':
      return Buffer.concat([Buffer.from(UTF16LE_BOM), Buffer.from(text, 'utf16le')]);
    case 'utf16be': {
      const body = Buffer.from(text, 'utf16le');
      body.swap16();
      return Buffer.concat([Buffer.from(UTF16BE_BOM), body]);
    }
    case 'latin1':
      return Buffer.from(text, 'latin1');
    case 'utf8':
    default:
      return Buffer.from(text, 'utf8');
  }
}
