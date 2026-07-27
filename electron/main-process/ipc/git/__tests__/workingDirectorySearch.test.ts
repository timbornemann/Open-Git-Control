import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../../../../src/types/ipcContract';
import { registerWorkingDirectorySearchHandlers } from '../workingDirectorySearch';

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
}));

describe('working-directory search handlers', () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  const repoPath = 'C:/repos/search-test';
  let files: Map<string, string>;
  let runCommandAtPath: ReturnType<typeof vi.fn>;
  let readRepoFileAtPath: ReturnType<typeof vi.fn>;
  let writeRepoFileAtPath: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handlers.clear();
    files = new Map([
      ['docs/my-app.md', 'The APP documentation.\n'],
      ['src/app.ts', 'const app = true;\napp();\n'],
      ['src/application.ts', 'export const application = "app";\n'],
    ]);
    handleMock.mockReset().mockImplementation((channel: string, handler: (...args: any[]) => Promise<any>) => handlers.set(channel, handler));
    runCommandAtPath = vi.fn().mockImplementation(async () => `${[...files.keys()].join('\0')}\0`);
    readRepoFileAtPath = vi.fn().mockImplementation(async (_repoPath: string, filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) throw new Error('File is not searchable.');
      return content;
    });
    writeRepoFileAtPath = vi.fn().mockImplementation(async (_repoPath: string, filePath: string, content: string) => {
      files.set(filePath, content);
    });
    registerWorkingDirectorySearchHandlers({
      gitService: {
        getRepoPath: () => repoPath,
        runCommandAtPath,
        readRepoFileAtPath,
        writeRepoFileAtPath,
      } as any,
    });
  });

  it('prioritizes exact file names before prefix and path matches', async () => {
    files.set('src/app.tsx', 'export {};\n');
    files.set('docs/my-app.ts', 'export {};\n');
    const result = await handlers.get(IpcChannel.GitSearchWorkingDirectory)?.({}, { query: 'app.ts', mode: 'filename', caseSensitive: false }, repoPath);

    expect(result.success).toBe(true);
    expect(result.data.files.map((file: { path: string }) => file.path)).toEqual(['src/app.ts', 'src/app.tsx', 'docs/my-app.ts']);
    expect(runCommandAtPath).toHaveBeenCalledWith(repoPath, ['-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  });

  it('treats regular-expression characters as literal search text', async () => {
    const result = await handlers.get(IpcChannel.GitSearchWorkingDirectory)?.({}, { query: 'app()', mode: 'content', caseSensitive: true }, repoPath);

    expect(result).toMatchObject({
      success: true,
      data: {
        totalMatches: 1,
        files: [expect.objectContaining({ path: 'src/app.ts', matches: [expect.objectContaining({ line: 2, column: 1 })] })],
      },
    });
  });

  it('returns grouped content matches with one-based line and column locations', async () => {
    const result = await handlers.get(IpcChannel.GitSearchWorkingDirectory)?.({}, { query: 'app', mode: 'content', caseSensitive: false }, repoPath);

    expect(result).toMatchObject({
      success: true,
      data: {
        totalMatches: 5,
        scannedFiles: 3,
        truncated: false,
      },
    });
    expect(result.data.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/app.ts',
          matches: [expect.objectContaining({ line: 1, column: 7 }), expect.objectContaining({ line: 2, column: 1 })],
        }),
      ]),
    );
  });

  it('replaces one selected occurrence only when the result is still current', async () => {
    const result = await handlers.get(IpcChannel.GitReplaceWorkingDirectory)?.(
      {},
      {
        query: 'app',
        replacement: 'service',
        target: { path: 'src/app.ts', line: 2, column: 1 },
      },
      repoPath,
    );

    expect(result).toEqual({ success: true, data: { replacements: 1, paths: ['src/app.ts'] } });
    expect(files.get('src/app.ts')).toBe('const app = true;\nservice();\n');

    const staleResult = await handlers.get(IpcChannel.GitReplaceWorkingDirectory)?.(
      {},
      {
        query: 'app',
        replacement: 'service',
        target: { path: 'src/app.ts', line: 2, column: 1 },
      },
      repoPath,
    );
    expect(staleResult).toMatchObject({ success: false, error: expect.stringContaining('no longer available') });
  });

  it('replace all rescans every candidate file and skips non-text files', async () => {
    files.set('asset.bin', 'not used by read mock');
    readRepoFileAtPath.mockImplementation(async (_repoPath: string, filePath: string) => {
      if (filePath === 'asset.bin') throw new Error('This file appears to be binary.');
      const content = files.get(filePath);
      if (content === undefined) throw new Error('Missing file.');
      return content;
    });

    const result = await handlers.get(IpcChannel.GitReplaceWorkingDirectory)?.(
      {},
      { query: 'app', replacement: 'tool', caseSensitive: false, all: true },
      repoPath,
    );

    expect(result).toMatchObject({ success: true, data: { replacements: 5 } });
    expect(result.data.paths).toEqual(['docs/my-app.md', 'src/app.ts', 'src/application.ts']);
    expect(files.get('docs/my-app.md')).toBe('The tool documentation.\n');
    expect(files.get('src/app.ts')).toBe('const tool = true;\ntool();\n');
  });

  it('rolls back already written files when replace all cannot publish a later file', async () => {
    writeRepoFileAtPath.mockImplementation(async (_repoPath: string, filePath: string, content: string) => {
      if (filePath === 'src/app.ts' && content.includes('tool')) throw new Error('Write failed.');
      files.set(filePath, content);
    });

    const result = await handlers.get(IpcChannel.GitReplaceWorkingDirectory)?.(
      {},
      { query: 'app', replacement: 'tool', caseSensitive: false, all: true },
      repoPath,
    );

    expect(result).toMatchObject({ success: false, error: 'Write failed.' });
    expect(files.get('docs/my-app.md')).toBe('The APP documentation.\n');
  });
});
