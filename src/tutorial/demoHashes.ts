export type DemoHashes = { sha256: string; sha1: string; md5: string };
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const constants = Array.from({ length: 64 }, (_, index) => Math.floor(2 ** 32 * Math.abs(Math.sin(index + 1))));
const rotations = [
  [7, 12, 17, 22],
  [5, 9, 14, 20],
  [4, 11, 16, 23],
  [6, 10, 15, 21],
];

/** Byte-oriented MD5 rounds from https://www.rfc-editor.org/rfc/rfc1321.html. */
export function demoMd5(input: Uint8Array): string {
  const data = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  data.set(input);
  data[input.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, input.length * 8, true);
  view.setUint32(data.length - 4, Math.floor(input.length / 0x20000000), true);
  const hash = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let offset = 0; offset < data.length; offset += 64) {
    let [a, b, c, d] = hash;
    for (let index = 0; index < 64; index++) {
      let f: number, word: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        word = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        word = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        word = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        word = (7 * index) % 16;
      }
      const value = (a + f + constants[index] + view.getUint32(offset + word * 4, true)) | 0;
      const shift = rotations[index >>> 4][index % 4];
      const next = (b + ((value << shift) | (value >>> (32 - shift)))) | 0;
      a = d;
      d = c;
      c = b;
      b = next;
    }
    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
  }
  const result = new Uint8Array(16),
    output = new DataView(result.buffer);
  hash.forEach((word, index) => output.setUint32(index * 4, word, true));
  return hex(result);
}

/** No native bridge or network: SHA uses Web Crypto, MD5 uses the private implementation. */
export async function demoFileHashes(bytes: Uint8Array): Promise<DemoHashes> {
  if (!globalThis.crypto?.subtle) throw new Error('Die lokale Hashberechnung ist nicht verfügbar. / Local hashing is unavailable.');
  const digest = async (algorithm: string) => hex(new Uint8Array(await globalThis.crypto.subtle.digest(algorithm, Uint8Array.from(bytes))));
  const [sha256, sha1] = await Promise.all([digest('SHA-256'), digest('SHA-1')]);
  return { sha256, sha1, md5: demoMd5(bytes) };
}
