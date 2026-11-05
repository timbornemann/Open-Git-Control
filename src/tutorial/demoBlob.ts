import type { TextFileEncodingDto } from '@/shared/ipc/contracts/git';

/** UTF-8 examples remain strings; explicit encodings travel with every Git copy. */
export type DemoGitlink = { gitlink: string };
export type DemoBlob = string | { text: string; encoding: TextFileEncodingDto } | DemoGitlink;
export const isDemoGitlink = (blob?: DemoBlob): blob is DemoGitlink => typeof blob === 'object' && 'gitlink' in blob;
export type DemoFiles = Record<string, DemoBlob>;
export const getDemoBlob = (files: DemoFiles, path: string): DemoBlob | undefined =>
  Object.prototype.hasOwnProperty.call(files, path) ? files[path] : undefined;
export const setDemoBlob = (files: DemoFiles, path: string, value: DemoBlob) =>
  Object.defineProperty(files, path, { value, enumerable: true, configurable: true, writable: true });
export const demoBlob = (text: string, encoding: TextFileEncodingDto = 'utf8'): DemoBlob => (encoding === 'utf8' ? text : { text, encoding });

export function demoBlobBytes(blob: DemoBlob): Uint8Array {
  if (isDemoGitlink(blob))
    throw new Error('Ein Submodul ist ein eigenes Repository, keine Textdatei. / A submodule is a separate repository, not a text file.');
  const { text, encoding } = typeof blob === 'string' ? { text: blob, encoding: 'utf8' } : blob;
  if (!['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'latin1'].includes(encoding)) throw new Error('Unsupported text encoding.');
  if (encoding === 'latin1') {
    if ([...text].some((character) => character.codePointAt(0)! > 255))
      throw new Error('Latin-1 cannot represent every character. / Latin-1 kann nicht alle Zeichen darstellen.');
    return Uint8Array.from(text, (character) => character.charCodeAt(0));
  }
  if (encoding === 'utf16le' || encoding === 'utf16be') {
    const bytes = new Uint8Array(text.length * 2 + 2);
    const view = new DataView(bytes.buffer),
      little = encoding === 'utf16le';
    view.setUint16(0, 0xfeff, little);
    for (let i = 0; i < text.length; i++) view.setUint16(2 + i * 2, text.charCodeAt(i), little);
    return bytes;
  }
  const bytes = new TextEncoder().encode(text);
  if (encoding !== 'utf8-bom') return bytes;
  const marked = new Uint8Array(bytes.length + 3);
  marked.set([0xef, 0xbb, 0xbf]);
  marked.set(bytes, 3);
  return marked;
}
export function readDemoBlob(blob: DemoBlob) {
  const bytes = demoBlobBytes(blob);
  let encoding: TextFileEncodingDto = 'utf8',
    text: string;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = 'utf8-bom';
    text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(3));
  } else if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    encoding = bytes[0] === 0xff ? 'utf16le' : 'utf16be';
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    text = Array.from({ length: (bytes.length - 2) / 2 }, (_, index) => String.fromCharCode(view.getUint16(index * 2 + 2, encoding === 'utf16le'))).join('');
  } else {
    if (bytes.includes(0)) return { bytes, encoding: 'binary' as const };
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      if (bytes.filter((byte) => (byte < 32 && ![9, 10, 12, 13].includes(byte)) || byte === 127).length / bytes.length >= 0.01)
        return { bytes, encoding: 'binary' as const };
      encoding = 'latin1';
      text = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    }
  }
  return { bytes, encoding, text };
}
export const demoBlobText = (blob?: DemoBlob) => (blob === undefined || isDemoGitlink(blob) ? undefined : readDemoBlob(blob).text);
export const demoBlobKey = (blob?: DemoBlob) =>
  blob === undefined ? undefined : isDemoGitlink(blob) ? 'gitlink:' + blob.gitlink : Array.from(demoBlobBytes(blob)).join(',');
export const sameDemoBlob = (left?: DemoBlob, right?: DemoBlob) => demoBlobKey(left) === demoBlobKey(right);
export const demoGitText = (blob?: DemoBlob) =>
  isDemoGitlink(blob)
    ? 'Subproject commit ' + blob.gitlink + '\n'
    : blob === undefined
      ? undefined
      : new TextDecoder('utf-8', { ignoreBOM: true }).decode(demoBlobBytes(blob));
