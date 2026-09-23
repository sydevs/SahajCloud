import type { Field } from 'payload'

/**
 * How long an account must wait between sign-in link requests.
 *
 * ⚠ **This is the only in-app bound on per-account link volume.**
 * `rateLimitHook` is a deliberate no-op for every collection — rate limiting is
 * enforced at the Cloudflare edge instead (`src/plugins/usage/hooks.ts`), and
 * the edge keys on IP, which cannot see the email in the request body. Remove
 * this and nothing bounds how often one address can be mailed.
 */
export const REQUEST_LINK_THROTTLE_MS = 60 * 1000

/**
 * When the outstanding sign-in link was minted.
 *
 * Three jobs in one timestamp: it is the throttle window above, it is the claim
 * the consume route matches exactly (so a link works once), and clearing it is
 * what a fresh request does to the outstanding link.
 *
 * Top level and `admin.hidden`, mirroring `currentProject` — nobody edits it by
 * hand. `requestLink` is its only writer and `consumeLink` its only clearer,
 * both in `src/collections/Managers/endpoints/`.
 *
 * ⚠ **`update: () => false` is what makes that last sentence true**, rather
 * than only intended. Self-access grants a manager update on their own
 * document, so without it a manager could re-arm or burn their own outstanding
 * link by hand — and set the stamp to a future instant, which throttles their
 * own sends forever (`requestLink` would compute a negative age). Both
 * endpoints write it through `overrideAccess: true`, so neither is affected.
 * The `sessions` field Payload injects beside it carries the same lock.
 */
export const magicLinkIssuedAt: Field = {
  name: 'magicLinkIssuedAt',
  type: 'date',
  admin: {
    hidden: true,
  },
  access: {
    update: () => false,
  },
}
