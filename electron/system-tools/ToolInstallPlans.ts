import * as fs from 'node:fs';
import type { SystemToolId, SystemToolInstallPlan } from '../../src/shared/ipc/systemTools';
import type { ToolExecutableResolver } from './ToolExecutableResolver';

export type ResolvedToolInstall = {
  plan: SystemToolInstallPlan;
  executable: string;
  args: string[];
};
const packages = { git: 'git', 'git-lfs': 'git-lfs', 'github-cli': 'gh' };
const windowsPackages = { git: 'Git.Git', 'git-lfs': 'GitHub.GitLFS', 'github-cli': 'GitHub.cli' };
export const brokenCliPackage = (version: string) => /(?:^|:)2\.(?:45|46)\./.test(version);
function distributionManager(release: string) {
  const ids = [...release.matchAll(/^(?:ID|ID_LIKE)=["']?([^\r\n"']+)/gm)].flatMap((match) => match[1].split(/\s+/));
  if (ids.some((value) => ['debian', 'ubuntu', 'linuxmint', 'pop'].includes(value))) return 'apt-get';
  if (ids.some((value) => ['fedora', 'rhel', 'centos', 'rocky', 'almalinux'].includes(value))) return 'dnf';
  if (ids.some((value) => ['arch', 'manjaro', 'endeavouros'].includes(value))) return 'pacman';
  if (ids.some((value) => ['suse', 'opensuse', 'opensuse-leap', 'opensuse-tumbleweed', 'sles'].includes(value))) return 'zypper';
  return null;
}

export class ToolInstallPlans {
  constructor(
    private readonly resolver: ToolExecutableResolver,
    private readonly readRelease = () => fs.readFileSync('/etc/os-release', 'utf8'),
  ) {}

  async resolve(id: SystemToolId): Promise<ResolvedToolInstall | null> {
    const platform = this.resolver.platform;
    if (platform === 'win32') {
      const executable = await this.resolver.find('winget');
      const packageName = windowsPackages[id];
      const args = ['install', '--id', packageName, '--exact', '--source', 'winget', '--disable-interactivity'];
      return {
        executable: executable || '',
        args,
        plan: {
          method: 'winget',
          packageName,
          source: 'winget',
          command: `winget install --id ${packageName} --exact --source winget`,
          available: Boolean(executable),
          ...(!executable ? { reason: 'WinGet is not installed or cannot be found.' } : {}),
        },
      };
    }
    if (platform === 'darwin') {
      const executable = await this.resolver.find('brew');
      const packageName = packages[id];
      return {
        executable: executable || '',
        args: ['install', packageName],
        plan: {
          method: 'brew',
          packageName,
          source: 'Homebrew',
          command: `brew install ${packageName}`,
          available: Boolean(executable),
          ...(!executable ? { reason: 'Homebrew is not installed or cannot be found.' } : {}),
        },
      };
    }
    if (platform !== 'linux') return null;
    let release = '';
    try {
      release = this.readRelease();
    } catch {
      /* Unknown distributions use manual instructions. */
    }
    const method = distributionManager(release);
    if (!method) return null;
    const executable = await this.resolver.find(method);
    const pkexec = await this.resolver.find('pkexec');
    const packageName = id === 'github-cli' && method === 'pacman' ? 'github-cli' : packages[id];
    const packageArgs =
      method === 'apt-get' || method === 'dnf'
        ? ['install', '-y', packageName]
        : method === 'pacman'
          ? ['-S', '--needed', '--noconfirm', packageName]
          : ['--non-interactive', 'install', packageName];
    let reason = !executable
      ? 'The distribution package manager was not found.'
      : !pkexec
        ? 'A graphical Polkit installation service was not found.'
        : undefined;
    if (!reason && executable) {
      try {
        const queryExecutable = method === 'apt-get' ? await this.resolver.find('apt-cache') : executable;
        if (!queryExecutable) throw new Error('Package information is unavailable.');
        const queryArgs =
          method === 'apt-get'
            ? ['policy', packageName]
            : method === 'pacman'
              ? ['-Si', packageName]
              : method === 'dnf'
                ? ['--cacheonly', 'info', packageName]
                : ['--non-interactive', 'info', packageName];
        const { stdout } = await this.resolver.run(queryExecutable, queryArgs, 12000);
        const version = /(?:Candidate|Version)\s*:\s*([^\s]+)/i.exec(stdout)?.[1];
        if (!version || version === '(none)') reason = 'No package is available in the existing configured sources. Use the official instructions.';
        else if (id === 'github-cli' && brokenCliPackage(version)) reason = 'This CLI package version uses retired GitHub APIs. Use the official instructions.';
      } catch {
        reason = 'The package could not be verified in existing sources. Use the official instructions.';
      }
    }
    return {
      executable: pkexec || '',
      args: ['--disable-internal-agent', executable || method, ...packageArgs],
      plan: {
        method,
        packageName,
        source: 'Configured distribution package sources',
        command: `pkexec ${method} ${packageArgs.join(' ')}`,
        available: !reason,
        ...(reason ? { reason } : {}),
      },
    };
  }
}
