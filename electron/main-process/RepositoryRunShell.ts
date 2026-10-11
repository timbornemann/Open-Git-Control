import type { RepositoryRunShell } from '../../src/types/repositoryRun';
import { windowsSystemExecutable } from '../system-tools/windowsSystemExecutable';

export const getShellInvocation = (shell: RepositoryRunShell, command: string): { executable: string; args: string[] } => {
  if (shell === 'powershell')
    return {
      executable: windowsSystemExecutable('WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding; ${command}`,
      ],
    };
  if (shell === 'cmd') return { executable: windowsSystemExecutable('cmd.exe'), args: ['/d', '/s', '/c', command] };
  if (shell === 'zsh') return { executable: '/bin/zsh', args: ['-lc', command] };
  return { executable: '/usr/bin/env', args: ['bash', '-lc', command] };
};
