import { toolExecutable, toolEnvironment } from '../system-tools/toolRuntime';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { parseGitLfsPointer, type GitLfsPointer } from '../../src/shared/ipc/gitLfs';
import { redactGitSensitiveText } from './GitErrorFormatter';
import type { CommitEditGit } from './CommitEditGit';

/** Called under a scheduler-owned job. Input is streamed; only the small pointer is buffered. */
export async function cleanLfsContent(repoPath: string, filePath: string, input: Readable, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  const proc = spawn(toolExecutable('git'), ['lfs', 'clean', '--', filePath], {
    cwd: repoPath,
    env: toolEnvironment(),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = Buffer.alloc(0);
  let error = '';
  const abort = () => {
    input.destroy();
    proc.kill();
  };
  signal?.addEventListener('abort', abort, { once: true });
  const completion = new Promise<void>((resolve, reject) => {
    proc.stdout.on('data', (chunk: Buffer) => {
      output = Buffer.concat([output, chunk]);
      if (output.length > 4096) {
        proc.kill();
        reject(new Error('Git LFS returned an invalid pointer.'));
      }
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (error.length < 65536) error += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(redactGitSensitiveText(error || 'Git LFS conversion failed.')))));
  });
  try {
    await Promise.all([completion, pipeline(input, proc.stdin)]);
    signal?.throwIfAborted();
    if (!parseGitLfsPointer(output.toString())) throw new Error('Git LFS did not create a valid pointer.');
    return output;
  } finally {
    signal?.removeEventListener('abort', abort);
    input.destroy();
    if (proc.exitCode === null) proc.kill();
  }
}

export async function exportGitBlob(repoPath: string, oid: string, outputPath: string, signal?: AbortSignal): Promise<void> {
  if (!/^[a-f0-9]{40,64}$/.test(oid)) throw new Error('Invalid blob identity.');
  signal?.throwIfAborted();
  const proc = spawn(toolExecutable('git'), ['cat-file', 'blob', oid], {
    cwd: repoPath,
    env: toolEnvironment(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let error = '';
  const abort = () => proc.kill();
  signal?.addEventListener('abort', abort, { once: true });
  const completion = new Promise<void>((resolve, reject) => {
    proc.stderr.on('data', (chunk: Buffer) => {
      if (error.length < 65536) error += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(redactGitSensitiveText(error || 'Could not read the selected blob.')))));
  });
  try {
    await Promise.all([completion, pipeline(proc.stdout, fs.createWriteStream(outputPath, { flags: 'wx', mode: 0o600 }))]);
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener('abort', abort);
    if (proc.exitCode === null) proc.kill();
  }
}

export async function localLfsObject(repoPath: string, pointer: GitLfsPointer, git: Pick<CommitEditGit, 'run'>): Promise<string | null> {
  const environment = await git.run(repoPath, ['lfs', 'env']);
  const mediaDirectory = /^LocalMediaDir=(.+)$/m.exec(environment)?.[1]?.trim();
  if (!mediaDirectory) throw new Error('Could not locate the local Git LFS object store.');
  const directory = path.resolve(repoPath, mediaDirectory);
  const candidate = path.join(directory, pointer.oid.slice(0, 2), pointer.oid.slice(2, 4), pointer.oid);
  try {
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== pointer.size) throw new Error('The local Git LFS object is invalid.');
    return candidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
