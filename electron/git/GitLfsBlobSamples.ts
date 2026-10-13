import type { LfsReader } from './GitLfsInspection';
import { LFS_SAMPLE_BYTES } from './GitLfsRules';

type Sample = { bytes: number; sample: Buffer };

/** Inspect small staged blobs in batches rather than starting Git for each file. */
export async function readStagedLfsSamples(repoPath: string, objects: string[], git: LfsReader): Promise<Map<string, Sample>> {
  const result = new Map<string, Sample>();
  const unique = [...new Set(objects)];
  for (let offset = 0; offset < unique.length; offset += 256) {
    const group = unique.slice(offset, offset + 256);
    const metadata = await git.input(repoPath, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], `${group.join('\n')}\n`);
    for (const line of metadata.trim().split('\n')) {
      const match = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(line);
      if (!match) continue; // Missing/non-blob entries are reported per file.
      const bytes = Number(match[2]);
      if (!Number.isSafeInteger(bytes) || bytes < 0 || !group.includes(match[1])) throw new Error('Invalid Git LFS object metadata.');
      result.set(match[1], { bytes, sample: Buffer.alloc(0) });
    }
    const small = group.filter((oid) => (result.get(oid)?.bytes ?? Infinity) <= 1024);
    if (small.length) {
      const data = await git.prefix(repoPath, ['cat-file', '--batch'], small.length * 1200, `${small.join('\n')}\n`);
      let position = 0;
      for (const oid of small) {
        const end = data.indexOf(10, position);
        const match = end >= 0 ? /^([a-f0-9]{40,64}) blob (\d+)$/.exec(data.subarray(position, end).toString()) : null;
        const entry = result.get(oid)!;
        if (!match || match[1] !== oid || Number(match[2]) !== entry.bytes || data[end + 1 + entry.bytes] !== 10) {
          throw new Error('Invalid Git LFS blob response.');
        }
        entry.sample = data.subarray(end + 1, end + 1 + entry.bytes);
        position = end + 1 + entry.bytes + 1;
      }
      if (position !== data.length) throw new Error('Invalid Git LFS batch response.');
    }
    for (const oid of group) {
      const entry = result.get(oid);
      if (entry && entry.bytes >= 10 * 1024 * 1024) entry.sample = await git.prefix(repoPath, ['cat-file', 'blob', oid], LFS_SAMPLE_BYTES);
    }
  }
  return result;
}
