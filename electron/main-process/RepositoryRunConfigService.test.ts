import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositoryRunConfigService, normalizeRepositoryRunConfig } from './RepositoryRunConfigService';
import { createEmptyRepositoryRunConfig } from '../../src/types/repositoryRun';

const temporaryDirectories: string[] = [];
const createRepository = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-run-config-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('RepositoryRunConfigService', () => {
  it('keeps a missing configuration empty and does not create files while reading', () => {
    const repoPath = createRepository();
    const service = new RepositoryRunConfigService();

    const state = service.read(repoPath);

    expect(state.exists).toBe(false);
    expect(state.config?.actions.run.steps).toEqual([]);
    expect(fs.existsSync(state.configPath)).toBe(false);
  });

  it('writes a validated configuration below .Open-Git-Control', () => {
    const repoPath = createRepository();
    const service = new RepositoryRunConfigService();
    const config = createEmptyRepositoryRunConfig();
    config.actions.test.steps.push({
      id: 'test',
      label: 'Test',
      parser: 'vitest-jest',
      windows: { shell: 'powershell', command: 'npm test' },
      macos: { shell: 'zsh', command: 'npm test' },
      linux: { shell: 'bash', command: 'npm test' },
    });

    service.write(repoPath, config);

    expect(JSON.parse(fs.readFileSync(path.join(repoPath, '.Open-Git-Control', 'run.json'), 'utf8'))).toEqual(config);
  });

  it('rejects unsupported shells instead of passing an arbitrary executable to the runner', () => {
    const config = createEmptyRepositoryRunConfig();
    config.actions.run.steps.push({
      id: 'run',
      label: 'Run',
      parser: 'none',
      windows: { shell: 'bash' as any, command: 'echo unsafe' },
    });

    expect(() => normalizeRepositoryRunConfig(config)).toThrow('not supported on windows');
  });
});
