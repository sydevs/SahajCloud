import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./tests/setup/globalSetup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Ensure tests run sequentially to avoid database conflicts
    pool: 'threads',
    maxConcurrency: 1,
    // Increase timeout for database operations
    testTimeout: 30000,
    // Set NODE_ENV=test for conditional config logic
    env: {
      NODE_ENV: 'test',
      PAYLOAD_SECRET: 'test-secret-key',
    },
  },
})
