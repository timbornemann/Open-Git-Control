import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeTextFileAtomically, writeTextFileAtomicallyAsync } from '../atomicFile';

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('ogc-atomic-file-'))
      throw new Error('Unsafe fixture');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('writeTextFileAtomically', () => {
  it('replaces a complete file and leaves no temporary artifact behind', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-atomic-file-'));
    temporaryDirectories.push(directory);
    const target = path.join(directory, 'settings.json');
    fs.writeFileSync(target, '{"old":true}', 'utf8');

    writeTextFileAtomically(target, '{"new":true}');

    expect(fs.readFileSync(target, 'utf8')).toBe('{"new":true}');
    expect(fs.readdirSync(directory)).toEqual(['settings.json']);
  });

  it('revalidates before asynchronous publication and cleans up the prepared replacement', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-atomic-file-'));
    temporaryDirectories.push(directory);
    const target = path.join(directory, 'settings.json');
    fs.writeFileSync(target, '{"old":true}');
    await expect(
      writeTextFileAtomicallyAsync(target, '{"new":true}', directory, async () => {
        await fs.promises.writeFile(target, '{"external":true}');
        return false;
      }),
    ).rejects.toThrow(/destination changed/);
    expect(fs.readFileSync(target, 'utf8')).toBe('{"external":true}');
    expect(fs.readdirSync(directory)).toEqual(['settings.json']);
  });

  it('writes the complete asynchronous replacement without exposing a temporary file', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-atomic-file-'));
    temporaryDirectories.push(directory);
    const target = path.join(directory, 'settings.json');
    await writeTextFileAtomicallyAsync(target, '{"new":true}', directory);
    expect(fs.readFileSync(target, 'utf8')).toBe('{"new":true}');
    expect(fs.readdirSync(directory)).toEqual(['settings.json']);
  });

  it('does not adopt an external change that occurs immediately after publication', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-atomic-file-'));
    temporaryDirectories.push(directory);
    const target = path.join(directory, 'settings.json');
    const rename = fs.promises.rename;
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (...args) => {
      await rename(...args);
      await fs.promises.writeFile(target, '{"external":"preserve this newer version"}');
    });
    const published = vi.fn();
    await expect(writeTextFileAtomicallyAsync(target, '{"new":true}', directory, async () => true, published)).rejects.toThrow('changed after publishing');
    expect(published).not.toHaveBeenCalled();
    expect(fs.readFileSync(target, 'utf8')).toBe('{"external":"preserve this newer version"}');
    expect(fs.readdirSync(directory)).toEqual(['settings.json']);
  });
});
