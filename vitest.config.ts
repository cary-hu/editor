import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['app/vitest.config.ts', 'libs/toastmark/vitest.config.ts'],
  },
});
