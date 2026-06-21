import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the library's own specs — keep the sandbox's Playwright e2e specs
    // (sandbox/e2e/*.spec.ts) out of the vitest run.
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/**/*.spec.ts', 'src/**/*.test.ts'], // re-exports and test files
      reporter: ['text'],
    },
  },
});
