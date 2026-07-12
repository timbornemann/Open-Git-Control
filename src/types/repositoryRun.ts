export const REPOSITORY_RUN_ACTION_IDS = ['run', 'test', 'format', 'start', 'build'] as const;

export type RepositoryRunActionId = (typeof REPOSITORY_RUN_ACTION_IDS)[number];
export type RepositoryRunShell = 'powershell' | 'cmd' | 'zsh' | 'bash';
export type RepositoryRunParser = 'none' | 'vitest-jest' | 'eslint' | 'typescript' | 'prettier' | 'diagnostic';
export type RepositoryRunPlatform = 'windows' | 'macos' | 'linux';
export type RepositoryRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export type RepositoryRunPlatformCommandDto = {
  shell: RepositoryRunShell;
  command: string;
};

export type RepositoryRunStepDto = {
  id: string;
  label: string;
  parser: RepositoryRunParser;
  windows?: RepositoryRunPlatformCommandDto;
  macos?: RepositoryRunPlatformCommandDto;
  linux?: RepositoryRunPlatformCommandDto;
};

export type RepositoryRunActionDto = {
  steps: RepositoryRunStepDto[];
};

export type RepositoryRunConfigDto = {
  version: 1;
  actions: Record<RepositoryRunActionId, RepositoryRunActionDto>;
};

export type RepositoryRunTemplateDto = {
  id: string;
  label: string;
  action: RepositoryRunActionId;
  step: Omit<RepositoryRunStepDto, 'id'>;
};

export type RepositoryRunConfigStateDto = {
  exists: boolean;
  config: RepositoryRunConfigDto | null;
  configPath: string;
  availableActions: Record<RepositoryRunActionId, boolean>;
  error?: string;
  templates: RepositoryRunTemplateDto[];
};

export type RepositoryRunOutputLineDto = {
  sequence: number;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  timestamp: number;
  stepIndex: number;
};

export type RepositoryRunStateDto = {
  runId: string;
  repoPath: string;
  action: RepositoryRunActionId;
  status: RepositoryRunStatus;
  startedAt: number;
  finishedAt?: number;
  activeStepIndex: number;
  stepCount: number;
  steps: Array<{ label: string; parser: RepositoryRunParser }>;
  exitCode?: number | null;
  message?: string;
  output: RepositoryRunOutputLineDto[];
};

export type RepositoryRunEventDto =
  { type: 'state'; state: RepositoryRunStateDto | null } | { type: 'output'; runId: string; line: RepositoryRunOutputLineDto };

export const createEmptyRepositoryRunConfig = (): RepositoryRunConfigDto => ({
  version: 1,
  actions: {
    run: { steps: [] },
    test: { steps: [] },
    format: { steps: [] },
    start: { steps: [] },
    build: { steps: [] },
  },
});

export const getRepositoryRunPlatform = (platform: string): RepositoryRunPlatform => {
  if (platform === 'win32') return 'windows';
  return platform === 'darwin' ? 'macos' : 'linux';
};

export const getRunPlatformCommand = (step: RepositoryRunStepDto, platform: RepositoryRunPlatform): RepositoryRunPlatformCommandDto | null => {
  const candidate = step[platform];
  return candidate?.command.trim() ? candidate : null;
};

export const isRepositoryRunActionConfigured = (
  config: RepositoryRunConfigDto | null,
  action: RepositoryRunActionId,
  platform: RepositoryRunPlatform,
): boolean => {
  if (!config) return false;
  const steps = config.actions[action]?.steps || [];
  return steps.length > 0 && steps.every((step) => Boolean(getRunPlatformCommand(step, platform)));
};
