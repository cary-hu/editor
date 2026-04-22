import { defineProject, mergeConfig } from 'vitest/config';
import path from 'path';
import shared from '../vitest.shared';

export default mergeConfig(
  shared,
  defineProject({
    root: __dirname,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@t': path.resolve(__dirname, 'types'),
      },
    },
    test: {
      name: 'editor',
      environment: 'jsdom',
      include: ['src/**/__test__/**/*.spec.ts'],
    },
  })
);
