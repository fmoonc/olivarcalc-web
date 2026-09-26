import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Barrel and type-only files hold no logic to cover.
      exclude: ['src/index.ts', 'src/types.ts'],
      // Spec §4.1 and Fase 1 acceptance: at least 95%.
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
