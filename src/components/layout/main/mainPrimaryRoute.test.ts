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
  it('shows the standalone analytics tab ahead of lingering repository subpages and file details', () => {
    expect(
      getMainPrimaryRoute({
        ...base,
        activeTab: 'analytics',
        showRunConfig: true,
        showRemoteConfig: true,
        showReleaseCreator: true,
        showRecoveryCenter: true,
        activeConflictPath: 'conflict.ts',
        showTimeline: true,
        activeDiffRequest: { source: 'commit', path: 'a.ts' },
      }),
    ).toBe('analytics');
    expect(hasMainPrimaryHeader('analytics')).toBe(false);
    expect(getMainPrimaryRoute({ ...base, activeTab: 'repo' })).toBe('graph');
  });
  it('opens repository publication in the repository subpage ahead of timeline and file details', () => {
    expect(
      getMainPrimaryRoute({
        ...base,
        activeTab: 'repo',
        showRepositoryPublication: true,
        showTimeline: true,
        showRemoteConfig: true,
        activeDiffRequest: { filePath: 'file' } as never,
      }),
    ).toBe('repositoryPublication');
    expect(hasMainPrimaryHeader('repositoryPublication')).toBe(true);
    expect(getMainPrimaryRoute({ ...base, activeTab: 'hosting', showRepositoryPublication: true })).toBe('hosting');
  });
  it('opens repository allowlist settings with a header ahead of detail views', () => {
    expect(
      getMainPrimaryRoute({
        ...base,
        activeTab: 'repo',
        showSecretScanAllowlist: true,
        showReleaseCreator: true,
        activeDiffRequest: { filePath: 'file' } as never,
      }),
    ).toBe('secretScanAllowlist');
    expect(getMainPrimaryRoute({ ...base, activeTab: 'hosting', showSecretScanAllowlist: true })).toBe('hosting');
    expect(hasMainPrimaryHeader('secretScanAllowlist')).toBe(true);
  });
  it('uses the standalone view even when repository detail state remains mounted', () => {
    expect(getMainPrimaryRoute({ ...base, activeConflictPath: 'conflicted.txt', showTimeline: true })).toBe('localRepos');
    expect(hasMainPrimaryHeader('localRepos')).toBe(false);
  });

  it('shows run configuration as a repository subpage with its own header', () => {
    expect(getMainPrimaryRoute({ ...base, activeTab: 'repo', showRunConfig: true, showRunConsole: true })).toBe('runConfig');
    expect(getMainPrimaryRoute({ ...base, activeTab: 'settings', showRunConfig: true })).toBe('settings');
    expect(hasMainPrimaryHeader('runConfig')).toBe(true);
  });
  it('opens the full release creator as a repository subpage ahead of other detail panes', () => {
    expect(getMainPrimaryRoute({ ...base, activeTab: 'repo', showReleaseCreator: true, showRemoteConfig: true, showRunConfig: true, showTimeline: true })).toBe(
      'releaseCreator',
    );
    expect(hasMainPrimaryHeader('releaseCreator')).toBe(true);
    expect(getMainPrimaryRoute({ ...base, activeTab: 'hosting', showReleaseCreator: true })).toBe('hosting');
  });
  it('shows remote configuration before repository detail panes and keeps non-repository navigation independent', () => {
    expect(
      getMainPrimaryRoute({ ...base, activeTab: 'repo', showRemoteConfig: true, showRunConfig: true, showTimeline: true, activeConflictPath: 'file' }),
    ).toBe('remoteConfig');
    expect(getMainPrimaryRoute({ ...base, activeTab: 'settings', showRemoteConfig: true })).toBe('settings');
    expect(hasMainPrimaryHeader('remoteConfig')).toBe(true);
  });
});
