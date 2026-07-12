import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawn: spawnMock }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));

import { RepositoryRunConfigService } from './RepositoryRunConfigService';
import { RepositoryRunService } from './RepositoryRunService';
import { createEmptyRepositoryRunConfig } from '../../src/types/repositoryRun';

const directories: string[] = [];
const originalPlatform = process.platform;
const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform });
};
const waitForCompletion = async (service: RepositoryRunService) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = service.getState();
    if (state && state.status !== 'running') return state;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  throw new Error('Run did not finish.');
};

const createChild = (code: number, output = '', appendNewline = true) => {
  const child = new EventEmitter() as any;
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  queueMicrotask(() => {
    if (output) child.stdout.emit('data', Buffer.from(appendNewline ? `${output}\n` : output));
    child.emit('close', code);
  });
  return child;
};

const createHangingChild = () => {
  const child = new EventEmitter() as any;
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
};

const prepareConfig = (repoPath: string, exitCodes: number[]) => {
  const config = createEmptyRepositoryRunConfig();
  config.actions.test.steps = exitCodes.map((_, index) => ({
    id: `step-${index}`,
    label: `Step ${index + 1}`,
    parser: 'diagnostic',
    windows: { shell: 'powershell', command: `echo ${index}` },
    macos: { shell: 'zsh', command: `echo ${index}` },
    linux: { shell: 'bash', command: `echo ${index}` },
  }));
  new RepositoryRunConfigService().write(repoPath, config);
};

afterEach(() => {
  setPlatform(originalPlatform);
  vi.restoreAllMocks();
  spawnMock.mockReset();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('RepositoryRunService', () => {
  it('runs workflow steps in order and captures streamed output', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-run-service-'));
    directories.push(repoPath);
    prepareConfig(repoPath, [0, 0]);
    spawnMock.mockImplementation((_command, _args, _options) => createChild(0, `step ${spawnMock.mock.calls.length}`));
    const service = new RepositoryRunService(new RepositoryRunConfigService());

    await service.start(repoPath, 'test');
    const state = await waitForCompletion(service);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(state.status).toBe('succeeded');
    expect(state.output.map((line) => line.text)).toEqual(expect.arrayContaining(['step 1', 'step 2']));
  });

  it('stops a workflow after the first non-zero exit code', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-run-service-'));
    directories.push(repoPath);
    prepareConfig(repoPath, [1, 0]);
    spawnMock.mockImplementation(() => createChild(1, 'failed'));
    const service = new RepositoryRunService(new RepositoryRunConfigService());

    await service.start(repoPath, 'test');
    const state = await waitForCompletion(service);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('failed');
    expect(state.exitCode).toBe(1);
  });

  it('flushes an unterminated output line before starting the next step', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-run-service-'));
    directories.push(repoPath);
    prepareConfig(repoPath, [0, 0]);
    spawnMock.mockImplementation(() => createChild(0, spawnMock.mock.calls.length === 1 ? 'first' : 'second', false));
    const service = new RepositoryRunService(new RepositoryRunConfigService());

    await service.start(repoPath, 'test');
    const state = await waitForCompletion(service);
    const stdout = state.output.filter((line) => line.stream === 'stdout');

    expect(stdout.map((line) => line.text)).toEqual(['first', 'second']);
    expect(stdout.map((line) => line.stepIndex)).toEqual([0, 1]);
  });

  it('strictly bounds continuous output without newline characters', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-run-service-'));
    directories.push(repoPath);
    prepareConfig(repoPath, [0]);
    spawnMock.mockImplementation(() => createChild(0, 'x'.repeat(3 * 1024 * 1024), false));
    const service = new RepositoryRunService(new RepositoryRunConfigService());

    await service.start(repoPath, 'test');
    const state = await waitForCompletion(service);
    const retainedBytes = state.output.reduce((total, line) => total + Buffer.byteLength(line.text, 'utf8'), 0);

    expect(state.status).toBe('succeeded');
    expect(retainedBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(state.output.every((line) => Buffer.byteLength(line.text, 'utf8') <= 64 * 1024)).toBe(true);
  });

  it('escalates from SIGTERM to SIGKILL and reaches a terminal cancelled state', async () => {
    setPlatform('linux');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-run-service-'));
    directories.push(repoPath);
    prepareConfig(repoPath, [0]);
    const target = createHangingChild();
    spawnMock.mockReturnValue(target);
    const service = new RepositoryRunService(new RepositoryRunConfigService(), 5, 5);

    const started = await service.start(repoPath, 'test');
    expect(service.stop(started.runId)).toBe(true);
    const state = await waitForCompletion(service);

    expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGTERM');
    expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGKILL');
    expect(state.status).toBe('cancelled');
    expect(state.finishedAt).toEqual(expect.any(Number));
    const outputLengthAfterCancellation = state.output.length;
    target.stdout.emit('data', Buffer.from('late orphan output\n'));
    expect(service.getState()?.output).toHaveLength(outputLengthAfterCancellation);

    await expect(service.start(repoPath, 'test')).rejects.toThrow('previous repository command may still be running');
    target.emit('close', null);
    spawnMock.mockImplementation(() => createChild(0));
    await expect(service.start(repoPath, 'test')).resolves.toEqual(expect.objectContaining({ status: 'running' }));
    await waitForCompletion(service);
  });

  it('handles taskkill failures and still reaches a terminal cancelled state on Windows', async () => {
    setPlatform('win32');
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-run-service-'));
    directories.push(repoPath);
    prepareConfig(repoPath, [0]);
    const target = createHangingChild();
    spawnMock
      .mockImplementationOnce(() => target)
      .mockImplementation(() => {
        const killer = new EventEmitter() as any;
        queueMicrotask(() => killer.emit('close', 1));
        return killer;
      });
    const service = new RepositoryRunService(new RepositoryRunConfigService(), 50, 5);

    const started = await service.start(repoPath, 'test');
    expect(service.stop(started.runId)).toBe(true);
    const state = await waitForCompletion(service);

    const taskkillCalls = spawnMock.mock.calls.filter(([command]) => command === 'taskkill.exe');
    expect(taskkillCalls).toHaveLength(2);
    expect(taskkillCalls[0][1]).toEqual(['/pid', '4321', '/t']);
    expect(taskkillCalls[1][1]).toEqual(['/pid', '4321', '/t', '/f']);
    expect(state.status).toBe('cancelled');
  });
});
