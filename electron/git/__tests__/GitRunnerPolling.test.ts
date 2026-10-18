import * as os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { GitRunner, type ExecFileAsyncRunner } from '../GitRunner';
import { readRemoteSnapshot } from '../remoteSnapshot';
import { GitSpawnOperations } from '../GitSpawnOperations';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('concurrent Git polling results', () => {
  it.each(['text', 'result'] as const)('keeps text and structured responses separate when %s starts first', async (first) => {
    const output = deferred<{ stdout: string; stderr: string }>();
    const execute = vi.fn<ExecFileAsyncRunner>(() => output.promise);
    const runner = new GitRunner(execute);
    const reads = {
      text: () => runner.run(os.tmpdir(), ['remote']),
      result: () => runner.runResult(os.tmpdir(), ['remote']),
    };
    const initial = reads[first]();
    const next = reads[first === 'text' ? 'result' : 'text']();
    output.resolve({ stdout: 'origin\n', stderr: '' });
    const results = await Promise.all([initial, next]);
    expect(results[first === 'text' ? 0 : 1]).toBe('origin');
    expect(results[first === 'result' ? 0 : 1]).toEqual({ stdout: 'origin\n', stderr: '', exitCode: 0 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('reads a remote snapshot while a structured push-URL capability probe is pending', async () => {
    const probe = deferred<{ stdout: string; stderr: string }>();
    const url = 'https://github.com/team/project.git';
    const execute = vi.fn<ExecFileAsyncRunner>(async (_file, args, options) => {
      if (options.env.OGC_TEST_PROBE) return probe.promise;
      if (args[0] === 'remote') return { stdout: args.length === 1 ? 'origin\n' : `${url}\n`, stderr: '' };
      if (args[0] === 'symbolic-ref') return { stdout: 'main\n', stderr: '' };
      return { stdout: '', stderr: '' };
    });
    const runner = new GitRunner(execute);
    const probing = runner.runResult(os.tmpdir(), ['remote', 'get-url', '--push', '--all', 'origin'], { envOverrides: { OGC_TEST_PROBE: '1' } });
    const snapshot = readRemoteSnapshot(os.tmpdir(), runner, true);
    const result = expect(snapshot).resolves.toMatchObject({
      branch: 'main',
      remotes: [{ name: 'origin', fetchUrls: [url], pushUrls: [url] }],
    });
    probe.resolve({ stdout: 'https://ogc.invalid/probe-second.git\n', stderr: '' });
    await Promise.all([probing, result]);
  });

  it('does not mix concurrent config lookups with different arguments', async () => {
    const gate = deferred<void>();
    const execute = vi.fn<ExecFileAsyncRunner>(async (_file, args) => {
      await gate.promise;
      return { stdout: `${args.at(-1)}\n`, stderr: '' };
    });
    const runner = new GitRunner(execute);
    const first = runner.runResult(os.tmpdir(), ['config', '--get', 'branch.main.remote']);
    const second = runner.runResult(os.tmpdir(), ['config', '--get', 'remote.pushDefault']);
    gate.resolve();
    expect((await first).stdout).toBe('branch.main.remote\n');
    expect((await second).stdout).toBe('remote.pushDefault\n');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it.each(['run', 'runResult'] as const)('keeps %s reads with different configuration environments separate', async (method) => {
    const gate = deferred<void>();
    const execute = vi.fn<ExecFileAsyncRunner>(async (_file, _args, options) => {
      await gate.promise;
      return { stdout: options.env.OGC_TEST_REMOTE!, stderr: '' };
    });
    const runner = new GitRunner(execute);
    const first = runner[method](os.tmpdir(), ['remote', 'get-url', 'origin'], { envOverrides: { OGC_TEST_REMOTE: 'original' } });
    const second = runner[method](os.tmpdir(), ['remote', 'get-url', 'origin'], { envOverrides: { OGC_TEST_REMOTE: 'isolated-probe' } });
    gate.resolve();
    const values = (await Promise.all([first, second])).map((value) => (typeof value === 'string' ? value : value.stdout));
    expect(values).toEqual(['original', 'isolated-probe']);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it.each(['run', 'runResult'] as const)('still coalesces identical %s reads with equivalent environments', async (method) => {
    const output = deferred<{ stdout: string; stderr: string }>();
    const execute = vi.fn<ExecFileAsyncRunner>(() => output.promise);
    const runner = new GitRunner(execute);
    const first = runner[method](os.tmpdir(), ['remote'], { envOverrides: { OGC_TEST_A: 'a', OGC_TEST_B: 'b' } });
    const second = runner[method](os.tmpdir(), ['remote'], { envOverrides: { OGC_TEST_B: 'b', OGC_TEST_A: 'a' } });
    output.resolve({ stdout: 'origin', stderr: '' });
    expect(await first).toEqual(await second);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('keeps independent caller cancellation scopes separate', async () => {
    const output = deferred<{ stdout: string; stderr: string }>();
    const execute = vi.fn<ExecFileAsyncRunner>(() => output.promise);
    const runner = new GitRunner(execute);
    const first = runner.run(os.tmpdir(), ['remote'], { signal: new AbortController().signal });
    const second = runner.run(os.tmpdir(), ['remote'], { signal: new AbortController().signal });
    output.resolve({ stdout: 'origin', stderr: '' });
    await Promise.all([first, second]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('delivers progress to each independently requested output handler', async () => {
    const gate = deferred<void>();
    const stream = vi.spyOn(GitSpawnOperations.prototype, 'streamResult').mockImplementation(async (_cwd, _args, onLine) => {
      await gate.promise;
      onLine('origin');
      return { stdout: 'origin', stderr: '', exitCode: 0 };
    });
    try {
      const runner = new GitRunner();
      const onFirst = vi.fn(),
        onSecond = vi.fn();
      const first = runner.runResult(os.tmpdir(), ['remote'], { onOutput: onFirst });
      const second = runner.runResult(os.tmpdir(), ['remote'], { onOutput: onSecond });
      gate.resolve();
      await Promise.all([first, second]);
      expect(onFirst).toHaveBeenCalledWith('origin');
      expect(onSecond).toHaveBeenCalledWith('origin');
    } finally {
      stream.mockRestore();
    }
  });
});
