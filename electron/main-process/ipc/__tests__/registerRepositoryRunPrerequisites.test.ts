import { beforeEach, describe, expect, it, vi } from 'vitest';
const { handlers, check } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => Promise<any>>(), check: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, callback: (...args: any[]) => Promise<any>) => handlers.set(channel, callback) } }));
vi.mock('../../RepositoryRunPrerequisites', () => ({
  RepositoryRunPrerequisites: class {
    check = check;
  },
}));
vi.mock('../../RepositoryRunApprovals', () => ({ RepositoryRunApprovals: class {} }));
import { registerRepositoryRunHandlers } from '../registerRepositoryRunHandlers';
import { RepositoryRunConfigService } from '../../RepositoryRunConfigService';
import { createEmptyRepositoryRunConfig } from '../../../../src/types/repositoryRun';
import { IpcChannel } from '../../../../src/types/ipcContract';

beforeEach(() => {
  handlers.clear();
  check.mockReset();
});

describe('Run prerequisite IPC boundary', () => {
  const setup = () => {
    const configService = new RepositoryRunConfigService();
    const config = createEmptyRepositoryRunConfig();
    config.actions.test.steps = [{ id: 'tests', label: 'Tests', parser: 'none', windows: { shell: 'powershell', command: 'npm test' } }];
    const template = {
      id: 'cargo-build',
      label: 'cargo build',
      action: 'build' as const,
      step: { label: 'Build', parser: 'none' as const, windows: { shell: 'powershell' as const, command: 'cargo build' } },
    };
    const read = vi.spyOn(configService, 'read');
    read.mockReturnValue({
      exists: true,
      config,
      templates: [template],
      configPath: 'run.json',
      availableActions: { run: false, test: true, format: false, start: false, build: false },
    });
    const write = vi.spyOn(configService, 'write');
    registerRepositoryRunHandlers({ configService, runService: {} as any, readStoredRepoPaths: () => ['C:/repo'], approvals: { authorize: vi.fn() } });
    return { config, template, read, write };
  };
  it('returns availability for configured actions and detected templates without writing files', async () => {
    const { config, template, write } = setup();
    const report = { platform: 'windows', checkedAt: 1, checks: [] };
    check.mockResolvedValue(report);
    const result = await handlers.get(IpcChannel.RepositoryRunGetConfig)!({}, 'C:/repo');
    expect(result.data.prerequisites).toEqual(report);
    expect(check).toHaveBeenCalledWith('C:/repo', [config.actions.test.steps[0], template.step]);
    expect(write).not.toHaveBeenCalled();
  });
  it('checks validated drafts without saving or trusting unsupported shells', async () => {
    const { config, write } = setup();
    check.mockResolvedValue({ platform: 'windows', checkedAt: 1, checks: [] });
    expect((await handlers.get(IpcChannel.RepositoryRunCheckPrerequisites)!({}, 'C:/repo', config)).success).toBe(true);
    expect(write).not.toHaveBeenCalled();
    check.mockClear();
    config.actions.test.steps[0].windows!.shell = 'bash';
    expect((await handlers.get(IpcChannel.RepositoryRunCheckPrerequisites)!({}, 'C:/repo', config)).success).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });
  it('rejects repositories outside the saved catalog before inspecting programs or project files', async () => {
    const { config, read } = setup();
    const result = await handlers.get(IpcChannel.RepositoryRunCheckPrerequisites)!({}, 'C:/other', config);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('saved repositories') });
    expect(read).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });
});
