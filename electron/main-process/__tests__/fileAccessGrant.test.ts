import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSelectedFileGrants,
  getAuthorizedProjectParentDirectory,
  getAuthorizedSelectedFile,
  grantSelectedFiles,
  grantSelectedProjectParentDirectory,
} from '../fileAccessGrant';

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

  it('authorizes an exact native-selected project parent only for the selecting renderer', () => {
    const selectedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-project-parent-'));
    temporaryDirectories.push(selectedDirectory);

    grantSelectedProjectParentDirectory(101, selectedDirectory);

    expect(getAuthorizedProjectParentDirectory(101, selectedDirectory)).toBe(fs.realpathSync.native(selectedDirectory));
    expect(getAuthorizedProjectParentDirectory(102, selectedDirectory)).toBeNull();
    expect(getAuthorizedProjectParentDirectory(101, '')).toBeNull();
  });
});
