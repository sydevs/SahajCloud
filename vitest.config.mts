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
          testTimeout: 30000,
          hookTimeout: 60000,
          env: {
            NODE_ENV: 'test',
            PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
            SAHAJCLOUD_PREVIEW_SECRET: 'test-preview-secret-32-chars',
            WEMEDITATE_WEB_URL: 'http://localhost:5173',
            SAHAJATLAS_URL: 'http://localhost:5174',
            NIRMALA_VIDYA_API_KEY: 'test-nirmala-vidya-api-key-placeholder',
          },
        },
      },
    ],
  },
})
