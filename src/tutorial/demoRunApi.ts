import type { ElectronRepositoryRunAPI } from '@/shared/ipc/contracts/repositoryRun';
import { createEmptyRepositoryRunConfig, type RepositoryRunStateDto } from '@/types/repositoryRun';
import { DEMO_TIME, ok, type DemoRepository } from './demoRepository';

export function createDemoRunApi(repo: DemoRepository): Partial<ElectronRepositoryRunAPI> {
  let config = createEmptyRepositoryRunConfig();
  config.actions.test.steps = [
    {
      id: 'test',
      label: 'Lernprojekt testen / Test learning project',
      parser: 'vitest-jest',
      windows: { shell: 'powershell', command: 'npm test' },
      linux: { shell: 'bash', command: 'npm test' },
      macos: { shell: 'zsh', command: 'npm test' },
    },
  ];
  let state: RepositoryRunStateDto | null = null;
  return {
    getRepositoryRunConfig: async (repoPath) =>
      ok({
        exists: true,
        config,
        configPath: `${repoPath}/.Open-Git-Control/run.json`,
        availableActions: {
          run: config.actions.run.steps.length > 0,
          test: config.actions.test.steps.length > 0,
          format: config.actions.format.steps.length > 0,
          start: config.actions.start.steps.length > 0,
          build: config.actions.build.steps.length > 0,
        },
        templates: [],
        prerequisites: {
          platform: 'windows',
          checkedAt: DEMO_TIME,
          checks: [
            { program: 'node', shell: 'powershell', state: 'available' },
            { program: 'npm', shell: 'powershell', state: 'available' },
          ],
        },
      }),
    saveRepositoryRunConfig: async (_path, next) => {
      config = next;
      repo.mark('run-configured');
      return ok(config);
    },
    watchRepositoryRunConfig: async () => ok(true),
    getRepositoryRunState: async () => ok(state),
    checkRepositoryRunPrerequisites: async () =>
      ok({
        platform: 'windows',
        checkedAt: DEMO_TIME,
        checks: [
          { program: 'node', shell: 'powershell', state: 'available' },
          { program: 'npm', shell: 'powershell', state: 'available' },
        ],
      }),
    startRepositoryRun: async (repoPath, action) => {
      state = {
        runId: `demo-run-${repo.revision}`,
        repoPath,
        action,
        status: 'succeeded',
        startedAt: DEMO_TIME,
        finishedAt: DEMO_TIME + 1000,
        activeStepIndex: 0,
        stepCount: 1,
        steps: [{ label: 'Tests', parser: 'vitest-jest', command: 'npm test', shell: 'powershell' }],
        exitCode: 0,
        output: [
          {
            sequence: 1,
            stream: 'stdout',
            text: '✓ greeting.test.ts (3 tests)\nTest Files  1 passed (1)\n     Tests  3 passed (3)',
            timestamp: DEMO_TIME,
            stepIndex: 0,
          },
        ],
      };
      repo.mark('run-started');
      repo.emitChannel('run', { type: 'state', state });
      return ok(state);
    },
    stopRepositoryRun: async () => ok(true),
    onRepositoryRunEvent: (callback) => repo.subscribeChannel('run', (event) => callback(event as Parameters<typeof callback>[0])),
  };
}
