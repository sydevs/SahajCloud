/**
 * Public support / contact address.
 *
 * Single source of truth for the address shown to users (mailto links) and used
 * as the transactional from/to address. Override per environment with
 * `NEXT_PUBLIC_CONTACT_EMAIL` — the `NEXT_PUBLIC_` prefix is required so client
 * components (Payload admin dashboards) can read it in the browser bundle. The
 * direct `process.env.NEXT_PUBLIC_*` reference is what lets Next inline it
 * client-side; `clientEnv`/`serverEnv` only validate its format.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@sydevelopers.com'
