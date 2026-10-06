import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { GitRunner } from './GitRunner';
import type { GitRunOptions } from './GitProcessTypes';
import { readLfsPointers } from './GitLfsPointers';
import { localLfsObject } from './GitLfsObjects';
import { detectRepositoryFileEncoding } from './RepositoryFileEncoding';

type Candidate = { filePath: string; line: string; lineNumber: number };
const MAX_LFS_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_LINE_CHARACTERS = 1024 * 1024;

/** Inspect changed blob identities directly, including binary-to-pointer diffs without text hunks. */
export async function scanLfsSecrets(
  repoPath: string,
  git: GitRunner,
  commits: string[] | null,
  seen: Set<string>,
  onLine: (candidate: Candidate) => void,
  options: GitRunOptions & { stagedBaseTree?: string } = {},
): Promise<string[]> {
  const notes: string[] = [];
  if (!git) return notes; // Legacy test/facade adapters expose no native blob reader.
  const args = commits
    ? ['diff-tree', '--stdin', '--root', '-r', '-m', '--no-abbrev', '--raw', '-z']
    : ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-abbrev', '--raw', '-z', ...(options.stagedBaseTree ? [options.stagedBaseTree] : [])];
  const raw = await git.runBuffer(repoPath, args, {
    input: commits ? `${commits.join('\n')}\n` : undefined,
    maxBytes: 8 * 1024 * 1024,
    tooLargeMessage: 'Git LFS scan metadata exceeds its limit.',
    envOverrides: options.envOverrides,
  });
  const parts = raw.toString().split('\0');
  const paths = new Map<string, string[]>();
  for (let i = 0; i + 1 < parts.length; i++) {
    const match = /:(\d{6}) (\d{6}) [a-f0-9]{40,64} ([a-f0-9]{40,64}) ([A-Z][0-9]*)$/.exec(parts[i]);
    if (!match || !['100644', '100755'].includes(match[2]) || /^0+$/.test(match[3])) continue;
    const filePath = parts[i + (/^[RC]/.test(match[4]) ? 2 : 1)];
    if (filePath) paths.set(match[3], [...(paths.get(match[3]) ?? []), filePath]);
  }
  for (const { blob, pointer } of await readLfsPointers(repoPath, [...paths.keys()], git, options)) {
    options.signal?.throwIfAborted();
    const targets = [...new Set(paths.get(blob) ?? [])].filter((filePath) => !seen.has(`${filePath}:${pointer.oid}`));
    if (!targets.length) continue;
    try {
      const location = await localLfsObject(repoPath, pointer, git);
      if (!location) throw new Error('LFS content is not available locally');
      const descriptor = fs.openSync(location, 'r');
      let sample: Buffer;
      try {
        sample = Buffer.alloc(Math.min(pointer.size, 65536));
        sample = sample.subarray(0, fs.readSync(descriptor, sample, 0, sample.length, 0));
      } finally {
        fs.closeSync(descriptor);
      }
      const encoding = detectRepositoryFileEncoding(sample);
      if (encoding === 'binary') {
        for (const target of targets) seen.add(`${target}:${pointer.oid}`);
        continue;
      }
      if (pointer.size > MAX_LFS_TEXT_BYTES) throw new Error('LFS text exceeds the secret scan size limit');
      const decoder = new TextDecoder(
        encoding === 'utf16be' ? 'utf-16be' : encoding === 'utf16le' ? 'utf-16le' : encoding === 'latin1' ? 'windows-1252' : 'utf-8',
      );
      const hash = createHash('sha256');
      let pending = '',
        lineNumber = 1;
      const consume = (text: string, finish = false) => {
        pending += text;
        let end: number;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end).replace(/\r$/, '');
          if (line.length > MAX_LINE_CHARACTERS) throw new Error('LFS text has a line exceeding the scan limit');
          for (const filePath of targets) onLine({ filePath, line, lineNumber });
          lineNumber++;
          pending = pending.slice(end + 1);
        }
        if (pending.length > MAX_LINE_CHARACTERS) throw new Error('LFS text has a line exceeding the scan limit');
        if (finish && pending) for (const filePath of targets) onLine({ filePath, line: pending, lineNumber });
      };
      for await (const chunk of fs.createReadStream(location)) {
        options.signal?.throwIfAborted();
        hash.update(chunk);
        consume(decoder.decode(chunk, { stream: true }));
      }
      consume(decoder.decode(), true);
      if (hash.digest('hex') !== pointer.oid) throw new Error('LFS content failed its integrity check');
      for (const target of targets) seen.add(`${target}:${pointer.oid}`);
    } catch (error) {
      options.signal?.throwIfAborted();
      notes.push(`Could not scan Git LFS content for ${targets.join(', ')}: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
  return notes;
}
