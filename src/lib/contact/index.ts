/**
 * Public support / contact address.
 *
 * Single source of truth for the address shown to users (mailto links) and used
 * as the default `To` for inbound forms and messages. It is **not** the envelope
 * `From` — see `USER_EMAIL_FROM` / `MANAGER_EMAIL_FROM` below. Override per
 * environment with `NEXT_PUBLIC_CONTACT_EMAIL` — the `NEXT_PUBLIC_` prefix is
 * required so client components (Payload admin dashboards) can read it in the
 * browser bundle. The direct `process.env.NEXT_PUBLIC_*` reference is what lets
 * Next inline it client-side; `ClientEnvSchema`/`serverEnv` only validate its
 * format.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@sydevelopers.com'

/**
 * Envelope `From` for mail whose recipient is a member of the public — a
 * registrant's confirmation, reminder, or follow-up.
 *
 * Separate from `CONTACT_EMAIL` because a sender must be a domain verified in
 * Resend, which silently drops a send from anything else (#790), while the
 * contact address is only what a human is invited to write to.
 */
export const USER_EMAIL_FROM = process.env.NEXT_PUBLIC_USER_EMAIL_FROM || 'admin@wemeditate.com'

/**
 * Envelope `From` for mail whose recipient is a manager, a reviewer, or the
 * admin inbox — including Payload's own auth mail. See `USER_EMAIL_FROM`.
 */
export const MANAGER_EMAIL_FROM =
  process.env.NEXT_PUBLIC_MANAGER_EMAIL_FROM || 'contact@sydevelopers.com'
