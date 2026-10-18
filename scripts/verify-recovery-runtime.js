const fs = require('node:fs');

/** Reject dependencies that would quietly defeat the standalone Windows build. */
function verifyWindowsRuntime(file) {
  const bytes = fs.readFileSync(file);
  const pe = bytes.readUInt32LE(60);
  if (bytes.subarray(0, 2).toString() !== 'MZ' || bytes.readUInt32LE(pe) !== 0x4550 || bytes.readUInt16LE(pe + 4) !== 0x8664)
    throw new Error('Recovery must be a native x64 PE executable.');
  const optional = pe + 24;
  if (bytes.readUInt16LE(optional) !== 0x20b) throw new Error('Recovery must use the x64 PE format.');
  const table = optional + bytes.readUInt16LE(pe + 20);
  const sections = bytes.readUInt16LE(pe + 6);
  const offset = (rva) => {
    for (let i = 0; i < sections; i++) {
      const at = table + i * 40,
        start = bytes.readUInt32LE(at + 12),
        size = Math.max(bytes.readUInt32LE(at + 8), bytes.readUInt32LE(at + 16));
      if (rva >= start && rva < start + size) return bytes.readUInt32LE(at + 20) + rva - start;
    }
    throw new Error('Recovery has an invalid PE import table.');
  };
  const imports = [];
  const directory = offset(bytes.readUInt32LE(optional + 120));
  for (let i = 0; i < 256; i++) {
    const name = bytes.readUInt32LE(directory + i * 20 + 12);
    if (!name) break;
    const begin = offset(name),
      end = bytes.indexOf(0, begin);
    if (end < begin || end - begin > 256) throw new Error('Invalid recovery import name.');
    const dll = bytes.subarray(begin, end).toString('ascii').toLowerCase();
    imports.push(dll);
    if (/vcruntime|msvcp|msvcr|electron|node|libegl|libgles|swiftshader|vulkan/.test(dll))
      throw new Error(`Recovery unexpectedly depends on ${dll}. Use the static CRT and software renderer.`);
  }
  if (!imports.length) throw new Error('The native recovery import table is missing.');
  return imports;
}
module.exports = { verifyWindowsRuntime };
