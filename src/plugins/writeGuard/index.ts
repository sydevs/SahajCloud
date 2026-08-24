/**
 * Write Guard Plugin
 *
 * Project-wide anti-spam enforcement for client-originated collection writes
 * (Turnstile header, URL-in-text scan, disposable-email rejection), driven by
 * a per-collection policy map. See `writeGuardPlugin.ts` for the contract.
 */

export { writeGuardBeforeValidate, writeGuardPlugin } from './writeGuardPlugin'
export {
  DEFAULT_WRITE_GUARD_POLICIES,
  type WriteGuardOperationPolicy,
  type WriteGuardPolicy,
} from './policies'
