import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryRunPrerequisites, prerequisiteProbeCommand } from './RepositoryRunPrerequisites';
import type { RepositoryRunShell, RepositoryRunStepDto } from '../../src/types/repositoryRun';

const originalPlatform = process.platform;
const platform = (value: NodeJS.Platform) => Object.defineProperty(process, 'platform', { configurable: true, value });
const step = (command: string, shell: RepositoryRunShell = 'powershell'): RepositoryRunStepDto => ({
  id: command,
  label: command,
  parser: 'none',
  windows: { shell, command },
  macos: { shell: 'zsh', command },
  linux: { shell: 'bash', command },
});
afterEach(() => platform(originalPlatform));

describe('Run template prerequisites', () => {
  it('checks only the current platform, batches identical requirements and never executes project commands', async () => {
    platform('win32');
    const run = vi.fn().mockResolvedValue('OGC_RUN_TOOL node available\r\nOGC_RUN_TOOL npm missing\r\n');
    const command = step('npm run test; Write-Output PROJECT_COMMAND_MUST_NOT_RUN');
    command.linux = { shell: 'bash', command: 'cargo test' };
    const result = await new RepositoryRunPrerequisites(run).check('C:/project', [command, step('npm run build')]);
    expect(result.checks).toEqual([
      { program: 'node', shell: 'powershell', state: 'available' },
      { program: 'npm', shell: 'powershell', state: 'missing' },
    ]);
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][2]).not.toContain('PROJECT_COMMAND_MUST_NOT_RUN');
    expect(run.mock.calls[0][2]).not.toContain('cargo');
    expect(run.mock.calls[0][2]).not.toContain('--version');
    expect(run.mock.calls[0][2]).toContain('Get-Command');
  });

  it('keeps PowerShell and cmd availability separate and rechecks after installation', async () => {
    platform('win32');
    let installed = false;
    const run = vi.fn(async (_repo, shell) => `OGC_RUN_TOOL cargo ${installed || shell === 'cmd' ? 'available' : 'missing'}\n`);
    const service = new RepositoryRunPrerequisites(run);
    const steps = [step('cargo test'), step('cargo build', 'cmd')];
    expect((await service.check('C:/project', steps)).checks.map((check) => check.state)).toEqual(['missing', 'available']);
    installed = true;
    expect((await service.check('C:/project', steps)).checks.every((check) => check.state === 'available')).toBe(true);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it.each(['linux', 'darwin'] as const)('uses the matching login shell for Python on %s', async (current) => {
    platform(current);
    const run = vi.fn().mockResolvedValue('profile startup output\nOGC_RUN_TOOL python3 available\nOGC_RUN_TOOL pytest missing\n');
    const result = await new RepositoryRunPrerequisites(run).check('/project', [step('python3 main.py'), step('pytest')]);
    expect(result.checks.map((check) => check.program)).toEqual(['python3', 'pytest']);
    expect(run.mock.calls[0][1]).toBe(current === 'darwin' ? 'zsh' : 'bash');
    expect(run.mock.calls[0][2]).toContain("command -v 'python3'");
  });

  it('distinguishes a failed or incomplete discovery from a missing executable', async () => {
    const run = vi.fn().mockRejectedValue(new Error('Shell timed out'));
    const service = new RepositoryRunPrerequisites(run);
    expect((await service.check('/project', [step('cargo test')])).checks[0].state).toBe('unknown');
    run.mockResolvedValue('OGC_RUN_TOOL node available\n');
    expect((await service.check('/project', [step('npm test')])).checks.map((check) => check.state)).toEqual(['available', 'unknown']);
  });

  it('does not probe unknown custom commands or shell builtins', async () => {
    const run = vi.fn();
    expect((await new RepositoryRunPrerequisites(run).check('/project', [step('./my-runner'), step('echo ready')])).checks).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['powershell', 'cmd', 'bash', 'zsh'] as const)('checks a local Gradle wrapper and supports JAVA_HOME with %s', (shell) => {
    const command = prerequisiteProbeCommand(shell, ['gradlew', 'java']);
    expect(command).toContain('JAVA_HOME');
    if (shell === 'cmd') expect(command).toContain('if defined JAVA_HOME');
    if (shell === 'bash' || shell === 'zsh') expect(command).toContain('test -n "$JAVA_HOME"');
    expect(command).toContain(shell === 'powershell' || shell === 'cmd' ? 'gradlew.bat' : './gradlew');
    expect(command).not.toContain('./gradlew --version');
    expect(command).toContain('OGC_RUN_TOOL gradlew');
  });

  it('resolves actual tools with the execution shell without running the template', async () => {
    const command = step('echo untouched');
    const shellCommand = originalPlatform === 'win32' ? 'powershell' : originalPlatform === 'darwin' ? 'zsh' : 'bash';
    command.windows = { shell: 'powershell', command: 'npm run THIS_SCRIPT_DOES_NOT_EXIST' };
    command.macos = { shell: 'zsh', command: 'npm run THIS_SCRIPT_DOES_NOT_EXIST' };
    command.linux = { shell: 'bash', command: 'npm run THIS_SCRIPT_DOES_NOT_EXIST' };
    const result = await new RepositoryRunPrerequisites().check(process.cwd(), [command]);
    expect(result.checks).toEqual([
      { program: 'node', shell: shellCommand, state: 'available' },
      { program: 'npm', shell: shellCommand, state: 'available' },
    ]);
  }, 15_000);
});
