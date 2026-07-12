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

const createChild = (code: number, output = '') => {
  const child = new EventEmitter() as any;
  child.pid = 4321;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  queueMicrotask(() => {
    if (output) child.stdout.emit('data', Buffer.from(`${output}\n`));
    child.emit('close', code);
  });
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
});
