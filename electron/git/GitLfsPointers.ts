import type { GitRunner } from './GitRunner';
import type { GitRunOptions } from './GitProcessTypes';
import { parseGitLfsPointer, type GitLfsPointer } from '../../src/shared/ipc/gitLfs';

export async function readLfsPointers(
  repoPath: string,
  objects: string[],
  git: Pick<GitRunner, 'runBuffer'>,
  options: GitRunOptions = {},
): Promise<Array<{ blob: string; pointer: GitLfsPointer }>> {
  const result: Array<{ blob: string; pointer: GitLfsPointer }> = [];
  const unique = [...new Set(objects)];
  if (unique.some((oid) => !/^[a-f0-9]{40,64}$/.test(oid))) throw new Error('Invalid Git blob identity.');
  for (let offset = 0; offset < unique.length; offset += 256) {
    options.signal?.throwIfAborted();
    const group = unique.slice(offset, offset + 256);
    const metadata = await git.runBuffer(repoPath, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
      input: `${group.join('\n')}\n`,
      maxBytes: 65536,
      tooLargeMessage: 'Git LFS object metadata exceeded its limit.',
      envOverrides: options.envOverrides,
    });
    const candidates = metadata
      .toString()
      .trim()
      .split('\n')
      .filter((line) => /^[a-f0-9]{40,64} blob (?:[0-9]{1,3}|10[0-1][0-9]|102[0-4])$/.test(line))
      .map((line) => line.split(' ')[0]);
    if (!candidates.length) continue;
    const data = await git.runBuffer(repoPath, ['cat-file', '--batch'], {
      input: `${candidates.join('\n')}\n`,
      maxBytes: candidates.length * 1200,
      tooLargeMessage: 'Git LFS pointer data exceeded its limit.',
      envOverrides: options.envOverrides,
    });
    let position = 0;
    while (position < data.length) {
      const end = data.indexOf(10, position);
      if (end < 0) throw new Error('Invalid Git LFS batch response.');
      const header = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(data.subarray(position, end).toString());
      if (!header) throw new Error('Invalid Git LFS blob response.');
      const size = Number(header[2]);
      if (size > 1024 || end + 1 + size >= data.length) throw new Error('Invalid Git LFS pointer size.');
      const pointer = parseGitLfsPointer(data.subarray(end + 1, end + 1 + size).toString());
      if (pointer) result.push({ blob: header[1], pointer });
      position = end + 1 + size + 1;
    }
  }
  return result;
}
