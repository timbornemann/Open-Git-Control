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
    manifest: 'build-manifest.json',
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
          // Shared hooks and sidebar components must not pull an entire page
          // into the startup dependency graph. Let dynamic imports define the
          // feature boundaries instead of grouping their whole directories.
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
