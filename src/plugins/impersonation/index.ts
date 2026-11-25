/**
 * Support impersonation — see `AGENTS.md` beside this file.
 *
 * ⚠ Client code imports `@/plugins/impersonation/gate`, never this barrel,
 * which pulls `payload` and `jose`.
 */
export { setImpersonatedProject } from './endpoints'
export { impersonationPlugin } from './plugin'
