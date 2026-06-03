import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/__tests__/**'], // re-exports and test files
      reporter: ['text'],
    },
  },
});
