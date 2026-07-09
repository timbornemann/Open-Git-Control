import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts', 'electron/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/utils/**/*.ts',
        'src/hooks/**/*.{ts,tsx}',
        'src/contexts/**/*.{ts,tsx}',
        'src/components/layout/hooks/**/*.{ts,tsx}',
        'src/components/layout/state/**/*.ts',
        'src/components/layout/workflows/**/*.{ts,tsx}',
        'src/services/**/*.ts',
        'electron/*.ts',
        'electron/main-process/**/*.ts',
      ],
      exclude: ['**/*.d.ts', '**/__tests__/**', '**/*.test.{ts,tsx}', 'electron/main.ts', 'electron/preload.ts'],
      thresholds: {
        // Broad architectural baseline. Keep this ratcheted to the current
        // repo-wide state, then raise feature slices with focused tests.
        lines: 41,
        functions: 45,
        branches: 37,
        statements: 40,

        // IPC/API contract surface: renderer clients should stay highly covered
        // because they are the typed boundary between React and Electron.
        'src/services/**/*.ts': {
          lines: 95,
          functions: 100,
          branches: 90,
          statements: 95,
        },

        // Workflow ratchets: start with pure workflow utilities and the
        // repo-unavailable recovery flow, both critical to safe repo handling.
        'src/components/layout/workflows/repoWorkflowUtils.ts': {
          lines: 95,
          functions: 100,
          branches: 80,
          statements: 95,
        },
        'src/components/layout/workflows/useRepoUnavailableWorkflow.ts': {
          lines: 90,
          functions: 80,
          branches: 70,
          statements: 90,
        },

        // Main-process IPC ratchets. These files are intentionally exact-file
        // gates so untouched low-coverage IPC areas can be improved slice by slice.
        'electron/main-process/ipc/registerDiagnosticsHandlers.ts': {
          lines: 80,
          functions: 100,
          branches: 80,
          statements: 80,
        },
        'electron/main-process/ipc/registerRepoSettingsHandlers.ts': {
          lines: 95,
          functions: 85,
          branches: 50,
          statements: 95,
        },
        'electron/main-process/ipc/registerUpdaterHandlers.ts': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        'electron/main-process/ipc/registerDialogHandlers.ts': {
          lines: 90,
          functions: 100,
          branches: 50,
          statements: 80,
        },
        'electron/main-process/ipc/registerGithubHandlers.ts': {
          lines: 60,
          functions: 55,
          branches: 55,
          statements: 60,
        },
        'electron/main-process/ipc/github/githubHandlerUtils.ts': {
          lines: 90,
          functions: 100,
          branches: 80,
          statements: 90,
        },
      },
    },
  },
});
