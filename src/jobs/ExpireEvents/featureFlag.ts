import { serverEnv } from '@/lib/env'

/**
 * Is the nightly sweep allowed to run?
 *
 * A function rather than a constant: `getServerEnv` caches its first parse, so
 * a module-level boolean would freeze at import time and a test could never
 * move it.
 */
export function isEventVerificationEnabled(): boolean {
  return serverEnv.EVENT_VERIFICATION_ENABLED
}
