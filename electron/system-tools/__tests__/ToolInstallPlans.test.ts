import { describe, expect, it, vi } from 'vitest';
import { ToolExecutableResolver } from '../ToolExecutableResolver';
import { ToolInstallPlans } from '../ToolInstallPlans';
import { executeToolInstall } from '../ToolInstaller';

function fixture(platform: string, release = '', version = '2.83.0', missing: string[] = []) {
  const resolver = new ToolExecutableResolver({
    platform,
    env: { PATH: platform === 'win32' ? 'C:\\tools' : '/tools' },
    exists: (file) => !missing.some((part) => file.includes(part)),
    run: vi.fn().mockResolvedValue({ stdout: `Candidate: ${version}\nVersion: ${version}`, stderr: '' }),
  });
  return new ToolInstallPlans(resolver, () => release);
}
describe('fixed system install plans', () => {
  it.each([
    ['git', 'Git.Git'],
    ['git-lfs', 'GitHub.GitLFS'],
    ['github-cli', 'GitHub.cli'],
  ] as const)('uses the exact Windows package for %s', async (id, packageName) => {
    const install = (await fixture('win32').resolve(id))!;
    expect(install.plan).toMatchObject({ available: true, packageName, source: 'winget' });
    expect(install.args).toEqual(['install', '--id', packageName, '--exact', '--source', 'winget', '--disable-interactivity']);
    expect(install.args.join(' ')).not.toContain('accept');
  });
  it('offers manual instructions when Homebrew or WinGet is absent', async () => {
    expect((await fixture('darwin', '', '', ['brew']).resolve('git'))?.plan).toMatchObject({ available: false, command: 'brew install git' });
    expect((await fixture('win32', '', '', ['winget']).resolve('git'))?.plan.available).toBe(false);
  });
  it.each([
    ['ID=debian', 'apt-get', 'gh'],
    ['ID=fedora', 'dnf', 'gh'],
    ['ID=arch', 'pacman', 'github-cli'],
    ['ID=opensuse-tumbleweed', 'zypper', 'gh'],
  ] as const)('uses existing %s distribution sources', async (release, method, pkg) => {
    const install = (await fixture('linux', release).resolve('github-cli'))!;
    expect(install.plan).toMatchObject({ available: true, method, packageName: pkg });
    expect(install.args[0]).toBe('--disable-internal-agent');
    expect(install.args).not.toContain('update');
    expect(install.plan.command).not.toContain('curl');
  });
  it.each(['2.45.0', '2.46.1', '1:2.45.0-1'])('does not auto-install a known broken CLI version %s', async (version) => {
    const install = await fixture('linux', 'ID=ubuntu', version).resolve('github-cli');
    expect(install?.plan).toMatchObject({ available: false, reason: expect.stringContaining('retired GitHub APIs') });
  });
  it('requires a package candidate and graphical elevation, and leaves unknown systems manual', async () => {
    expect((await fixture('linux', 'ID=debian', '(none)').resolve('git-lfs'))?.plan.available).toBe(false);
    expect((await fixture('linux', 'ID=debian', '2.52.0', ['pkexec']).resolve('git'))?.plan.available).toBe(false);
    expect(await fixture('linux', 'ID=unknown').resolve('git')).toBeNull();
    expect(await fixture('other').resolve('git')).toBeNull();
  });
  it('uses Homebrew as the current user and only uses UAC when WinGet requires it', async () => {
    const brew = (await fixture('darwin').resolve('git-lfs'))!;
    const run = vi.fn().mockResolvedValue({ exitCode: 0, output: '' });
    await executeToolInstall(brew, false, run);
    expect(run).toHaveBeenCalledExactlyOnceWith('/tools/brew', ['install', 'git-lfs']);
    run.mockReset().mockResolvedValueOnce({ exitCode: 0x8a150019, output: 'requires administrator' }).mockResolvedValueOnce({ exitCode: 0, output: '' });
    await executeToolInstall((await fixture('win32').resolve('git'))!, false, run);
    expect(run.mock.calls[1][0]).toContain('powershell.exe');
    expect(run.mock.calls[1][1].join(' ')).toContain('-Verb RunAs -WindowStyle Hidden');
  });
});
