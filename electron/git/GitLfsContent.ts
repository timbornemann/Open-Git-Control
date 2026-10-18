import { createHash } from 'node:crypto';
import { parseGitLfsPointer, type GitLfsPointer } from '../../src/shared/ipc/gitLfs';
import { detectRepositoryFileEncoding } from './RepositoryFileEncoding';
import { readRepositoryFileBytes } from './RepositoryFileRead';
import { LFS_SAMPLE_BYTES } from './GitLfsRules';

/** Retain classifications and a content digest, never thousands of 64 KiB buffers. */
export type LfsContent = { bytes: number; hash: string; binary: boolean; pointer: GitLfsPointer | null };
export type LfsWorkingContent = { content: LfsContent; mode: number; version: number[] };
export function summarizeLfsContent(bytes: number, sample: Buffer): LfsContent {
  return {
    bytes,
    hash: createHash('sha256').update(sample).digest('hex'),
    binary: detectRepositoryFileEncoding(sample) === 'binary',
    pointer: bytes <= 1024 ? parseGitLfsPointer(sample.toString()) : null,
  };
}
export async function readLfsWorkingContent(filePath: string): Promise<LfsWorkingContent> {
  const { data, stat } = await readRepositoryFileBytes(filePath, LFS_SAMPLE_BYTES, true);
  if (data.length !== Math.min(stat.size, LFS_SAMPLE_BYTES)) throw new Error('The file changed while reading its content sample.');
  return { content: summarizeLfsContent(stat.size, data), mode: stat.mode, version: [stat.size, stat.mode, stat.mtimeMs, stat.ctimeMs, stat.ino] };
}
