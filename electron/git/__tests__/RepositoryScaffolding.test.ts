import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeRepositoryInitializationOptions, scaffoldInitializedRepository } from '../RepositoryScaffolding';

describe('RepositoryScaffolding', () => {
  const repositories: string[] = [];

  const createRepositoryDirectory = () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-repository-scaffold-'));
    repositories.push(repoPath);
    return repoPath;
  };

  afterEach(() => {
    while (repositories.length > 0) {
      fs.rmSync(repositories.pop()!, { recursive: true, force: true });
    }
  });

  it('creates the selected README and license files without touching other paths', () => {
    const repoPath = createRepositoryDirectory();
    const options = normalizeRepositoryInitializationOptions({ createReadme: true, license: 'MIT', copyrightHolder: 'Example Organization' });

    expect(scaffoldInitializedRepository(repoPath, options)).toEqual(['README.md', 'LICENSE']);
    expect(fs.readFileSync(path.join(repoPath, 'README.md'), 'utf8')).toContain('Open Git Control');
    expect(fs.readFileSync(path.join(repoPath, 'LICENSE'), 'utf8')).toContain('Example Organization');
  });

  it('never overwrites existing README or LICENSE files during initialization', () => {
    const repoPath = createRepositoryDirectory();
    fs.writeFileSync(path.join(repoPath, 'README.md'), 'existing readme\n');
    fs.writeFileSync(path.join(repoPath, 'LICENSE'), 'existing license\n');
    const options = normalizeRepositoryInitializationOptions({ createReadme: true, license: 'ISC', copyrightHolder: 'Example Organization' });

    expect(scaffoldInitializedRepository(repoPath, options)).toEqual([]);
    expect(fs.readFileSync(path.join(repoPath, 'README.md'), 'utf8')).toBe('existing readme\n');
    expect(fs.readFileSync(path.join(repoPath, 'LICENSE'), 'utf8')).toBe('existing license\n');
  });

  it('creates the GNU application notice without modifying the bundled GPL text', () => {
    const repoPath = createRepositoryDirectory();
    const options = normalizeRepositoryInitializationOptions({
      license: 'GPL-3.0-only',
      copyrightHolder: 'Example Organization',
      programName: 'Example App',
      programDescription: 'manages example data',
    });

    expect(scaffoldInitializedRepository(repoPath, options)).toEqual(['LICENSE', 'NOTICE']);
    expect(fs.readFileSync(path.join(repoPath, 'LICENSE'), 'utf8')).toContain('<name of author>');
    expect(fs.readFileSync(path.join(repoPath, 'NOTICE'), 'utf8')).toContain('Example App — manages example data');
  });

  it('rejects holder-based licenses without valid attribution', () => {
    expect(() => normalizeRepositoryInitializationOptions({ license: 'MIT', copyrightHolder: '' })).toThrow('copyright holder');
    expect(() => normalizeRepositoryInitializationOptions({ license: 'GPL-3.0-only', copyrightHolder: 'Example Organization' })).toThrow('program name');
    expect(() => normalizeRepositoryInitializationOptions({ license: 'invalid' })).toThrow('Invalid license template');
  });
});
