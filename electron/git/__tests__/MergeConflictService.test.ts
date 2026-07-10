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
    const runCommand = vi.fn();
    const service = new MergeConflictService(() => repoPath, runCommand, { run: vi.fn() } as any);

    await expect(service.markFileResolved('conflict.txt')).rejects.toThrow('Conflict markers remain');
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('stages a clean conflict file with a literal pathspec', async () => {
    const repoPath = createRepositoryFile('resolved contents\n');
    const runCommand = vi.fn().mockResolvedValue('ok');
    const service = new MergeConflictService(() => repoPath, runCommand, { run: vi.fn() } as any);

    await expect(service.markFileResolved('conflict.txt')).resolves.toBe('ok');
    expect(runCommand).toHaveBeenCalledWith(['add', '--', ':(literal)conflict.txt']);
  });
});
