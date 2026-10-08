import { describe, expect, it, vi } from 'vitest';
import { ToolExecutableResolver } from '../ToolExecutableResolver';
import { runToolProcess } from '../ToolProcess';
import fs from 'node:fs';

describe('system executable discovery', () => {
  it('verifies executable Windows aliases even when stat is denied', async () => {
    const stat = vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw Object.assign(new Error('alias stat denied'), { code: 'EACCES' });
    });
    try {
      const run = vi.fn().mockResolvedValue({ stdout: 'v1.29.0', stderr: '' });
      const resolver = new ToolExecutableResolver({ platform: 'win32', env: { PATH: 'C:\\WindowsApps' }, run });
      expect(await resolver.find('winget')).toBe('C:\\WindowsApps\\winget.exe');
      expect(run).toHaveBeenCalledWith('C:\\WindowsApps\\winget.exe', ['--version']);
    } finally {
      stat.mockRestore();
    }
  });
  it('distinguishes missing, broken and working executables and ignores relative PATH entries', async () => {
    const run = vi.fn().mockRejectedValue(new Error('permission denied'));
    const resolver = new ToolExecutableResolver({
      platform: 'linux',
      env: { PATH: '.:./repository/bin:/safe/bin' },
      exists: (name) => name === '/safe/bin/git',
      run,
    });
    expect(await resolver.inspect('github-cli')).toMatchObject({ state: 'missing', required: false });
    expect(await resolver.inspect('git')).toMatchObject({ state: 'unusable', detail: 'permission denied' });
    expect(run).toHaveBeenCalledExactlyOnceWith('/safe/bin/git', ['--version']);
    run.mockResolvedValue({ stdout: 'git version 2.52.0\n', stderr: '' });
    expect(await resolver.inspect('git')).toMatchObject({ state: 'available', version: '2.52.0', executable: '/safe/bin/git' });
  });
  it('finds Homebrew programs without requiring a new app process', async () => {
    const resolver = new ToolExecutableResolver({
      platform: 'darwin',
      env: { PATH: '/usr/bin' },
      exists: (file) => file === '/opt/homebrew/bin/git',
      run: vi.fn().mockResolvedValue({ stdout: 'git version 2.52.0', stderr: '' }),
    });
    expect(await resolver.inspect('git')).toMatchObject({ state: 'available', executable: '/opt/homebrew/bin/git' });
  });
  it('does not invoke the Apple Git placeholder when developer tools are absent', async () => {
    const run = vi.fn().mockRejectedValue(new Error('developer directory missing'));
    const resolver = new ToolExecutableResolver({ platform: 'darwin', env: { PATH: '/usr/bin' }, exists: (file) => file === '/usr/bin/git', run });
    expect(await resolver.inspect('git')).toMatchObject({ state: 'missing' });
    expect(run).toHaveBeenCalledExactlyOnceWith('/usr/bin/xcode-select', ['-p']);
  });
  it('uses newly written Windows installation information and locates bundled LFS', async () => {
    let installed = false;
    const run = vi.fn(async (exe: string, args: string[]) => {
      if (exe.endsWith('reg.exe')) {
        if (installed && args.includes('InstallPath')) return { stdout: ' InstallPath REG_SZ D:\\Applications\\Git\n', stderr: '' };
        throw new Error('key absent');
      }
      return { stdout: exe.includes('git-lfs') ? 'git-lfs/3.7.0 (windows amd64)' : 'git version 2.52.0.windows.1', stderr: '' };
    });
    const resolver = new ToolExecutableResolver({
      platform: 'win32',
      env: { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows' },
      exists: (file) => installed && ['D:\\Applications\\Git\\cmd\\git.exe', 'D:\\Applications\\Git\\mingw64\\bin\\git-lfs.exe'].includes(file),
      run,
    });
    await resolver.refreshLocations();
    expect((await resolver.inspect('git')).state).toBe('missing');
    installed = true;
    await resolver.refreshLocations();
    const git = await resolver.inspect('git');
    expect(git.executable).toBe('D:\\Applications\\Git\\cmd\\git.exe');
    expect(await resolver.inspect('git-lfs', git)).toMatchObject({ state: 'available', version: '3.7.0' });
  });
  it('rereads the current PATH and rejects executables which return an unrelated version', async () => {
    const env = { PATH: '/old' };
    const run = vi.fn().mockResolvedValue({ stdout: 'another tool', stderr: '' });
    const resolver = new ToolExecutableResolver({ platform: 'linux', env, exists: (file) => file === '/new/gh', run });
    expect((await resolver.inspect('github-cli')).state).toBe('missing');
    env.PATH = '/new';
    expect((await resolver.inspect('github-cli')).state).toBe('unusable');
    run.mockResolvedValue({ stdout: 'gh version 2.83.0 (2026-10-01)', stderr: '' });
    expect(await resolver.inspect('github-cli')).toMatchObject({ state: 'available', version: '2.83.0' });
  });
  it('bounds real probe processes without invoking any installer', async () => {
    expect(await runToolProcess(process.execPath, ['--version'])).toMatchObject({ stdout: expect.stringMatching(/^v\d+/) });
    await expect(runToolProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 200)).rejects.toThrow();
  }, 10000);
});
