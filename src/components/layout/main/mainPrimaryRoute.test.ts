import { describe, expect, it } from 'vitest';
import { getMainPrimaryRoute, hasMainPrimaryHeader } from './mainPrimaryRoute';

const base = {
  activeConflictPath: null,
  activeDiffRequest: null,
  activeTab: 'localRepos' as const,
  showRecoveryCenter: false,
  showTimeline: false,
  showRunConsole: false,
};

describe('local repository primary route', () => {
  it('uses the standalone view even when repository detail state remains mounted', () => {
    expect(getMainPrimaryRoute({ ...base, activeConflictPath: 'conflicted.txt', showTimeline: true })).toBe('localRepos');
    expect(hasMainPrimaryHeader('localRepos')).toBe(false);
  });

  it('shows run configuration as a repository subpage with its own header', () => {
    expect(getMainPrimaryRoute({ ...base, activeTab: 'repo', showRunConfig: true, showRunConsole: true })).toBe('runConfig');
    expect(getMainPrimaryRoute({ ...base, activeTab: 'settings', showRunConfig: true })).toBe('settings');
    expect(hasMainPrimaryHeader('runConfig')).toBe(true);
  });
});
