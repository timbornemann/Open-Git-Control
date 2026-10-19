import { spawn } from 'node:child_process';
import { toolExecutable, toolEnvironment } from '../system-tools/toolRuntime';
import { gitProcessTree } from './GitProcessTree';
import { createAbortError, type GitRunOptions } from './GitProcessTypes';
import { parseGitLfsPointer, type GitLfsPointer } from '../../src/shared/ipc/gitLfs';

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const BATCH_SIZE = 256;

/** A private pipe owned by one scheduler job, never shared across repositories or callers. */
class ObjectPipe {
  private readonly child;
  private readonly tree;
  private readonly iterator;
  private buffer = Buffer.alloc(0);
  private failure: Error | undefined;
  private readonly abort;
  private readonly closed: Promise<void>;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    repo: string,
    mode: string,
    private readonly signal: AbortSignal,
    environment?: NodeJS.ProcessEnv,
  ) {
    signal.throwIfAborted();
    this.child = spawn(toolExecutable('git'), ['cat-file', mode], {
      cwd: repo,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: toolEnvironment(environment),
    });
    this.tree = gitProcessTree(this.child);
    this.iterator = this.child.stdout[Symbol.asyncIterator]();
    this.child.stderr.resume();
    this.child.stdin.on('error', () => {});
    this.child.once('error', () => {
      this.failure = new Error('Git object reader could not be started.');
      this.child.stdout.destroy(this.failure);
    });
    this.closed = new Promise((resolve) => {
      this.child.once('close', () => resolve());
    });
    this.abort = () => this.tree.stop();
    signal.addEventListener('abort', this.abort, { once: true });
    if (signal.aborted) this.abort();
  }

  send(oids: string[]) {
    this.signal.throwIfAborted();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.failure = new Error('Git object reader timed out.');
      this.tree.stop();
    }, 30_000);
    this.timer.unref?.();
    this.child.stdin.write(`${oids.join('\n')}\n`);
  }

  private async receive() {
    this.signal.throwIfAborted();
    const next = await this.iterator.next();
    if (next.done) {
      if (this.signal.aborted) throw createAbortError('Git object inspection was aborted.');
      throw this.failure ?? new Error('Git object reader closed before returning a complete response.');
    }
    this.buffer = Buffer.concat([this.buffer, next.value as Buffer]);
    if (this.buffer.length > 512 * 1024) throw new Error('Git object reader exceeded its response limit.');
  }

  async bytes(size: number): Promise<Buffer> {
    while (this.buffer.length < size) await this.receive();
    const result = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return result;
  }

  async line(): Promise<string> {
    let end: number;
    while ((end = this.buffer.indexOf(10)) < 0) {
      if (this.buffer.length > 1024) throw new Error('Invalid Git object header.');
      await this.receive();
    }
    if (end > 1024) throw new Error('Invalid Git object header.');
    return (await this.bytes(end + 1)).subarray(0, end).toString('ascii');
  }

  async close(failed = false) {
    clearTimeout(this.timer);
    // Closing a completed request must also reap children after malformed data,
    // a missing executable or cancellation. No pipe outlives its scheduler job.
    if (this.child.exitCode === null && this.child.signalCode === null) {
      if (failed || this.signal.aborted) this.tree.stop();
      else this.child.stdin.end();
    }
    const deadline = setTimeout(() => this.tree.stop(), 3000);
    deadline.unref?.();
    await this.closed;
    clearTimeout(deadline);
    await this.tree.waitForStop();
    this.signal.removeEventListener('abort', this.abort);
  }
}

/** Two persistent Git processes replace one process per metadata/content batch. */
export type ObjectBatchConsumer = (values: Map<string, GitLfsPointer | null>) => void | Promise<void>;
export async function inspectLfsObjectBatch(repo: string, objects: string[], options: GitRunOptions, signal: AbortSignal, consume?: ObjectBatchConsumer) {
  if (objects.some((oid) => !OID.test(oid))) throw new Error('Invalid Git blob identity.');
  const result = new Map<string, GitLfsPointer | null>();
  if (!objects.length) return result;
  const metadata = new ObjectPipe(repo, '--batch-check=%(objectname) %(objecttype) %(objectsize)', signal, options.envOverrides);
  let content: ObjectPipe | undefined;
  let complete = false;
  try {
    const unique = [...new Set(objects)];
    for (let offset = 0; offset < unique.length; offset += BATCH_SIZE) {
      signal.throwIfAborted();
      const group = unique.slice(offset, offset + BATCH_SIZE);
      const values = consume ? new Map<string, GitLfsPointer | null>() : result;
      metadata.send(group);
      const candidates: { oid: string; size: number }[] = [];
      for (const oid of group) {
        const header = /^(\S+) (blob|commit|tree|tag) (\d+)$/.exec(await metadata.line());
        if (!header || header[1] !== oid || !Number.isSafeInteger(Number(header[3]))) throw new Error('Invalid or unavailable Git object.');
        values.set(oid, null);
        if (header[2] === 'blob' && Number(header[3]) <= 1024) candidates.push({ oid, size: Number(header[3]) });
      }
      if (candidates.length) {
        content ??= new ObjectPipe(repo, '--batch', signal, options.envOverrides);
        content.send(candidates.map(({ oid }) => oid));
        for (const { oid, size } of candidates) {
          if ((await content.line()) !== `${oid} blob ${size}`) throw new Error('Invalid Git pointer response.');
          const bytes = await content.bytes(size + 1);
          if (bytes[size] !== 10) throw new Error('Invalid Git pointer terminator.');
          values.set(oid, parseGitLfsPointer(bytes.subarray(0, size).toString('utf8')));
        }
      }
      await consume?.(values);
    }
    signal.throwIfAborted();
    complete = true;
    return result;
  } finally {
    await Promise.all([metadata.close(!complete), content?.close(!complete)]);
  }
}
