import { spawn } from 'node:child_process';
import { toolExecutable, toolEnvironment } from '../system-tools/toolRuntime';
import { gitProcessTree } from './GitProcessTree';
import { createAbortError } from './GitProcessTypes';
import { redactGitSensitiveText } from './GitErrorFormatter';

/** Raw, bounded-memory output: unlike line streams this preserves NUL paths and binary objects. */
export function runGitChunkStream(
  repoPath: string,
  args: string[],
  onChunk: (chunk: Buffer) => void,
  signal: AbortSignal,
  input?: string | Buffer,
  envOverrides?: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(toolExecutable('git'), args, {
      cwd: repoPath,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      env: toolEnvironment(envOverrides),
    });
    const tree = gitProcessTree(child);
    let stderr = '';
    let failure: Error | undefined;
    signal.addEventListener('abort', tree.stop, { once: true });
    if (signal.aborted) tree.stop();
    child.stdout!.on('data', (chunk: Buffer) => {
      if (failure || signal.aborted) return;
      try {
        onChunk(chunk);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        tree.stop();
      }
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      failure = error;
    });
    child.once('close', async (code) => {
      signal.removeEventListener('abort', tree.stop);
      await tree.waitForStop();
      if (failure) reject(failure);
      else if (signal.aborted) reject(createAbortError('Git read was aborted.'));
      else if (code !== 0) reject(new Error(redactGitSensitiveText(stderr.trim() || `Git ${args[0]} failed (${code}).`)));
      else resolve();
    });
    if (input !== undefined) {
      child.stdin!.on('error', () => {});
      child.stdin!.end(input);
    }
  });
}
