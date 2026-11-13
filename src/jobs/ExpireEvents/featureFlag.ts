import { serverEnv } from '@/lib/env'

/**
 * The mock seam `expire-events.int.spec.ts` uses to exercise the paused path.
 *
 * Its own module, rather than one shared by every flag-gated job: `vi.mock` is
 * keyed by path and `src/jobs/index.ts` loads every job, so a shared one would
 * make each job's int spec restate every other job's flag.
 */
export function isEventVerificationEnabled(): boolean {
  return serverEnv.EVENT_VERIFICATION_ENABLED
}
