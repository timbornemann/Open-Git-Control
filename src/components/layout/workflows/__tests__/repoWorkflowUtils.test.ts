import { describe, expect, it } from 'vitest';
import {
  deriveRepoNameFromCloneSource,
  isCloneSourceLikelyRemote,
  normalizeGitHost,
  normalizeRepoPointer,
  parseGithubRepoReference,
  splitRepoPath,
  stripGitSuffix,
} from '@/components/layout/workflows/repoWorkflowUtils';

describe('repoWorkflowUtils', () => {
  it('normalizes repository names and filesystem pointers', () => {
    expect(stripGitSuffix(' demo.git ')).toBe('demo');
    expect(stripGitSuffix(' .git ')).toBe('.git');
    expect(stripGitSuffix('')).toBe('');

    expect(splitRepoPath('C:\\repos\\demo\\')).toEqual({ parentDir: 'C:\\repos', baseName: 'demo' });
    expect(splitRepoPath('C:')).toEqual({ parentDir: '.', baseName: 'C:' });
    expect(splitRepoPath('C:\\')).toEqual({ parentDir: '.', baseName: 'C:' });
    expect(splitRepoPath('/tmp/project')).toEqual({ parentDir: '/tmp', baseName: 'project' });
    expect(splitRepoPath('')).toEqual({ parentDir: '.', baseName: 'repository' });

    expect(normalizeRepoPointer('file:///C:\\Repos\\Demo\\')).toBe('/c:/repos/demo');
    expect(normalizeRepoPointer(' /Users/tim/demo/ ')).toBe('/users/tim/demo');
  });

  it('derives clone target names and detects remote clone sources', () => {
    expect(deriveRepoNameFromCloneSource('https://github.com/octo/hello-world.git')).toBe('hello-world');
    expect(deriveRepoNameFromCloneSource('git@github.com:octo/service.git')).toBe('service');
    expect(deriveRepoNameFromCloneSource('ssh://git@github.com/octo/api/')).toBe('api');
    expect(deriveRepoNameFromCloneSource('')).toBe('repository');

    expect(isCloneSourceLikelyRemote('https://github.com/octo/hello.git')).toBe(true);
    expect(isCloneSourceLikelyRemote('ssh://git@github.com/octo/hello.git')).toBe(true);
    expect(isCloneSourceLikelyRemote('git@github.com:octo/hello.git')).toBe(true);
    expect(isCloneSourceLikelyRemote('C:\\repos\\hello')).toBe(false);
  });

  it('normalizes git hosts and parses GitHub-style repository references', () => {
    expect(normalizeGitHost(' https://www.GitHub.COM/ ')).toBe('github.com');
    expect(normalizeGitHost('')).toBe('github.com');

    expect(parseGithubRepoReference('https://github.com/octo/hello-world.git')).toEqual({
      host: 'github.com',
      owner: 'octo',
      repo: 'hello-world',
    });
    expect(parseGithubRepoReference('git@github.enterprise.local:platform/api.git')).toEqual({
      host: 'github.enterprise.local',
      owner: 'platform',
      repo: 'api',
    });
    expect(parseGithubRepoReference('ssh://git@github.com/platform/api.git')).toEqual({
      host: 'github.com',
      owner: 'platform',
      repo: 'api',
    });
    expect(parseGithubRepoReference('ftp://github.com/octo/hello')).toBeNull();
    expect(parseGithubRepoReference('https://github.com/only-owner')).toBeNull();
    expect(parseGithubRepoReference('')).toBeNull();
  });
});
