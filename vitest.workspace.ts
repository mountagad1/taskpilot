import { defineWorkspace } from 'vitest/config'

// Packages run in a plain node environment; anything that touches the DOM
// opts into happy-dom per-file with `@vitest-environment happy-dom`.
export default defineWorkspace([
  {
    test: {
      name: 'shared',
      root: './packages/shared',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'api',
      root: './services/api',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'browser-tools',
      root: './packages/browser-tools',
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'sdk',
      root: './packages/sdk',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'api-client',
      root: './packages/api-client',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'db',
      root: './services/api/db',
      environment: 'node',
      include: ['**/*.test.mjs'],
      // PGlite boots a WASM Postgres per file; the default 5s is not enough.
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
  },
  {
    test: {
      name: 'web',
      root: './apps/web',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
])
