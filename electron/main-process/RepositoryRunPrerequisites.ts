import { execFile } from 'node:child_process';
import { getRepositoryRunPlatform, getRunPlatformCommand, type RepositoryRunShell, type RepositoryRunStepDto } from '../../src/types/repositoryRun';
import { getRepositoryRunPrograms, type RepositoryRunPrerequisitesDto, type RepositoryRunProgram } from '../../src/shared/repositoryRunPrerequisites';
import { getShellInvocation } from './RepositoryRunShell';
import { windowsSystemExecutable } from '../system-tools/windowsSystemExecutable';

export type RunPrerequisiteProbe = (repoPath: string, shell: RepositoryRunShell, command: string) => Promise<string>;
const probe: RunPrerequisiteProbe = (repoPath, shell, command) =>
  new Promise((resolve, reject) => {
    const invocation = getShellInvocation(shell, command);
    execFile(
      invocation.executable,
      invocation.args,
      {
        cwd: repoPath,
        env: process.env,
        windowsHide: true,
        timeout: 8_000,
        maxBuffer: 64 * 1024,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

/** Only fixed executable names reach these scripts. Project commands and tool binaries are never run by discovery. */
export function prerequisiteProbeCommand(shell: RepositoryRunShell, programs: RepositoryRunProgram[]): string {
  const names = programs.filter((program) => program !== 'gradlew');
  const wrapper = programs.includes('gradlew');
  if (shell === 'powershell') {
    const checks = names.map((program) => {
      const javaHome = program === 'java' ? " -or ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe') -PathType Leaf))" : '';
      return `$found = [bool](Get-Command -Name '${program}' -CommandType Application,ExternalScript -ErrorAction SilentlyContinue)${javaHome}; Write-Output ('OGC_RUN_TOOL ${program} ' + $(if ($found) {'available'} else {'missing'}))`;
    });
    if (wrapper)
      checks.push("Write-Output ('OGC_RUN_TOOL gradlew ' + $(if (Test-Path -LiteralPath '.\\gradlew.bat' -PathType Leaf) {'available'} else {'missing'}))");
    return checks.join('; ');
  }
  if (shell === 'cmd') {
    const where = `"${windowsSystemExecutable('where.exe')}"`;
    const checks = names.map((program) => {
      const missing =
        program === 'java'
          ? 'if defined JAVA_HOME (if exist "%JAVA_HOME%\\bin\\java.exe" (echo OGC_RUN_TOOL java available) else (echo OGC_RUN_TOOL java missing)) else (echo OGC_RUN_TOOL java missing)'
          : `echo OGC_RUN_TOOL ${program} missing`;
      return `${where} ${program} >nul 2>nul && (echo OGC_RUN_TOOL ${program} available) || (${missing})`;
    });
    if (wrapper) checks.push('if exist ".\\gradlew.bat" (echo OGC_RUN_TOOL gradlew available) else (echo OGC_RUN_TOOL gradlew missing)');
    return checks.join(' & ');
  }
  const checks = names.map((program) => {
    const javaHome = program === 'java' ? ' || { test -n "$JAVA_HOME" && test -f "$JAVA_HOME/bin/java" && test -x "$JAVA_HOME/bin/java"; }' : '';
    return `if command -v '${program}' >/dev/null 2>&1${javaHome}; then printf 'OGC_RUN_TOOL ${program} available\\n'; else printf 'OGC_RUN_TOOL ${program} missing\\n'; fi`;
  });
  if (wrapper)
    checks.push(
      "if test -f ./gradlew && test -x ./gradlew; then printf 'OGC_RUN_TOOL gradlew available\\n'; else printf 'OGC_RUN_TOOL gradlew missing\\n'; fi",
    );
  return checks.join('; ');
}

export class RepositoryRunPrerequisites {
  constructor(private readonly runProbe: RunPrerequisiteProbe = probe) {}
  async check(repoPath: string, steps: Array<Omit<RepositoryRunStepDto, 'id'>>): Promise<RepositoryRunPrerequisitesDto> {
    const platform = getRepositoryRunPlatform(process.platform);
    const byShell = new Map<RepositoryRunShell, Set<RepositoryRunProgram>>();
    for (const step of steps) {
      const command = getRunPlatformCommand(step, platform);
      if (!command) continue;
      const programs = getRepositoryRunPrograms(command.command, platform);
      if (!programs.length) continue;
      const required = byShell.get(command.shell) ?? new Set<RepositoryRunProgram>();
      programs.forEach((program) => required.add(program));
      byShell.set(command.shell, required);
    }
    const groups = await Promise.all(
      [...byShell].map(async ([shell, programs]) => {
        let output = '';
        try {
          output = await this.runProbe(repoPath, shell, prerequisiteProbeCommand(shell, [...programs]));
        } catch {
          /* Unknown is distinct from missing. */
        }
        return [...programs].map((program) => {
          const match = new RegExp(`^OGC_RUN_TOOL ${program} (available|missing)\\r?$`, 'm').exec(output);
          return { program, shell, state: (match?.[1] ?? 'unknown') as 'available' | 'missing' | 'unknown' };
        });
      }),
    );
    return { platform, checkedAt: Date.now(), checks: groups.flat() };
  }
}
