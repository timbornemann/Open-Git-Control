import type { GitService } from '../GitService';
import { redactAiContext } from '../SecretScanService';

const MAX_BLOB = 128 * 1024;
const MAX_CACHE = 16 * 1024 * 1024;
const MAX_BATCH = 2 * 1024 * 1024;

/** Batches immutable blobs instead of spawning Git once per changed file. */
export class AutoCommitObjectReader {
  readonly files = new Map<string, string>();
  readonly cache = new Map<string, string>();
  cacheHits = 0;
  bytes = 0;
  constructor(
    private readonly git: GitService,
    private readonly repoPath: string,
    private readonly signal?: AbortSignal,
  ) {}

  async initialize(tree: string): Promise<void> {
    const raw = await this.git.runner.runBuffer(this.repoPath, ['ls-tree', '-r', '-z', tree], {
      maxBytes: 32 * 1024 * 1024,
      tooLargeMessage: 'AI repository inventory exceeds its context budget.',
    });
    for (const record of raw.toString('utf8').split('\0')) {
      const match = /^100\d+ blob ([0-9a-f]+)\t([\s\S]+)$/.exec(record);
      if (match) this.files.set(match[2], match[1]);
    }
  }

  async load(blobs: string[]): Promise<void> {
    this.signal?.throwIfAborted();
    const unique = [...new Set(blobs.filter((blob) => /^[0-9a-f]{40,64}$/.test(blob) && !/^0+$/.test(blob)))];
    this.cacheHits += unique.filter((blob) => this.cache.has(blob)).length;
    const missing = unique.filter((blob) => !this.cache.has(blob));
    if (!missing.length) return;
    const metadata = await this.git.runner.runBuffer(this.repoPath, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
      input: `${missing.join('\n')}\n`,
      maxBytes: missing.length * 110 + 1024,
      tooLargeMessage: 'AI blob inventory exceeds its budget.',
    });
    let batch: string[] = [];
    let size = 0;
    const flush = async () => {
      if (!batch.length) return;
      this.signal?.throwIfAborted();
      const buffer = await this.git.runner.runBuffer(this.repoPath, ['cat-file', '--batch'], {
        input: `${batch.join('\n')}\n`,
        maxBytes: size + batch.length * 110 + 1024,
        tooLargeMessage: 'AI blob batch exceeds its context budget.',
      });
      let offset = 0;
      while (offset < buffer.length) {
        const newline = buffer.indexOf(10, offset);
        if (newline < 0) throw new Error('Invalid Git blob response.');
        const header = /^([0-9a-f]+) blob (\d+)$/.exec(buffer.subarray(offset, newline).toString());
        if (!header) throw new Error('Invalid Git blob response.');
        const length = Number(header[2]);
        const content = buffer.subarray(newline + 1, newline + 1 + length);
        if (!content.includes(0)) {
          const text = redactAiContext(content.toString('utf8'));
          while (this.bytes + Buffer.byteLength(text) > MAX_CACHE && this.cache.size) {
            const oldest = this.cache.keys().next().value!;
            this.bytes -= Buffer.byteLength(this.cache.get(oldest)!);
            this.cache.delete(oldest);
          }
          this.cache.set(header[1], text);
          this.bytes += Buffer.byteLength(text);
        }
        offset = newline + 2 + length;
      }
      batch = [];
      size = 0;
    };
    for (const line of metadata.toString().split('\n')) {
      const match = /^([0-9a-f]+) blob (\d+)$/.exec(line);
      if (!match) continue;
      const length = Number(match[2]);
      if (length > MAX_BLOB) continue;
      if (size + length > MAX_BATCH) await flush();
      batch.push(match[1]);
      size += length;
    }
    await flush();
  }

  read(file: string): string {
    return this.cache.get(this.files.get(file) || '') || '';
  }
}
