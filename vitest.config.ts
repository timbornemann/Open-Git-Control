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
        // Broad architectural baseline: this now includes hooks, workflows,
        // services and IPC routers instead of reporting only utility coverage.
        lines: 35,
        functions: 30,
        branches: 35,
        statements: 35,
      },
    },
  },
});
