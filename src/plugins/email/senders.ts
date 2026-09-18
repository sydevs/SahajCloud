/**
 * The two envelope `From` addresses, split by audience (#790).
 *
 * Server-only on purpose. Nothing in the browser sends mail, and an unprefixed
 * `process.env` read is not substituted into a client bundle — it would take
 * the compiled default there while the server honoured the override (#760).
 * `client-bundle-safety.spec.ts` holds this module to that.
 *
 * Read directly rather than through `serverEnv` so these stay module-level
 * constants: a `serverEnv` read here would validate the whole server
 * environment at import, in every consumer and every unit spec.
 * `ServerEnvSchema` still validates both formats when they are set.
 */

/**
 * Envelope `From` for mail whose recipient is a member of the public — a
 * registrant's confirmation, reminder, or follow-up.
 *
 * Separate from `CONTACT_EMAIL` because a sender must be a domain verified in
 * Resend, which silently drops a send from anything else (#790), while the
 * contact address is only what a human is invited to write to.
 */
export const USER_EMAIL_FROM = process.env.USER_EMAIL_FROM || 'admin@wemeditate.com'

/**
 * Envelope `From` for mail whose recipient is a manager, a reviewer, or the
 * admin inbox — including Payload's own auth mail. See `USER_EMAIL_FROM`.
 */
export const MANAGER_EMAIL_FROM = process.env.MANAGER_EMAIL_FROM || 'contact@sydevelopers.com'
