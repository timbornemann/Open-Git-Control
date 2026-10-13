import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeTextFileAtomically, writeTextFileAtomicallyAsync } from '../atomicFile';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
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
});
