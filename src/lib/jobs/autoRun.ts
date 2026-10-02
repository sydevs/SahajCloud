import { serverEnv } from '@/lib/env/server'

/**
 * Whether this process may start a job run nobody asked for.
 *
 * Two callers decide the same question and must answer it together:
 * `jobs.shouldAutoRun` in `src/payload.config.ts` for the cron ticks, and the
 * screening kick in `UserSubmissions/screeningQueue.ts` for the run it fires
 * once a submission commits. Gating only the cron leaves the kick delivering a
 * real person's submission to a real mailing list seconds after it is created
 * on a copy of production (#876).
 *
 * A run the operator asked for — `GET /api/payload-jobs/run`, admin-only —
 * ignores this by design.
 */
export const jobsMayAutoRun = (): boolean => serverEnv.JOBS_AUTORUN_ENABLED
