import { StringDecoder } from 'node:string_decoder';
import { detectRepositoryFileEncoding } from '../git/RepositoryFileEncoding';
import type { AnalyticsGit } from './AnalyticsGit';
import type { AnalyticsCache } from './AnalyticsCache';
import type { BlobRecord } from './AnalyticsTypes';
import { parseGitLfsPointer } from '../../src/shared/ipc/gitLfs';

class BlobCounter {
  private sample = Buffer.alloc(0);
  private decoder: StringDecoder | null = null;
  private kind: BlobRecord['kind'] = 'text';
  private bigEndian = false;
  private odd = Buffer.alloc(0);
  private lines = 0;
  private seen = false;
  private last = '';
  write(chunk: Buffer) {
    if (!this.decoder && this.kind === 'text') {
      const count = Math.min(chunk.length, 8192 - this.sample.length);
      this.sample = Buffer.concat([this.sample, chunk.subarray(0, count)]);
      if (this.sample.length < 8192) return;
      this.initialize();
      this.consume(this.sample);
      this.sample = Buffer.alloc(0);
      this.consume(chunk.subarray(count));
    } else this.consume(chunk);
  }
  finish(oid: string): BlobRecord {
    if (!this.decoder && this.kind === 'text') {
      this.initialize();
      this.consume(this.sample);
    }
    if (this.decoder) this.count(this.decoder.end());
    return { oid, kind: this.kind, lines: this.kind === 'text' ? this.lines + (this.seen && this.last !== '\n' && this.last !== '\r' ? 1 : 0) : 0 };
  }
  private initialize() {
    if (parseGitLfsPointer(this.sample.toString('utf8'))) {
      this.kind = 'lfs';
      return;
    }
    const encoding = detectRepositoryFileEncoding(this.sample);
    if (encoding === 'binary') {
      this.kind = 'binary';
      return;
    }
    this.bigEndian = encoding === 'utf16be';
    this.decoder = new StringDecoder(encoding.startsWith('utf16') ? 'utf16le' : encoding === 'latin1' ? 'latin1' : 'utf8');
  }
  private consume(chunk: Buffer) {
    if (!this.decoder || !chunk.length) return;
    if (this.bigEndian) {
      const raw = Buffer.concat([this.odd, chunk]);
      const even = raw.subarray(0, raw.length - (raw.length % 2));
      this.odd = Buffer.from(raw.subarray(even.length));
      const swapped = Buffer.from(even);
      swapped.swap16();
      this.count(this.decoder.write(swapped));
    } else this.count(this.decoder.write(chunk));
  }
  private count(text: string) {
    if (!this.seen) text = text.replace(/^\ufeff/, '');
    for (const character of text) {
      if (character === '\r' || (character === '\n' && this.last !== '\r')) this.lines++;
      this.last = character;
      this.seen = true;
    }
  }
}

/** cat-file's byte sizes delimit objects; filenames and object contents cannot become headers. */
export async function readAnalyticsBlobs(git: AnalyticsGit, oids: string[], cache: AnalyticsCache, progress: (done: number) => void): Promise<void> {
  let done = 0;
  for (let start = 0; start < oids.length; start += 128) {
    let pending = Buffer.alloc(0);
    let remaining = -1;
    let current = '';
    let counter = new BlobCounter();
    let separator = false;
    await git.stream(
      ['cat-file', '--batch'],
      (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length) {
          if (separator) {
            if (pending[0] !== 10) throw new Error('Invalid Git object separator.');
            pending = pending.subarray(1);
            separator = false;
          }
          if (remaining < 0) {
            const newline = pending.indexOf(10);
            if (newline < 0) break;
            const header = /^([0-9a-f]{40,64}) blob (\d+)$/.exec(pending.subarray(0, newline).toString('ascii'));
            if (!header) throw new Error('A required analytics object is missing.');
            current = header[1];
            remaining = Number(header[2]);
            counter = new BlobCounter();
            pending = pending.subarray(newline + 1);
          }
          const consumed = Math.min(remaining, pending.length);
          counter.write(pending.subarray(0, consumed));
          remaining -= consumed;
          pending = pending.subarray(consumed);
          if (remaining) break;
          cache.put('blob', counter.finish(current));
          remaining = -1;
          separator = true;
          progress(++done);
        }
      },
      oids.slice(start, start + 128).join('\n') + '\n',
    );
    if (pending.length || remaining >= 0 || separator) throw new Error('Incomplete analytics blob stream.');
  }
}

export async function classifySmallHistoricalBlobs(git: AnalyticsGit, cache: AnalyticsCache, hashes: string[]): Promise<void> {
  const changes = hashes.flatMap((hash) => cache.data.commits.get(hash)?.changes ?? []).filter((change) => change.mode !== '160000');
  const candidates = [...new Set(changes.flatMap((change) => [change.before, change.after]))].filter(
    (oid) => !/^0+$/.test(oid) && !cache.data.blobs.has(oid) && !cache.data.classified.has(oid),
  );
  const small: string[] = [];
  for (let start = 0; start < candidates.length; start += 2048) {
    const output = await git.text(
      ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      candidates.slice(start, start + 2048).join('\n') + '\n',
    );
    for (const line of output.split(/\r?\n/)) {
      const match = /^([a-f0-9]{40,64}) (blob|commit) (\d+)$/.exec(line);
      if (!match) {
        if (line.trim()) throw new Error('A required historical analytics object is missing.');
        continue;
      }
      if (match[2] === 'blob' && Number(match[3]) <= 1024) small.push(match[1]);
      else cache.put('classified', { oid: match[1] });
    }
  }
  await readAnalyticsBlobs(git, small, cache, () => {});
}
