import { serverEnv } from '@/lib/env'

/** The mock seam `expire-events.int.spec.ts` uses to exercise the paused path. */
export function isEventVerificationEnabled(): boolean {
  return serverEnv.EVENT_VERIFICATION_ENABLED
}
