import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/helpers/build.ts'],
    // Tests change the working directory, which worker threads do not allow.
    pool: 'forks',
    testTimeout: 20000,
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types.ts'],
      reporter: ['text'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
