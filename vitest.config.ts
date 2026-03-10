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
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 99,
      },
    },
  },
});