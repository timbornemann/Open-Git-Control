import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryFiles } from '../RepositoryFiles';

describe('RepositoryFiles text preview encoding', () => {
  const repositories: string[] = [];

  afterEach(() => {
    while (repositories.length > 0) {
      fs.rmSync(repositories.pop()!, { recursive: true, force: true });
    }
  });

  it('decodes UTF-16 staged and committed Markdown instead of forcing UTF-8', async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('# Überschrift', 'utf16le')]);
    const readGitFileBuffer = vi.fn().mockResolvedValue(utf16);
    const files = new RepositoryFiles(() => 'C:/repo', readGitFileBuffer);

    await expect(files.readRepositoryFileTextAtSource('staged', 'README.md')).resolves.toBe('# Überschrift');
    await expect(files.readRepositoryFileTextAtSource('commit', 'README.md', 'a'.repeat(40))).resolves.toBe('# Überschrift');
  });

  it('deletes only an existing repository-relative file', async () => {
    const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-repository-files-'));
    repositories.push(repositoryPath);
    fs.writeFileSync(path.join(repositoryPath, 'NOTICE'), 'notice\n');
    const files = new RepositoryFiles(() => repositoryPath, vi.fn());

    await files.deleteRepoFileAtPath(repositoryPath, 'NOTICE');

    expect(fs.existsSync(path.join(repositoryPath, 'NOTICE'))).toBe(false);
    await expect(files.deleteRepoFileAtPath(repositoryPath, '../NOTICE')).rejects.toThrow('repository-relative');
  });

  it('refuses to preview or overwrite a file reached through a symbolic link', async () => {
    const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-repository-files-symlink-'));
    repositories.push(repositoryPath);
    const targetDirectory = path.join(repositoryPath, 'target');
    fs.mkdirSync(targetDirectory);
    fs.writeFileSync(path.join(targetDirectory, 'note.txt'), 'original\n', 'utf8');
    fs.symlinkSync(targetDirectory, path.join(repositoryPath, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const files = new RepositoryFiles(() => repositoryPath, vi.fn());

    await expect(files.readRepoFileAtPath(repositoryPath, 'linked/note.txt')).rejects.toThrow(/symbolic link/);
    await expect(files.writeRepoFileAtPath(repositoryPath, 'linked/note.txt', 'changed\n')).rejects.toThrow(/symbolic link/);
    expect(fs.readFileSync(path.join(targetDirectory, 'note.txt'), 'utf8')).toBe('original\n');
  });
});
