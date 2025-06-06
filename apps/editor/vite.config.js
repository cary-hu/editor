import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@t': path.resolve(__dirname, 'types'),
    },
  },
  server: {
    port: 8080,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
