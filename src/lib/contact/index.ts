/**
 * Public support / contact address.
 *
 * Single source of truth for the address shown to users (mailto links) and used
 * as the default `To` for inbound forms and messages. It is **not** the envelope
 * `From` — those are `USER_EMAIL_FROM` / `MANAGER_EMAIL_FROM`, server-only in
 * `@/plugins/email`. Override per environment with `NEXT_PUBLIC_CONTACT_EMAIL`
 * — the `NEXT_PUBLIC_` prefix is required so client components (Payload admin
 * dashboards) can read it in the browser bundle. The direct
 * `process.env.NEXT_PUBLIC_*` reference is what lets Next inline it
 * client-side; `ClientEnvSchema`/`serverEnv` only validate its format.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@sydevelopers.com'
