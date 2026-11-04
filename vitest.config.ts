import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'coverage/**', '**/*.config.*', '**/*.test.*'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
          exclude: [
            'node_modules',
            'dist',
            'tests/integration/**',
            'tests/dist/**',
            'tests/gc/**',
          ],
        },
      },
      {
        test: {
          name: 'gc',
          include: ['tests/gc/**/*.{test,spec}.{js,ts}'],
          pool: 'forks',
          execArgv: ['--expose-gc'],
        },
      },
      {
        test: {
          name: 'dist',
          include: ['tests/dist/**/*.{test,spec}.{js,ts}'],
          exclude: ['**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**'],
          env: { RUN_INTEGRATION: 'true' },
          pool: 'forks',
        },
      },
    ],
  },
  resolve: {
    alias: {
      '^(\\.{1,2}/.*)\\.js$': '$1',
    },
  },
})
