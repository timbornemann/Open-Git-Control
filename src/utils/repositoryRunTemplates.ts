import type { RepositoryRunActionId, RepositoryRunParser, RepositoryRunStepDto, RepositoryRunTemplateDto } from '@/types/repositoryRun';

export type RepositoryRunCommandTemplate = RepositoryRunTemplateDto & { group: string };

const crossPlatformTemplate = (
  id: string,
  group: string,
  label: string,
  action: RepositoryRunActionId,
  command: string,
  parser: RepositoryRunParser,
): RepositoryRunCommandTemplate => ({
  id,
  group,
  label,
  action,
  step: {
    label,
    parser,
    windows: { shell: 'powershell', command },
    macos: { shell: 'zsh', command },
    linux: { shell: 'bash', command },
  },
});

const gradleTemplate = (id: string, label: string, action: RepositoryRunActionId, task: string, parser: RepositoryRunParser): RepositoryRunCommandTemplate => ({
  id,
  group: 'Java / Gradle',
  label,
  action,
  step: {
    label,
    parser,
    windows: { shell: 'powershell', command: `.\\gradlew.bat ${task}` },
    macos: { shell: 'zsh', command: `./gradlew ${task}` },
    linux: { shell: 'bash', command: `./gradlew ${task}` },
  },
});

export const COMMON_REPOSITORY_RUN_TEMPLATES: RepositoryRunCommandTemplate[] = [
  crossPlatformTemplate('npm-test', 'Node.js / npm', 'npm test', 'test', 'npm test', 'vitest-jest'),
  crossPlatformTemplate('npm-format', 'Node.js / npm', 'npx prettier --write .', 'format', 'npx prettier --write .', 'prettier'),
  crossPlatformTemplate('npm-start', 'Node.js / npm', 'npm run dev', 'start', 'npm run dev', 'none'),
  crossPlatformTemplate('npm-build', 'Node.js / npm', 'npm run build', 'build', 'npm run build', 'typescript'),
  crossPlatformTemplate('pnpm-test', 'Node.js / pnpm', 'pnpm test', 'test', 'pnpm test', 'vitest-jest'),
  crossPlatformTemplate('pnpm-format', 'Node.js / pnpm', 'pnpm format', 'format', 'pnpm format', 'prettier'),
  crossPlatformTemplate('pnpm-start', 'Node.js / pnpm', 'pnpm dev', 'start', 'pnpm dev', 'none'),
  crossPlatformTemplate('pnpm-build', 'Node.js / pnpm', 'pnpm build', 'build', 'pnpm build', 'typescript'),
  crossPlatformTemplate('yarn-test', 'Node.js / Yarn', 'yarn test', 'test', 'yarn test', 'vitest-jest'),
  crossPlatformTemplate('yarn-format', 'Node.js / Yarn', 'yarn format', 'format', 'yarn format', 'prettier'),
  crossPlatformTemplate('yarn-start', 'Node.js / Yarn', 'yarn dev', 'start', 'yarn dev', 'none'),
  crossPlatformTemplate('yarn-build', 'Node.js / Yarn', 'yarn build', 'build', 'yarn build', 'typescript'),
  crossPlatformTemplate('bun-test', 'Node.js / Bun', 'bun test', 'test', 'bun test', 'vitest-jest'),
  crossPlatformTemplate('bun-format', 'Node.js / Bun', 'bunx prettier --write .', 'format', 'bunx prettier --write .', 'prettier'),
  crossPlatformTemplate('bun-start', 'Node.js / Bun', 'bun run dev', 'start', 'bun run dev', 'none'),
  crossPlatformTemplate('bun-build', 'Node.js / Bun', 'bun run build', 'build', 'bun run build', 'typescript'),
  crossPlatformTemplate('python-pytest', 'Python', 'pytest', 'test', 'pytest', 'diagnostic'),
  crossPlatformTemplate('python-ruff', 'Python', 'ruff format .', 'format', 'ruff format .', 'diagnostic'),
  crossPlatformTemplate('python-black', 'Python', 'black .', 'format', 'black .', 'diagnostic'),
  crossPlatformTemplate('python-start', 'Python', 'python main.py', 'start', 'python main.py', 'none'),
  crossPlatformTemplate('rust-test', 'Rust', 'cargo test', 'test', 'cargo test', 'diagnostic'),
  crossPlatformTemplate('rust-format', 'Rust', 'cargo fmt', 'format', 'cargo fmt', 'diagnostic'),
  crossPlatformTemplate('rust-start', 'Rust', 'cargo run', 'start', 'cargo run', 'none'),
  crossPlatformTemplate('rust-build', 'Rust', 'cargo build', 'build', 'cargo build', 'diagnostic'),
  crossPlatformTemplate('go-test', 'Go', 'go test ./...', 'test', 'go test ./...', 'diagnostic'),
  crossPlatformTemplate('go-format', 'Go', 'go fmt ./...', 'format', 'go fmt ./...', 'diagnostic'),
  crossPlatformTemplate('go-start', 'Go', 'go run .', 'start', 'go run .', 'none'),
  crossPlatformTemplate('go-build', 'Go', 'go build ./...', 'build', 'go build ./...', 'diagnostic'),
  crossPlatformTemplate('dotnet-test', '.NET', 'dotnet test', 'test', 'dotnet test', 'diagnostic'),
  crossPlatformTemplate('dotnet-format', '.NET', 'dotnet format', 'format', 'dotnet format', 'diagnostic'),
  crossPlatformTemplate('dotnet-start', '.NET', 'dotnet run', 'start', 'dotnet run', 'none'),
  crossPlatformTemplate('dotnet-build', '.NET', 'dotnet build', 'build', 'dotnet build', 'diagnostic'),
  crossPlatformTemplate('maven-test', 'Java / Maven', 'mvn test', 'test', 'mvn test', 'diagnostic'),
  crossPlatformTemplate('maven-start', 'Java / Maven', 'mvn spring-boot:run', 'start', 'mvn spring-boot:run', 'none'),
  crossPlatformTemplate('maven-build', 'Java / Maven', 'mvn package', 'build', 'mvn package', 'diagnostic'),
  gradleTemplate('gradle-test', 'Gradle test', 'test', 'test', 'diagnostic'),
  gradleTemplate('gradle-format', 'Gradle spotlessApply', 'format', 'spotlessApply', 'diagnostic'),
  gradleTemplate('gradle-start', 'Gradle bootRun', 'start', 'bootRun', 'none'),
  gradleTemplate('gradle-build', 'Gradle build', 'build', 'build', 'diagnostic'),
  crossPlatformTemplate('flutter-test', 'Flutter', 'flutter test', 'test', 'flutter test', 'diagnostic'),
  crossPlatformTemplate('flutter-format', 'Flutter', 'dart format .', 'format', 'dart format .', 'diagnostic'),
  crossPlatformTemplate('flutter-start', 'Flutter', 'flutter run', 'start', 'flutter run', 'none'),
  crossPlatformTemplate('flutter-build', 'Flutter', 'flutter build', 'build', 'flutter build', 'diagnostic'),
  crossPlatformTemplate('cmake-test', 'CMake / C++', 'ctest --test-dir build', 'test', 'ctest --test-dir build', 'diagnostic'),
  crossPlatformTemplate('cmake-build', 'CMake / C++', 'cmake --build build', 'build', 'cmake --build build', 'diagnostic'),
];

export const applyRepositoryRunTemplate = (stepId: string, template: RepositoryRunTemplateDto): RepositoryRunStepDto => ({
  ...template.step,
  id: stepId,
  windows: template.step.windows ? { ...template.step.windows } : undefined,
  macos: template.step.macos ? { ...template.step.macos } : undefined,
  linux: template.step.linux ? { ...template.step.linux } : undefined,
});
