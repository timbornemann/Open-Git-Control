import { describe, expect, it } from 'vitest';
import { getAvailableWorkingDirectoryCopyPath } from './workingDirectoryCopyName';

describe('getAvailableWorkingDirectoryCopyPath', () => {
  it('retains a file extension while keeping an existing file', () => {
    expect(getAvailableWorkingDirectoryCopyPath('config.json', 'file', ['config.json'])).toBe('config (copy).json');
  });

  it('increments the copy suffix until the destination is free', () => {
    expect(getAvailableWorkingDirectoryCopyPath('src/config.test.ts', 'file', ['src/config.test.ts', 'src/config.test (copy).ts'])).toBe(
      'src/config.test (copy 2).ts',
    );
  });

  it('does not treat a leading dot as a file extension', () => {
    expect(getAvailableWorkingDirectoryCopyPath('.env', 'file', ['.env'])).toBe('.env (copy)');
  });

  it('creates a distinct folder name without an extension', () => {
    expect(getAvailableWorkingDirectoryCopyPath('src/components', 'directory', ['src/components'])).toBe('src/components (copy)');
  });
});
