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
      include: ['src/utils/**/*.ts', 'electron/settings.ts'],
      thresholds: {
        // Keep CI thresholds aligned with currently-included utility modules.
        // These can be raised incrementally as uncovered branches are tested.
        lines: 94,
        functions: 88,
        branches: 85,
        statements: 92,
      },
    },
  },
});
