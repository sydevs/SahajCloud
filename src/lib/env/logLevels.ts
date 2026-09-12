/**
 * The log levels `NEXT_PUBLIC_LOG_LEVEL` accepts, in order of verbosity.
 *
 * Deliberately **zod-free and outside the `@/lib/env` barrel**, for the same
 * reason `deploymentEnvironment.ts` is: `clientLogger` runs in the browser and
 * needs only this vocabulary. Importing it from `./client` would pull that
 * module's `z.object(…)` into every chunk carrying the logger, and nothing in
 * this app marks `sideEffects: false` to let a bundler drop it.
 *
 * `ClientEnvSchema` builds its `z.enum` from this list, so the two cannot
 * drift.
 */
export const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]
