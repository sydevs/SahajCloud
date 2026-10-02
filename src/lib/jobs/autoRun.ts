import { serverEnv } from '@/lib/env/server'

/**
 * Whether this process may start a job run nobody asked for.
 *
 * `jobs.shouldAutoRun` and the post-commit screening kick both ask this, and
 * gating only the first left the kick delivering a real submission to a real
 * mailing list on a copy of production (#876). A run the operator asked for —
 * `GET /api/payload-jobs/run`, admin-only — is unaffected.
 */
export const jobsMayAutoRun = (): boolean => serverEnv.JOBS_AUTORUN_ENABLED
