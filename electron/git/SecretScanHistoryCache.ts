import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import * as path from 'node:path';
import type { GitRunner } from './GitRunner';
import type { GitRunOptions } from './GitProcessTypes';
import { physicalPathKey, repositoryCommonDirectory } from './RepositoryCommonDirectory';
import type { SecretScanFinding } from '../SecretScanService';

export type HistoryScanEntry = {
  checkedLines: number;
  findings: SecretScanFinding[];
  longLines: boolean;
};

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
export const SECRET_SCAN_HISTORY_ENV = { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' };

async function readBoundaryFile(file: string): Promise<string> {
  try {
    const handle = await open(file, 'r');
    try {
      const buffer = Buffer.alloc(1024 * 1024 + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length === buffer.length) throw new Error('Secret scan history boundary exceeds its cache limit.');
      return buffer.subarray(0, length).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

/** Session-only, bounded cache. Retains redacted findings and counts, never patches or credentials. */
export class SecretScanHistoryCache {
  private readonly entries = new Map<string, { value: HistoryScanEntry; bytes: number }>();
  private bytes = 0;

  get(key: string | undefined): HistoryScanEntry | undefined {
    if (!key) return undefined;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  put(key: string, value: HistoryScanEntry): void {
    const bytes = Buffer.byteLength(JSON.stringify(value)) + key.length * 2;
    if (bytes > MAX_CACHE_BYTES) return;
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.bytes;
    this.entries.delete(key);
    this.entries.set(key, { value: structuredClone(value), bytes });
    this.bytes += bytes;
    while (this.bytes > MAX_CACHE_BYTES) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
  }

  /**
   * Commit IDs alone do not identify a diff: shallow boundaries, configuration
   * and effective attributes (including global/untracked attributes) affect it.
   * Inspect only tree metadata and attributes here; no patch content is read.
   */
  async prepare(repoPath: string, commits: string[], policy: string, git: GitRunner, options: GitRunOptions) {
    const common = repositoryCommonDirectory(repoPath);
    if (!common || commits.some((oid) => !objectId.test(oid))) return undefined;
    const readContext = async () => {
      const config = await git.run(repoPath, ['config', '--null', '--list'], options);
      const files = await Promise.all(['shallow', 'info/grafts'].map((name) => readBoundaryFile(path.join(common, name))));
      return hash([config, files, options.envOverrides]);
    };
    const context = await readContext();
    const raw = await git.runBuffer(repoPath, ['diff-tree', '--stdin', '--root', '-r', '-m', '--no-renames', '--raw', '-z'], {
      ...options,
      input: `${commits.join('\n')}\n`,
      maxBytes: MAX_METADATA_BYTES,
      tooLargeMessage: 'Secret scan cache metadata exceeds its limit.',
    });
    const paths = new Map(commits.map((oid) => [oid, new Set<string>()]));
    const parts = new TextDecoder('utf-8', { fatal: true }).decode(raw).split('\0');
    let current: Set<string> | undefined;
    for (let index = 0; index < parts.length; index++) {
      const field = parts[index];
      if (!field) continue;
      if (objectId.test(field) && paths.has(field)) current = paths.get(field);
      else if (/^:\d{6} \d{6} [a-f0-9]{40,64} [a-f0-9]{40,64} [A-Z][0-9]*$/.test(field) && current && parts[index + 1]) current.add(parts[++index]);
      else throw new Error('Secret scan cache metadata is invalid.');
    }
    const allPaths = [...new Set([...paths.values()].flatMap((files) => [...files]))].sort();
    const pathSet = new Set(allPaths);
    const readAttributes = async () => {
      const attributes = new Map<string, string[]>();
      if (!allPaths.length) return attributes;
      const data = await git.runWithInput(repoPath, ['check-attr', '--all', '-z', '--stdin'], `${allPaths.join('\0')}\0`, options);
      const fields = data.split('\0');
      if (fields.pop() !== '' || fields.length % 3 !== 0) throw new Error('Secret scan cache attributes are invalid.');
      for (let index = 0; index + 2 < fields.length; index += 3) {
        const [file, attribute, value] = fields.slice(index, index + 3);
        if (!pathSet.has(file) || !attribute) throw new Error('Secret scan cache attributes are invalid.');
        attributes.set(file, [...(attributes.get(file) ?? []), attribute, value]);
      }
      return attributes;
    };
    const attributes = await readAttributes();
    const attributeKey = (values: Map<string, string[]>) => hash(allPaths.map((file) => [file, values.get(file) ?? []]));
    const before = attributeKey(attributes);
    const repoKey = physicalPathKey(repoPath);
    const keys = new Map(
      commits.map((oid) => [oid, hash([repoKey, policy, context, oid, [...paths.get(oid)!].sort().map((file) => [file, attributes.get(file) ?? []])])]),
    );
    return {
      keys,
      assertCurrent: async () => {
        options.signal?.throwIfAborted();
        if (context !== (await readContext()) || before !== attributeKey(await readAttributes()))
          throw new Error('Git attributes or scan configuration changed during the secret scan. Run the scan again.');
      },
    };
  }
}
