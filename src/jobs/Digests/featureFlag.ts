import { serverEnv } from '@/lib/env'

/** The mock seam `digests.int.spec.ts` uses to exercise both paths. */
export function areDigestsEnabled(): boolean {
  return serverEnv.DIGESTS_ENABLED
}
