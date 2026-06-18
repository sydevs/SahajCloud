import { createWorkerSafeLogger } from '@/lib/logger/workerSafeLogger'

/**
 * Module-level worker-safe logger for the storage plugin.
 *
 * Storage adapters are constructed before Payload initializes and their
 * delete/static handlers run without a `req`, so they have no access to
 * `req.payload.logger`. Previously they fell back to raw `console.*`; this
 * routes that output through the same worker-safe (Pino-compatible, Workers-safe)
 * logger Payload uses, so storage logs are structured and level-aware.
 *
 * Defaults to the `info` level (logs warn + error) rather than reading
 * `serverEnv`, keeping this module dependency-light enough for the standalone
 * cleanup script (`scripts/cleanup-preview-assets.ts`) that transitively imports
 * `previewIsolation`.
 */
interface StorageLogger {
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export const storageLogger = createWorkerSafeLogger('info', {
  module: 'storage',
}) as unknown as StorageLogger
