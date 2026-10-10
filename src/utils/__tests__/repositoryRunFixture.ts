import type { RepositoryRunOutputLineDto, RepositoryRunStateDto } from '@/types/repositoryRun';

const warn =
  '\u001b[43m\u001b[33m[\u001b[39m\u001b[49m\u001b[43m\u001b[30mWARN\u001b[39m\u001b[49m\u001b[43m\u001b[33m]\u001b[39m\u001b[49m Unsupported engine: wanted: {"node":"24.14.0"} (current: {"node":"v25.6.1","pnpm":"11.9.0"})';
export const consoleSample = [
  'Starting step 1/1: Run A^3 desktop app',
  warn,
  '\u001b[2m$ pnpm --filter @a3/desktop tauri "dev"\u001b[22m',
  `.                                        | ${warn}`,
  `apps/desktop                             | ${warn}`,
  '\u001b[2m$ tauri "dev"\u001b[22m',
  '        Info `tauri-build` dependency has workspace inheritance enabled. The features array won’t be automatically rewritten.',
  '     Running BeforeDevCommand (`pnpm dev`)',
  ...Array.from({ length: 13 }, (_, index) => `        Info Watching D:\\Projects\\Software\\A^3\\crates\\module-${index} for changes...`),
  '\u001b[2m$ vite\u001b[22m',
  '\u001b[31merror when starting dev server:',
  'Error: Port 5173 is already in use',
  '    at httpServerStart (file:///D:/Projects/Software/A%5E3/node_modules/vite/dist/node/chunks/node.js:11627:10)',
  '    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\u001b[39m',
  '\u001b[41m\u001b[31m[\u001b[39m\u001b[49m\u001b[41m\u001b[30mELIFECYCLE\u001b[39m\u001b[49m] Command failed with exit code 1.',
  '       Error The "beforeDevCommand" terminated with a non-zero status code.',
  'D:\\Projects\\Software\\A^3\\apps\\desktop:',
  '\u001b[31mERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @a3/desktop@0.1.0 tauri: `tauri "dev"`',
  'Exit status 1\u001b[39m',
  'ELIFECYCLE Command failed with exit code 1.',
  'Step 1 failed with exit code 1.',
];
export const runLines = (values: string[], stream: RepositoryRunOutputLineDto['stream'] = 'stderr', stepIndex = 0): RepositoryRunOutputLineDto[] =>
  values.map((text, index) => ({ sequence: index + 1, text, stream, stepIndex, timestamp: index }));
export const sampleRun = (): RepositoryRunStateDto => ({
  runId: 'sample',
  repoPath: 'D:/Projects/Software/A^3',
  action: 'run',
  status: 'failed',
  startedAt: 1000,
  finishedAt: 4000,
  activeStepIndex: 0,
  stepCount: 1,
  steps: [{ label: 'Run A^3 desktop app', parser: 'none' }],
  exitCode: 1,
  output: runLines(consoleSample).map((line, index) => ({ ...line, stream: index === 0 || index === consoleSample.length - 1 ? 'system' : 'stderr' })),
});
