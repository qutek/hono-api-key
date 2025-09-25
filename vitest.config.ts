import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      enabled: true,
      reporter: ['text', 'html'],
      provider: 'v8',
      exclude: ['examples/**', 'dist/**', '**/*.config.*', 'vitest.config.ts', 'tsup.config.ts'],
    },
  },
});
