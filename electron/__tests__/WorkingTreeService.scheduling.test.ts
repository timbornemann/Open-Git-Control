import * as os from 'node:os';
import { expect, it, vi } from 'vitest';
import { WorkingTreeService } from '../WorkingTreeService';
import { GitRunner, type ExecFileAsyncRunner } from '../git/GitRunner';

it('preempts large line-count diffs before staging instead of waiting for polling reads', async () => {
  const repo = os.tmpdir();
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const execute = vi.fn<ExecFileAsyncRunner>(async (_file, args, options) => {
    if (args.includes('--numstat'))
      return new Promise((_resolve, reject) => {
        started();
        options.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      });
    return { stdout: '', stderr: '' };
  });
  const runner = new GitRunner(execute);
  const service = new WorkingTreeService({
    getRepoPath: () => repo,
    getStatusPorcelainAtPath: async () => ' M large.txt',
    runPollingCommandAtPath: (root: string, args: string[]) => runner.run(root, args, { requestedKind: 'polling' }),
    runCommandAtPathWithSignal: (root: string, args: string[], signal: AbortSignal, requestedKind: 'background') =>
      runner.run(root, args, { signal, requestedKind }),
  } as any);
  const snapshot = await service.getSnapshot(repo);
  const stats = service.getStats(snapshot.snapshotId, repo);
  const cancelled = expect(stats).rejects.toMatchObject({ name: 'AbortError' });
  await reading;
  await runner.run(repo, ['add', '--', 'large.txt']);
  await cancelled;
  expect(execute.mock.calls.filter(([, args]) => args[0] === 'add')).toHaveLength(1);
  expect(runner.getSchedulerDiagnostics().filter((item) => item.kind === 'background' && item.aborted)).toHaveLength(2);
});

it('abandons stale counts when a new snapshot arrives and can count the new snapshot', async () => {
  const repo = os.tmpdir();
  let status = ' M old.txt';
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const runner = new GitRunner(async (_file, args, options) => {
    if (status.includes('old.txt') && args.includes('--numstat'))
      return new Promise((_resolve, reject) => {
        started();
        options.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      });
    return { stdout: args.includes('--numstat') ? '2\t1\tnew.txt' : '', stderr: '' };
  });
  const service = new WorkingTreeService({
    getRepoPath: () => repo,
    getStatusPorcelainAtPath: async () => status,
    runPollingCommandAtPath: (root: string, args: string[]) => runner.run(root, args, { requestedKind: 'polling' }),
    runCommandAtPathWithSignal: (root: string, args: string[], signal: AbortSignal, requestedKind: 'background') =>
      runner.run(root, args, { signal, requestedKind }),
  } as any);
  const old = await service.getSnapshot();
  const cancelled = expect(service.getStats(old.snapshotId)).rejects.toMatchObject({ name: 'AbortError' });
  await reading;
  status = ' M new.txt';
  const current = await service.getSnapshot();
  await cancelled;
  await expect(service.getStats(current.snapshotId)).resolves.toMatchObject({
    snapshotId: current.snapshotId,
    unstaged: { additions: 2, deletions: 1 },
  });
});
