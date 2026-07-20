import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from './atomicFile';
import { ensureOpenGitControlReadme, getOpenGitControlAssetPath } from './openGitControlDirectory';
import {
  REPOSITORY_RUN_ACTION_IDS,
  createEmptyRepositoryRunConfig,
  type RepositoryRunActionId,
  type RepositoryRunConfigDto,
  type RepositoryRunConfigStateDto,
  type RepositoryRunParser,
  type RepositoryRunPlatform,
  type RepositoryRunPlatformCommandDto,
  type RepositoryRunShell,
  type RepositoryRunStepDto,
  type RepositoryRunTemplateDto,
  getRepositoryRunPlatform,
  isRepositoryRunActionConfigured,
} from '../../src/types/repositoryRun';

const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_COMMAND_LENGTH = 16_000;
const MAX_STEPS_PER_ACTION = 24;
const CONFIG_FILE = 'run.json';
const PARSERS = new Set<RepositoryRunParser>(['none', 'vitest-jest', 'eslint', 'typescript', 'prettier', 'diagnostic']);
const SHELLS_BY_PLATFORM: Record<RepositoryRunPlatform, ReadonlySet<RepositoryRunShell>> = {
  windows: new Set(['powershell', 'cmd']),
  macos: new Set(['zsh']),
  linux: new Set(['bash']),
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asText = (value: unknown, field: string, maximum: number): string => {
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  if (value.length > maximum) throw new Error(`${field} is too long.`);
  return value;
};

const parsePlatformCommand = (value: unknown, platform: RepositoryRunPlatform): RepositoryRunPlatformCommandDto | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${platform} command must be an object.`);
  const shell = asText(value.shell, `${platform} shell`, 30) as RepositoryRunShell;
  if (!SHELLS_BY_PLATFORM[platform].has(shell)) throw new Error(`${shell} is not supported on ${platform}.`);
  const command = asText(value.command, `${platform} command`, MAX_COMMAND_LENGTH);
  return { shell, command };
};

const parseStep = (value: unknown, action: RepositoryRunActionId, index: number): RepositoryRunStepDto => {
  if (!isRecord(value)) throw new Error(`${action} step ${index + 1} must be an object.`);
  const id = asText(value.id, `${action} step ID`, 120).trim();
  if (!id) throw new Error(`${action} step ID is required.`);
  const label = asText(value.label, `${action} step label`, 160).trim();
  if (!label) throw new Error(`${action} step label is required.`);
  const parser = asText(value.parser, `${action} step parser`, 50) as RepositoryRunParser;
  if (!PARSERS.has(parser)) throw new Error(`${parser} is not a supported output parser.`);
  return {
    id,
    label,
    parser,
    windows: parsePlatformCommand(value.windows, 'windows'),
    macos: parsePlatformCommand(value.macos, 'macos'),
    linux: parsePlatformCommand(value.linux, 'linux'),
  };
};

export const normalizeRepositoryRunConfig = (value: unknown): RepositoryRunConfigDto => {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.actions)) throw new Error('Run configuration must contain version 1 and actions.');
  const config = createEmptyRepositoryRunConfig();
  for (const action of REPOSITORY_RUN_ACTION_IDS) {
    const rawAction = value.actions[action];
    if (rawAction === undefined) continue;
    if (!isRecord(rawAction) || !Array.isArray(rawAction.steps)) throw new Error(`${action} must contain a steps array.`);
    if (rawAction.steps.length > MAX_STEPS_PER_ACTION) throw new Error(`${action} has too many steps.`);
    const steps = rawAction.steps.map((step, index) => parseStep(step, action, index));
    const ids = new Set(steps.map((step) => step.id));
    if (ids.size !== steps.length) throw new Error(`${action} has duplicate step IDs.`);
    config.actions[action] = { steps };
  }
  return config;
};

const makeTemplate = (id: string, label: string, action: RepositoryRunActionId, command: string, parser: RepositoryRunParser): RepositoryRunTemplateDto => ({
  id,
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

export const detectRepositoryRunTemplates = (repoPath: string): RepositoryRunTemplateDto[] => {
  const candidates: RepositoryRunTemplateDto[] = [];
  const exists = (fileName: string) => fs.existsSync(path.join(repoPath, fileName));
  const packageManager = exists('pnpm-lock.yaml') ? 'pnpm' : exists('yarn.lock') ? 'yarn' : exists('bun.lockb') || exists('bun.lock') ? 'bun' : 'npm';
  if (exists('package.json')) {
    let scripts: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> };
      scripts = isRecord(parsed.scripts) ? parsed.scripts : {};
    } catch {
      scripts = {};
    }
    const run = (script: string) => `${packageManager} run ${script}`;
    if (typeof scripts.test === 'string') candidates.push(makeTemplate('node-test', run('test'), 'test', run('test'), 'vitest-jest'));
    if (typeof scripts.format === 'string') candidates.push(makeTemplate('node-format', run('format'), 'format', run('format'), 'prettier'));
    if (typeof scripts.dev === 'string') candidates.push(makeTemplate('node-start-dev', run('dev'), 'start', run('dev'), 'none'));
    if (typeof scripts.start === 'string') candidates.push(makeTemplate('node-start', run('start'), 'start', run('start'), 'none'));
    if (typeof scripts.build === 'string') candidates.push(makeTemplate('node-build', run('build'), 'build', run('build'), 'typescript'));
  }
  if (exists('Cargo.toml')) {
    candidates.push(makeTemplate('cargo-test', 'cargo test', 'test', 'cargo test', 'diagnostic'));
    candidates.push(makeTemplate('cargo-format', 'cargo fmt', 'format', 'cargo fmt', 'diagnostic'));
    candidates.push(makeTemplate('cargo-start', 'cargo run', 'start', 'cargo run', 'none'));
    candidates.push(makeTemplate('cargo-build', 'cargo build', 'build', 'cargo build', 'diagnostic'));
  }
  if (exists('pyproject.toml') || exists('requirements.txt')) {
    candidates.push(makeTemplate('python-test', 'pytest', 'test', 'pytest', 'diagnostic'));
    candidates.push(makeTemplate('python-format', 'black .', 'format', 'black .', 'diagnostic'));
  }
  if (exists('go.mod')) {
    candidates.push(makeTemplate('go-test', 'go test ./...', 'test', 'go test ./...', 'diagnostic'));
    candidates.push(makeTemplate('go-format', 'go fmt ./...', 'format', 'go fmt ./...', 'diagnostic'));
    candidates.push(makeTemplate('go-start', 'go run .', 'start', 'go run .', 'none'));
    candidates.push(makeTemplate('go-build', 'go build ./...', 'build', 'go build ./...', 'diagnostic'));
  }
  if (fs.readdirSync(repoPath, { withFileTypes: true }).some((entry) => entry.isFile() && entry.name.endsWith('.sln'))) {
    candidates.push(makeTemplate('dotnet-test', 'dotnet test', 'test', 'dotnet test', 'diagnostic'));
    candidates.push(makeTemplate('dotnet-format', 'dotnet format', 'format', 'dotnet format', 'diagnostic'));
    candidates.push(makeTemplate('dotnet-start', 'dotnet run', 'start', 'dotnet run', 'none'));
    candidates.push(makeTemplate('dotnet-build', 'dotnet build', 'build', 'dotnet build', 'diagnostic'));
  }
  return candidates;
};

export class RepositoryRunConfigService {
  getConfigPath(repoPath: string): string {
    return getOpenGitControlAssetPath(repoPath, CONFIG_FILE, 'Run configuration path');
  }

  read(repoPath: string): RepositoryRunConfigStateDto {
    const configPath = this.getConfigPath(repoPath);
    const withAvailability = (config: RepositoryRunConfigDto | null): Record<RepositoryRunActionId, boolean> => {
      const platform = getRepositoryRunPlatform(process.platform);
      return Object.fromEntries(REPOSITORY_RUN_ACTION_IDS.map((action) => [action, isRepositoryRunActionConfigured(config, action, platform)])) as Record<
        RepositoryRunActionId,
        boolean
      >;
    };
    if (!fs.existsSync(configPath)) {
      const config = createEmptyRepositoryRunConfig();
      return { exists: false, config, configPath, availableActions: withAvailability(config), templates: detectRepositoryRunTemplates(repoPath) };
    }
    try {
      const stats = fs.statSync(configPath);
      if (stats.size > MAX_CONFIG_BYTES) throw new Error('Run configuration is too large.');
      const config = normalizeRepositoryRunConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
      return { exists: true, config, configPath, availableActions: withAvailability(config), templates: detectRepositoryRunTemplates(repoPath) };
    } catch (error) {
      return {
        exists: true,
        config: null,
        configPath,
        availableActions: withAvailability(null),
        error: error instanceof Error ? error.message : 'Run configuration could not be read.',
        templates: detectRepositoryRunTemplates(repoPath),
      };
    }
  }

  write(repoPath: string, rawConfig: unknown): RepositoryRunConfigDto {
    const config = normalizeRepositoryRunConfig(rawConfig);
    writeTextFileAtomically(this.getConfigPath(repoPath), `${JSON.stringify(config, null, 2)}\n`);
    ensureOpenGitControlReadme(repoPath);
    return config;
  }
}
