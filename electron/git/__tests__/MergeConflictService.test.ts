import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MergeConflictService } from '../MergeConflictService';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const createRepositoryFile = (contents: string) => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-conflict-'));
  temporaryDirectories.push(repoPath);
  fs.writeFileSync(path.join(repoPath, 'conflict.txt'), contents, 'utf8');
  return repoPath;
};

describe('MergeConflictService', () => {
  it('refuses to stage a file that still contains conflict markers', async () => {
    const repoPath = createRepositoryFile('<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n');
    const runCommand = vi.fn().mockResolvedValue('conflict.txt\0conflict-marker-size\0unspecified\0');
    const service = new MergeConflictService(() => repoPath, runCommand, { run: vi.fn() } as any);

    await expect(service.markFileResolved('conflict.txt')).rejects.toThrow('Conflict markers remain');
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith(['check-attr', '-z', 'conflict-marker-size', '--', 'conflict.txt']);
  });

  it('honors a conflict-marker-size of three from gitattributes', async () => {
    const repoPath = createRepositoryFile('<<< HEAD\nours\n===\ntheirs\n>>> feature\n');
    const runCommand = vi.fn().mockResolvedValue(['conflict.txt', 'conflict-marker-size', '3', ''].join('\0'));
    const service = new MergeConflictService(() => repoPath, runCommand, { run: vi.fn() } as any);

    await expect(service.markFileResolved('conflict.txt')).rejects.toThrow('Conflict markers remain');
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it('honors valid conflict marker sizes above 1024', async () => {
    const markerSize = 1025;
    const repoPath = createRepositoryFile(`${'<'.repeat(markerSize)} HEAD\nours\n${'='.repeat(markerSize)}\ntheirs\n${'>'.repeat(markerSize)} feature\n`);
    const runCommand = vi.fn().mockResolvedValue(['conflict.txt', 'conflict-marker-size', String(markerSize), ''].join('\0'));
    const service = new MergeConflictService(() => repoPath, runCommand, { run: vi.fn() } as any);

    await expect(service.markFileResolved('conflict.txt')).rejects.toThrow('Conflict markers remain');
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it('stages a clean conflict file with a literal pathspec', async () => {
    const repoPath = createRepositoryFile('resolved contents\n');
    const runCommand = vi.fn().mockResolvedValue('ok');
    const service = new MergeConflictService(() => repoPath, runCommand, { run: vi.fn() } as any);

    await expect(service.markFileResolved('conflict.txt')).resolves.toBe('ok');
    expect(runCommand).toHaveBeenNthCalledWith(1, ['check-attr', '-z', 'conflict-marker-size', '--', 'conflict.txt']);
    expect(runCommand).toHaveBeenNthCalledWith(2, ['add', '--', ':(literal)conflict.txt']);
  });

  it('does not treat a lone ======= markdown line as an unresolved conflict', async () => {
    // A legitimate setext-style Markdown rule of `=` must not be misread as a
    // conflict separator when there are no <<<<<<< / >>>>>>> markers.
    const repoPath = createRepositoryFile('Title\n=======\n\nBody text.\n');
    const runCommand = vi.fn().mockResolvedValue('ok');
    const service = new MergeConflictService(() => repoPath, runCommand, { run: vi.fn() } as any);

    await expect(service.markFileResolved('conflict.txt')).resolves.toBe('ok');
    expect(runCommand).toHaveBeenNthCalledWith(2, ['add', '--', ':(literal)conflict.txt']);
  });

  it('resolves a conflict by deleting the file (take deleted side)', async () => {
    const runCommand = vi.fn().mockResolvedValue('ok');
    const service = new MergeConflictService(() => '/repo', runCommand, { run: vi.fn() } as any);

    await expect(service.resolveConflictWithDeletion('gone.txt')).resolves.toBe('ok');
    expect(runCommand).toHaveBeenCalledWith(['rm', '-f', '--', ':(literal)gone.txt']);
  });
});
