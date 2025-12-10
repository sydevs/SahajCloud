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
    include: ['tests/int/**/*.int.spec.ts', 'imports/**/*.test.ts'],
    // Ensure tests run sequentially to avoid database conflicts
    pool: 'forks', // Use forks instead of threads to avoid realm issues
    maxConcurrency: 1,
    // Increase timeout for database operations
    testTimeout: 30000,
    // Set NODE_ENV=test for conditional config logic
    env: {
      NODE_ENV: 'test',
      PAYLOAD_SECRET: 'test-secret-key',
    },
    // Mock CSS imports to prevent errors in tests
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
})
