import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@t': path.resolve(__dirname, 'types'),
      '@toast-ui/toastmark/types': path.resolve(__dirname, '../libs/toastmark/types'),
      '@toast-ui/toastmark': path.resolve(__dirname, '../libs/toastmark/src'),
    },
  },
  server: {
    port: 48080,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
