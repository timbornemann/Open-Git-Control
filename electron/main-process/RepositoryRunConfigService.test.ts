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
    expect(fs.existsSync(path.join(repoPath, '.Open-Git-Control', 'README.md'))).toBe(false);
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
    const readme = fs.readFileSync(path.join(repoPath, '.Open-Git-Control', 'README.md'), 'utf8');
    expect(readme).toContain('repository-local workflow configuration');
    expect(readme).toContain('https://github.com/timbornemann/Open-Git-Control');
    expect(readme).toContain('https://github.com/timbornemann/Open-Git-Control/releases');
  });

  it('keeps an existing run-workflow README unchanged', () => {
    const repoPath = createRepository();
    const readmePath = path.join(repoPath, '.Open-Git-Control', 'README.md');
    fs.mkdirSync(path.dirname(readmePath));
    fs.writeFileSync(readmePath, '# Team-specific workflow notes\n', 'utf8');

    new RepositoryRunConfigService().write(repoPath, createEmptyRepositoryRunConfig());

    expect(fs.readFileSync(readmePath, 'utf8')).toBe('# Team-specific workflow notes\n');
  });

  it('rejects a symlinked run-configuration directory', () => {
    const repoPath = createRepository();
    const externalDirectory = createRepository();
    const configDirectory = path.join(repoPath, '.Open-Git-Control');
    try {
      fs.symlinkSync(externalDirectory, configDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      // Some locked-down Windows environments disallow creating junctions. The
      // production path is still covered where the platform permits them.
      return;
    }

    expect(() => new RepositoryRunConfigService().write(repoPath, createEmptyRepositoryRunConfig())).toThrow('cannot be a symbolic link');
    expect(fs.existsSync(path.join(externalDirectory, 'run.json'))).toBe(false);
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
