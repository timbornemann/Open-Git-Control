import { getRunPlatformCommand, type RepositoryRunPlatform, type RepositoryRunShell, type RepositoryRunStepDto } from '../types/repositoryRun';

export const RUN_PROGRAM_LABELS = {
  node: 'Node.js',
  npm: 'npm',
  npx: 'npx',
  pnpm: 'pnpm',
  yarn: 'Yarn',
  bun: 'Bun',
  bunx: 'bunx',
  python: 'Python (python)',
  python3: 'Python (python3)',
  py: 'Python launcher (py)',
  pytest: 'pytest',
  black: 'Black',
  ruff: 'Ruff',
  cargo: 'Cargo (Rust)',
  go: 'Go',
  dotnet: '.NET SDK',
  mvn: 'Maven',
  java: 'Java (JDK)',
  flutter: 'Flutter',
  dart: 'Dart',
  cmake: 'CMake',
  ctest: 'CTest',
  gradlew: 'Gradle wrapper',
} as const;
export type RepositoryRunProgram = keyof typeof RUN_PROGRAM_LABELS;
export type RepositoryRunPrerequisiteCheckDto = {
  program: RepositoryRunProgram;
  shell: RepositoryRunShell;
  state: 'available' | 'missing' | 'unknown';
};
export type RepositoryRunPrerequisitesDto = {
  platform: RepositoryRunPlatform;
  checkedAt: number;
  checks: RepositoryRunPrerequisiteCheckDto[];
};

/** Recognize known template executables, without interpreting or executing shell commands. */
export function getRepositoryRunPrograms(command: string, platform: RepositoryRunPlatform): RepositoryRunProgram[] {
  const match = /^\s*(?:&\s+)?(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s;&|<>]+))/.exec(command);
  if (!match) return [];
  let executable = match[1] || match[2] || match[3];
  if (platform === 'windows') executable = executable.toLowerCase().replace(/\.(?:cmd|bat|exe|ps1)$/, '');
  if (executable === './gradlew' || executable === '.\\gradlew') return ['gradlew', 'java'];
  if (!Object.hasOwn(RUN_PROGRAM_LABELS, executable) || executable === 'gradlew') return [];
  const program = executable as RepositoryRunProgram;
  if (['npm', 'npx', 'pnpm', 'yarn'].includes(program)) return ['node', program];
  return program === 'mvn' ? ['java', program] : [program];
}

export function getRepositoryRunPrerequisiteIssues(steps: Array<Omit<RepositoryRunStepDto, 'id'>>, report?: RepositoryRunPrerequisitesDto | null) {
  const missing = new Set<RepositoryRunProgram>();
  const unknown = new Set<RepositoryRunProgram>();
  if (report)
    for (const step of steps) {
      const command = getRunPlatformCommand(step, report.platform);
      if (!command) continue;
      for (const program of getRepositoryRunPrograms(command.command, report.platform)) {
        const state = report.checks.find((check) => check.program === program && check.shell === command.shell)?.state;
        if (state === 'missing') missing.add(program);
        else if (state !== 'available') unknown.add(program);
      }
    }
  return { missing: [...missing], unknown: [...unknown] };
}

export const RUN_PREREQUISITE_ERROR_PREFIX = 'RUN_PREREQUISITES:';
export function describeRunPrerequisiteError(error: string, tr: (de: string, en: string) => string): string | null {
  if (!error.startsWith(RUN_PREREQUISITE_ERROR_PREFIX)) return null;
  try {
    const { missing, unknown } = JSON.parse(error.slice(RUN_PREREQUISITE_ERROR_PREFIX.length)) as {
      missing: RepositoryRunProgram[];
      unknown: RepositoryRunProgram[];
    };
    const labels = (programs: RepositoryRunProgram[]) => programs.map((program) => RUN_PROGRAM_LABELS[program]).join(', ');
    return missing.length
      ? tr(
          `Benötigte Programme fehlen: ${labels(missing)}. Installiere sie oder passe den Befehl an und prüfe erneut. Es wurde kein Schritt gestartet.`,
          `Required programs are missing: ${labels(missing)}. Install them or adjust the command and check again. No steps were started.`,
        )
      : tr(
          `Die Verfügbarkeit von ${labels(unknown)} konnte nicht geprüft werden. Prüfe erneut, bevor du startest. Es wurde kein Schritt gestartet.`,
          `Availability of ${labels(unknown)} could not be checked. Check again before starting. No steps were started.`,
        );
  } catch {
    return null;
  }
}
