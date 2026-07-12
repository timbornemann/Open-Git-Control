import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const toChunkPath = (id: string) => id.replace(/\\/g, '/');

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/.git/**', '**/node_modules/**', '**/coverage/**', '**/dist/**', '**/dist-electron/**', '**/.cursor/**', '**/release/**'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = toChunkPath(id);
          if (normalizedId.includes('/node_modules/react/') || normalizedId.includes('/node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (normalizedId.includes('/node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
          if (
            normalizedId.includes('/node_modules/octokit/') ||
            normalizedId.includes('/node_modules/marked/') ||
            normalizedId.includes('/node_modules/dompurify/')
          ) {
            return 'vendor-integrations';
          }
          if (normalizedId.includes('/src/components/commit-graph/')) {
            return 'feature-commit-graph';
          }
          if (normalizedId.includes('/src/components/diff-viewer/')) {
            return 'feature-diff-viewer';
          }
          if (normalizedId.includes('/src/components/release-creator/')) {
            return 'feature-release-creator';
          }
          if (normalizedId.includes('/src/components/project-planner/')) {
            return 'feature-project-planner';
          }
          if (normalizedId.includes('/src/components/layout/SettingsMainContent')) {
            return 'feature-settings';
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
