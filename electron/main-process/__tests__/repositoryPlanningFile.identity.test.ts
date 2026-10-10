import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readRepositoryPlanningFile, readRepositoryPlanningFileAsync } from '../repositoryPlanningFile';

vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('fs')>()) }));

describe('committed planner repository identities', () => {
  let directory: string;
  let file: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-planning-identity-'));
    file = path.join(directory, 'planning.json');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('rejects additional projects without resolving their filesystem or network paths', async () => {
    const project = { id: 'local', name: 'Project', kind: 'repository', repoPath: directory, createdAt: 1, updatedAt: 1 };
    const outside = process.platform === 'win32' ? '\\\\attacker.invalid\\share' : '/outside/repository';
    const contents = JSON.stringify({ version: 1, projects: [project, { ...project, id: 'external', repoPath: outside }], items: [] });
    fs.writeFileSync(file, contents);
    // Never perform a real network lookup, even while testing the old path.
    const realpath = vi.spyOn(fs, 'realpathSync').mockImplementation((target) => {
      if (String(target) !== directory) throw new Error('Untrusted path lookup');
      return directory;
    });
    expect(() => readRepositoryPlanningFile(file, directory)).toThrow('only one project');
    await expect(readRepositoryPlanningFileAsync(file, directory)).rejects.toThrow('only one project');
    expect(realpath).not.toHaveBeenCalled();
    expect(fs.readFileSync(file, 'utf8')).toBe(contents);
  });

  it('binds a single project to the current checkout before resolving any stored path', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, projects: [{ id: 'project', name: 'Shared project', kind: 'repository', repoPath: '/other/machine' }], items: [] }),
    );
    const realpath = vi.spyOn(fs, 'realpathSync').mockImplementation(() => directory);
    expect(readRepositoryPlanningFile(file, directory).projects[0].repoPath).toBe(directory);
    expect(realpath.mock.calls.every(([target]) => String(target) === directory)).toBe(true);
  });
});
