import type { GitRunner } from './GitRunner';
import type { GitRunOptions } from './GitProcessTypes';
import { parseGitLfsPointer, type GitLfsPointer } from '../../src/shared/ipc/gitLfs';
import type { ObjectBatchConsumer } from './GitObjectBatch';

export const LFS_OBJECT_BATCH_SIZE = 256;
export const gitObjectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
export type LfsObjectReader = Pick<GitRunner, 'runBuffer'> & Partial<Pick<GitRunner, 'inspectLfsObjects'>>;
export type LfsBlob = { blob: string; pointer: GitLfsPointer };
type ObjectInfo = { oid: string; type: 'blob' | 'tree' | 'commit' | 'tag'; size: number };

/** Missing objects must never become cached negative pointer results. */
export async function readLfsObjectInfo(
  repoPath: string,
  expressions: string[],
  git: LfsObjectReader,
  options: GitRunOptions = {},
  allowMissing = false,
): Promise<Array<ObjectInfo | null>> {
  if (expressions.some((value) => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})(?:\^\{\})?$/.test(value))) throw new Error('Invalid Git blob identity.');
  const result: Array<ObjectInfo | null> = [];
  for (let offset = 0; offset < expressions.length; offset += LFS_OBJECT_BATCH_SIZE) {
    options.signal?.throwIfAborted();
    const group = expressions.slice(offset, offset + LFS_OBJECT_BATCH_SIZE);
    const metadata = await git.runBuffer(repoPath, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
      ...options,
      input: `${group.join('\n')}\n`,
      maxBytes: 65536,
      tooLargeMessage: 'Git LFS object metadata exceeded its limit.',
    });
    const lines = metadata.toString().trimEnd().split('\n');
    if (lines.length !== group.length) throw new Error('Invalid Git LFS metadata response.');
    lines.forEach((line, index) => {
      if (line === `${group[index]} missing`) {
        if (!allowMissing) throw new Error('A Git LFS source object is not available locally.');
        result.push(null);
        return;
      }
      const match = /^((?:[a-f0-9]{40}|[a-f0-9]{64})) (blob|tree|commit|tag) (\d+)$/.exec(line);
      if (!match || !Number.isSafeInteger(Number(match[3])) || (!group[index].endsWith('^{}') && match[1] !== group[index]))
        throw new Error('Invalid Git LFS metadata response.');
      result.push({ oid: match[1], type: match[2] as ObjectInfo['type'], size: Number(match[3]) });
    });
  }
  return result;
}

/** Classify immutable object IDs, including verified non-pointers, in bounded batches. */
export async function classifyLfsObjects(repoPath: string, objects: string[], git: LfsObjectReader, options: GitRunOptions = {}) {
  options.signal?.throwIfAborted();
  if (!objects.length) return new Map<string, GitLfsPointer | null>();
  if (git.inspectLfsObjects) return git.inspectLfsObjects(repoPath, objects, options);
  const result = new Map<string, GitLfsPointer | null>();
  const unique = [...new Set(objects)];
  for (let offset = 0; offset < unique.length; offset += LFS_OBJECT_BATCH_SIZE) {
    const group = unique.slice(offset, offset + LFS_OBJECT_BATCH_SIZE);
    const metadata = await readLfsObjectInfo(repoPath, group, git, options);
    for (const oid of group) result.set(oid, null);
    const candidates = metadata.filter((info): info is ObjectInfo => info?.type === 'blob' && info.size <= 1024);
    if (!candidates.length) continue;
    const data = await git.runBuffer(repoPath, ['cat-file', '--batch'], {
      ...options,
      input: `${candidates.map((info) => info.oid).join('\n')}\n`,
      maxBytes: candidates.length * 1200,
      tooLargeMessage: 'Git LFS pointer data exceeded its limit.',
    });
    let position = 0;
    for (const candidate of candidates) {
      options.signal?.throwIfAborted();
      const end = data.indexOf(10, position);
      if (end < 0) throw new Error('Invalid Git LFS batch response.');
      const header = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(data.subarray(position, end).toString());
      if (!header || header[1] !== candidate.oid) throw new Error('Invalid Git LFS blob response.');
      const size = Number(header[2]);
      if (size !== candidate.size || end + 1 + size >= data.length || data[end + 1 + size] !== 10) throw new Error('Invalid Git LFS pointer size.');
      const pointer = parseGitLfsPointer(data.subarray(end + 1, end + 1 + size).toString());
      result.set(candidate.oid, pointer);
      position = end + 1 + size + 1;
    }
    if (position !== data.length) throw new Error('Invalid Git LFS batch response.');
  }
  return result;
}

/** Stream bounded classifications while keeping the same two native pipes open. */
export async function classifyLfsObjectBatches(
  repoPath: string,
  objects: string[],
  git: LfsObjectReader,
  options: GitRunOptions,
  consume: ObjectBatchConsumer,
) {
  options.signal?.throwIfAborted();
  if (!objects.length) return;
  if (git.inspectLfsObjects) {
    await git.inspectLfsObjects(repoPath, objects, options, consume);
    return;
  }
  for (let offset = 0; offset < objects.length; offset += LFS_OBJECT_BATCH_SIZE)
    await consume(await classifyLfsObjects(repoPath, objects.slice(offset, offset + LFS_OBJECT_BATCH_SIZE), git, options));
}

export async function readLfsPointers(repoPath: string, objects: string[], git: LfsObjectReader, options: GitRunOptions = {}): Promise<LfsBlob[]> {
  const result: LfsBlob[] = [];
  const unique = [...new Set(objects)];
  for (const [blob, pointer] of await classifyLfsObjects(repoPath, unique, git, options)) if (pointer) result.push({ blob, pointer });
  return result;
}
