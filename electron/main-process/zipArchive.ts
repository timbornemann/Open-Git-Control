import * as fs from 'fs';
import { once } from 'events';
import { finished } from 'stream/promises';

export type ZipArchiveEntry = {
  sourcePath: string | null;
  archivePath: string;
  kind: 'file' | 'directory';
  modifiedAt: Date;
};

type CentralDirectoryEntry = {
  name: Buffer;
  flags: number;
  crc: number;
  size: number;
  offset: number;
  dosDate: number;
  dosTime: number;
  directory: boolean;
};

const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
const UTF8_FLAG = 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

const updateCrc32 = (crc: number, chunk: Buffer): number => {
  let next = crc;
  for (const byte of chunk) next = crcTable[(next ^ byte) & 0xff] ^ (next >>> 8);
  return next >>> 0;
};

const toDosDateTime = (value: Date): { date: number; time: number } => {
  const year = Math.max(1980, value.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
  };
};

const localHeader = (name: Buffer, flags: number, dosDate: number, dosTime: number): Buffer => {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(flags, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt16LE(name.length, 26);
  return header;
};

const dataDescriptor = (crc: number, size: number): Buffer => {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(size, 8);
  descriptor.writeUInt32LE(size, 12);
  return descriptor;
};

const centralHeader = (entry: CentralDirectoryEntry): Buffer => {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt32LE(((entry.directory ? 0o40755 : 0o100644) << 16) >>> 0, 38);
  header.writeUInt32LE(entry.offset, 42);
  return header;
};

const endOfCentralDirectory = (entryCount: number, centralSize: number, centralOffset: number): Buffer => {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  return footer;
};

const normalizeArchivePath = (value: string, directory: boolean): string => {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Archive entry path is invalid.');
  }
  return directory && !normalized.endsWith('/') ? `${normalized}/` : normalized;
};

export async function createZipArchive(targetPath: string, entries: ZipArchiveEntry[]): Promise<void> {
  if (entries.length === 0) throw new Error('At least one archive entry is required.');
  if (entries.length > MAX_UINT16) throw new Error('The selection contains too many files for a ZIP archive.');

  const stream = fs.createWriteStream(targetPath, { flags: 'wx' });
  let written = 0;
  const centralEntries: CentralDirectoryEntry[] = [];
  const seenNames = new Set<string>();
  const write = async (buffer: Buffer): Promise<void> => {
    if (written + buffer.length > MAX_UINT32) throw new Error('The ZIP archive exceeds the 4 GB limit.');
    if (!stream.write(buffer)) await once(stream, 'drain');
    written += buffer.length;
  };

  try {
    for (const entry of entries) {
      const archivePath = normalizeArchivePath(entry.archivePath, entry.kind === 'directory');
      if (seenNames.has(archivePath)) throw new Error(`Archive entry "${archivePath}" appears more than once.`);
      seenNames.add(archivePath);
      const name = Buffer.from(archivePath, 'utf8');
      if (name.length > MAX_UINT16) throw new Error(`Archive entry "${archivePath}" has a path that is too long.`);
      const { date, time } = toDosDateTime(entry.modifiedAt);
      const offset = written;
      const flags = UTF8_FLAG | (entry.kind === 'file' ? DATA_DESCRIPTOR_FLAG : 0);
      await write(localHeader(name, flags, date, time));
      await write(name);

      let size = 0;
      let crc = 0;
      if (entry.kind === 'file') {
        if (!entry.sourcePath) throw new Error(`Archive file "${archivePath}" has no source path.`);
        let runningCrc = MAX_UINT32;
        for await (const value of fs.createReadStream(entry.sourcePath)) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          size += chunk.length;
          if (size > MAX_UINT32) throw new Error(`Archive entry "${archivePath}" exceeds the 4 GB limit.`);
          runningCrc = updateCrc32(runningCrc, chunk);
          await write(chunk);
        }
        crc = (runningCrc ^ MAX_UINT32) >>> 0;
        await write(dataDescriptor(crc, size));
      }
      centralEntries.push({ name, flags, crc, size, offset, dosDate: date, dosTime: time, directory: entry.kind === 'directory' });
    }

    const centralOffset = written;
    for (const entry of centralEntries) {
      await write(centralHeader(entry));
      await write(entry.name);
    }
    const centralSize = written - centralOffset;
    await write(endOfCentralDirectory(centralEntries.length, centralSize, centralOffset));
    stream.end();
    await finished(stream);
  } catch (error) {
    stream.destroy();
    try {
      await finished(stream);
    } catch {
      // Preserve the original archive error.
    }
    throw error;
  }
}
