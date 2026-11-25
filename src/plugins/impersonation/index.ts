/**
 * Support impersonation — see `AGENTS.md` beside this file.
 *
 * ⚠ Client code imports `@/plugins/impersonation/gate`, never this barrel,
 * which pulls `payload` and `jose`.
 */
export { impersonationCookie, readImpersonation } from './cookie'
export { setImpersonatedProject } from './endpoints'
export { IMPERSONATION_COOKIE, impersonatorOf, isSupportAccount, mayImpersonate } from './gate'
export type { Impersonator } from './gate'
export { impersonationPlugin } from './plugin'
export { IMPERSONATION_STRATEGY } from './strategy'
