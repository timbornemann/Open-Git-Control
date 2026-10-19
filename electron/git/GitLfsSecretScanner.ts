import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { GitRunner } from './GitRunner';
import type { GitRunOptions } from './GitProcessTypes';
import { localLfsObject } from './GitLfsObjects';
import { detectRepositoryFileEncoding } from './RepositoryFileEncoding';
import type { GitLfsPointer } from '../../src/shared/ipc/gitLfs';
import { classifyLfsObjects } from './GitLfsPointers';

type Candidate = { filePath: string; line: string; lineNumber: number };
const MAX_LFS_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_LINE_CHARACTERS = 1024 * 1024;
type ScanOptions = GitRunOptions & {
  stagedBaseTree?: string;
  paths?: Map<string, string[]>;
  pointers?: Map<string, GitLfsPointer | null>;
  mediaCache?: { value?: Promise<string> };
};

async function changedPointers(repo: string, paths: Map<string, string[]>, git: GitRunner, options: ScanOptions) {
  const unknown = [...paths.keys()].filter((oid) => !options.pointers?.has(oid));
  const known = new Map([...paths.keys()].map((oid) => [oid, options.pointers?.get(oid)]));
  const classified = await classifyLfsObjects(repo, unknown, git, options);
  for (const [oid, value] of classified) options.pointers?.set(oid, value);
  while ((options.pointers?.size ?? 0) > 75_000) options.pointers!.delete(options.pointers!.keys().next().value!);
  // Keep the per-call results even if inserting them evicted another entry.
  return [...paths.keys()].flatMap((blob) => {
    const pointer = classified.has(blob) ? classified.get(blob) : known.get(blob);
    return pointer ? [{ blob, pointer }] : [];
  });
}

/** Inspect changed blob identities directly, including binary-to-pointer diffs without text hunks. */
export async function scanLfsSecrets(
  repoPath: string,
  git: GitRunner,
  commits: string[] | null,
  seen: Set<string>,
  onLine: (candidate: Candidate) => void,
  options: ScanOptions = {},
): Promise<string[]> {
  const notes: string[] = [];
  if (!git) return notes; // Legacy test/facade adapters expose no native blob reader.
  const args = commits
    ? ['diff-tree', '--stdin', '--root', '-r', '-m', '--no-abbrev', '--raw', '-z']
    : ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-abbrev', '--raw', '-z', ...(options.stagedBaseTree ? [options.stagedBaseTree] : [])];
  const raw = options.paths
    ? Buffer.alloc(0)
    : await git.runBuffer(repoPath, args, {
        input: commits ? `${commits.join('\n')}\n` : undefined,
        maxBytes: 8 * 1024 * 1024,
        tooLargeMessage: 'Git LFS scan metadata exceeds its limit.',
        envOverrides: options.envOverrides,
        signal: options.signal,
        requestedKind: options.requestedKind,
      });
  const parts = raw.toString().split('\0');
  const paths = options.paths ?? new Map<string, string[]>();
  for (let i = 0; i + 1 < parts.length; i++) {
    const match = /:(\d{6}) (\d{6}) [a-f0-9]{40,64} ([a-f0-9]{40,64}) ([A-Z][0-9]*)$/.exec(parts[i]);
    if (!match || !['100644', '100755'].includes(match[2]) || /^0+$/.test(match[3])) continue;
    const filePath = parts[i + (/^[RC]/.test(match[4]) ? 2 : 1)];
    if (filePath) paths.set(match[3], [...(paths.get(match[3]) ?? []), filePath]);
  }
  const pointers = await changedPointers(repoPath, paths, git, options);
  let mediaDirectory: string | undefined;
  for (const { blob, pointer } of pointers) {
    options.signal?.throwIfAborted();
    const targets = [...new Set(paths.get(blob) ?? [])].filter((filePath) => !seen.has(`${filePath}:${pointer.oid}`));
    if (!targets.length) continue;
    try {
      const location = await localLfsObject(repoPath, pointer, {
        run: async (repo, args) => {
          if (options.mediaCache) options.mediaCache.value ??= git.run(repo, args, options);
          mediaDirectory ??= await (options.mediaCache?.value ?? git.run(repo, args, options));
          return mediaDirectory;
        },
      });
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
      const consume = async (text: string, finish = false) => {
        pending += text;
        let end: number;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end).replace(/\r$/, '');
          if (line.length > MAX_LINE_CHARACTERS) throw new Error('LFS text has a line exceeding the scan limit');
          for (const filePath of targets) await onLine({ filePath, line, lineNumber });
          lineNumber++;
          pending = pending.slice(end + 1);
        }
        if (pending.length > MAX_LINE_CHARACTERS) throw new Error('LFS text has a line exceeding the scan limit');
        if (finish && pending) for (const filePath of targets) await onLine({ filePath, line: pending, lineNumber });
      };
      for await (const chunk of fs.createReadStream(location)) {
        options.signal?.throwIfAborted();
        hash.update(chunk);
        await consume(decoder.decode(chunk, { stream: true }));
      }
      await consume(decoder.decode(), true);
      if (hash.digest('hex') !== pointer.oid) throw new Error('LFS content failed its integrity check');
      for (const target of targets) seen.add(`${target}:${pointer.oid}`);
    } catch (error) {
      options.signal?.throwIfAborted();
      notes.push(`Could not scan Git LFS content for ${targets.join(', ')}: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
  return notes;
}
