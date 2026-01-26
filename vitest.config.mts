import path from 'path'

import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      tests: path.resolve(__dirname, './tests'),
    },
  },
  test: {
    environment: 'node', // Use Node environment for better Buffer/Uint8Array handling
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./tests/setup/globalSetup.ts'],
    include: ['tests/int/**/*.int.spec.ts', 'seeds/**/*.test.ts'],
    // Ensure tests run sequentially to avoid database conflicts
    pool: 'forks', // Use forks instead of threads to avoid realm issues
    maxConcurrency: 1,
    // Increase timeout for database operations
    testTimeout: 30000,
    hookTimeout: 60000, // 60 seconds for beforeAll hooks with heavy Payload setup
    // Set NODE_ENV=test for conditional config logic
    env: {
      NODE_ENV: 'test',
      PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
      WEMEDITATE_WEB_URL: 'http://localhost:5173',
      SAHAJATLAS_URL: 'http://localhost:5174',
    },
    // Mock CSS imports to prevent errors in tests
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
})
