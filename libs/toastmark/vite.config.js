import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@t': path.resolve(__dirname, 'types'),
    },
  },
  server: {
    port: 8000,
  },
  build: {
    outDir: 'dist',
  },
});
