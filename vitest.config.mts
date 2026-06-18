import path from 'path'

import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const sharedResolve = {
  alias: {
    '@': path.resolve(__dirname, './src'),
    tests: path.resolve(__dirname, './tests'),
  },
}

const sharedPlugins = [tsconfigPaths(), react()]

// Shared across both Vitest projects (unit + int) — previously copy-pasted in
// each project's `env` block (see #499 §6). DATABASE_URL falls back to a local
// Postgres for contributors who don't set it; CI injects the service-container URL.
const sharedTestEnv: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/payload_test',
  PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
  SAHAJCLOUD_PREVIEW_SECRET: 'test-preview-secret-32-chars',
  WEMEDITATE_WEB_URL: 'http://localhost:5173',
  SAHAJATLAS_URL: 'http://localhost:5174',
  NIRMALA_VIDYA_API_KEY: 'test-nirmala-vidya-api-key-placeholder',
}

export default defineConfig({
  test: {
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
    projects: [
      {
        plugins: sharedPlugins,
        resolve: sharedResolve,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.spec.ts'],
          testTimeout: 5000,
          env: sharedTestEnv,
        },
      },
      {
        plugins: sharedPlugins,
        resolve: sharedResolve,
        test: {
          name: 'int',
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
          globalSetup: ['./tests/setup/globalSetup.ts'],
          include: ['tests/int/**/*.int.spec.ts', 'seeds/**/*.test.ts'],
          pool: 'forks',
          maxConcurrency: 1,
          // Postgres has real per-op latency (vs the old instant in-memory SQLite),
          // so write-heavy integration tests + per-suite schema push need more headroom.
          testTimeout: 60000,
          hookTimeout: 120000,
          env: sharedTestEnv,
        },
      },
    ],
  },
})
