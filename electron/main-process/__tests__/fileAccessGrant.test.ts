import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearSelectedFileGrants, getAuthorizedSelectedFile, grantSelectedFiles } from '../fileAccessGrant';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  clearSelectedFileGrants(101);
});

describe('file access grants', () => {
  it('authorizes only canonical files selected through the native dialog', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'open-git-control-grant-'));
    temporaryDirectories.push(directory);
    const selectedPath = path.join(directory, 'release.zip');
    const unselectedPath = path.join(directory, 'secret.txt');
    fs.writeFileSync(selectedPath, 'release');
    fs.writeFileSync(unselectedPath, 'secret');

    grantSelectedFiles(101, [selectedPath]);

    expect(getAuthorizedSelectedFile(101, selectedPath)).toBe(fs.realpathSync.native(selectedPath));
    expect(getAuthorizedSelectedFile(101, unselectedPath)).toBeNull();
    expect(getAuthorizedSelectedFile(102, selectedPath)).toBeNull();
  });
});
