import { afterEach, describe, expect, it, vi } from 'vitest';
import { repositoryRunClient } from '../repositoryRunClient';
import { createEmptyRepositoryRunConfig } from '@/types/repositoryRun';

afterEach(() => vi.unstubAllGlobals());

describe('Run prerequisite client', () => {
  it('checks an unsaved draft against its explicit repository without saving it', async () => {
    const report = {
      platform: 'windows' as const,
      checkedAt: 1,
      checks: [{ program: 'npm' as const, shell: 'powershell' as const, state: 'missing' as const }],
    };
    const check = vi.fn().mockResolvedValue({ success: true, data: report });
    const save = vi.fn();
    vi.stubGlobal('window', { electronAPI: { runs: { checkRepositoryRunPrerequisites: check, saveRepositoryRunConfig: save } } });
    const config = createEmptyRepositoryRunConfig();
    config.actions.test.steps = [{ id: 'test', label: 'Tests', parser: 'none', windows: { shell: 'powershell', command: 'npm test' } }];
    const original = JSON.stringify(config);
    expect(await repositoryRunClient.checkPrerequisites('C:/project', config)).toEqual({ success: true, data: report });
    expect(check).toHaveBeenCalledWith('C:/project', config);
    expect(JSON.stringify(config)).toBe(original);
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves a failed prerequisite check for the UI to distinguish it from missing programs', async () => {
    const error = { success: false as const, error: 'Repository is unavailable.' };
    const check = vi.fn().mockResolvedValue(error);
    vi.stubGlobal('window', { electronAPI: { runs: { checkRepositoryRunPrerequisites: check } } });
    expect(await repositoryRunClient.checkPrerequisites('C:/project', createEmptyRepositoryRunConfig())).toEqual(error);
  });
});
