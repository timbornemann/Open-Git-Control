const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function readBytes(file, offset, length) {
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    if (fs.readSync(descriptor, buffer, 0, length, offset) !== length) throw new Error('Truncated release artifact.');
    return buffer;
  } finally {
    fs.closeSync(descriptor);
  }
}

function validateArtifactFormat(file, size) {
  const header = readBytes(file, 0, Math.min(size, 64));
  let valid = false;
  if (file.endsWith('.exe') && size >= 64 && header.subarray(0, 2).toString('ascii') === 'MZ') {
    const offset = header.readUInt32LE(60);
    if (offset >= 64 && offset + 6 <= size) {
      const pe = readBytes(file, offset, 6);
      // NSIS uses an x86 bootstrap executable even when its application payload is x64.
      valid = pe.subarray(0, 4).equals(Buffer.from([0x50, 0x45, 0, 0])) && [0x014c, 0x8664].includes(pe.readUInt16LE(4));
    }
  } else if (file.endsWith('.AppImage') && size >= 64) {
    valid = header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) && header[4] === 2 && header[5] === 1 && header.readUInt16LE(18) === 62;
  } else if (file.endsWith('.deb')) {
    valid = header.subarray(0, 8).toString('ascii') === '!<arch>\n';
  } else if (file.endsWith('.dmg') && size >= 512) {
    valid = readBytes(file, size - 512, 4).toString('ascii') === 'koly';
  } else if (file.endsWith('.zip') && size >= 22 && header.readUInt32LE(0) === 0x04034b50) {
    const tail = readBytes(file, Math.max(0, size - 65_557), Math.min(size, 65_557));
    for (let offset = tail.length - 22; offset >= 0; offset--) {
      if (tail.readUInt32LE(offset) !== 0x06054b50 || offset + 22 + tail.readUInt16LE(offset + 20) !== tail.length) continue;
      const entries = tail.readUInt16LE(offset + 10);
      const centralSize = tail.readUInt32LE(offset + 12);
      const centralOffset = tail.readUInt32LE(offset + 16);
      valid =
        entries > 0 &&
        centralSize > 0 &&
        centralOffset + centralSize <= size - (tail.length - offset) &&
        readBytes(file, centralOffset, 4).readUInt32LE(0) === 0x02014b50;
      break;
    }
  }
  if (!valid) throw new Error(`Invalid installer or archive format: ${path.basename(file)}`);
}

function validateBlockmap(compressed, expectedSize, embedded = false) {
  let map;
  try {
    const content = embedded
      ? zlib.inflateRawSync(compressed, { maxOutputLength: 16 * 1024 * 1024 })
      : zlib.gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
    map = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error('Invalid compressed release blockmap.');
  }
  if (map?.version !== '2' || !Array.isArray(map.files) || map.files.length !== 1) throw new Error('Invalid release blockmap structure.');
  const file = map.files[0];
  if (
    file.name !== 'file' ||
    file.offset !== 0 ||
    !Array.isArray(file.sizes) ||
    !Array.isArray(file.checksums) ||
    !file.sizes.length ||
    file.sizes.length !== file.checksums.length
  )
    throw new Error('Invalid release blockmap entries.');
  if (
    !file.sizes.every((size) => Number.isSafeInteger(size) && size > 0) ||
    !file.checksums.every((value) => typeof value === 'string' && /^[A-Za-z0-9+/]{24}$/.test(value)) ||
    file.sizes.reduce((sum, size) => sum + size, 0) !== expectedSize
  )
    throw new Error('Release blockmap does not match artifact size.');
}

function validateEmbeddedBlockmap(file, size, blockMapSize) {
  if (
    !Number.isSafeInteger(blockMapSize) ||
    blockMapSize <= 0 ||
    blockMapSize > 4 * 1024 * 1024 ||
    blockMapSize >= size - 4 ||
    readBytes(file, size - 4, 4).readUInt32BE(0) !== blockMapSize
  )
    throw new Error('Invalid embedded blockmap size.');
  validateBlockmap(readBytes(file, size - blockMapSize - 4, blockMapSize), size - blockMapSize - 4, true);
}

module.exports = { validateArtifactFormat, validateBlockmap, validateEmbeddedBlockmap };
