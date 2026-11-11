import type { LoginToken, LoginTokenKind } from './token'
import type { LoginCollectionConfig, LoginDocument } from './types'
import type { Payload, SelectType } from 'payload'

import { hasAcceptedFlag } from './magicLinks'
import { seedTabPreference } from './tabPreference'
import { readAnyLoginToken } from './token'

/**
 * The `?error=` an authentic-but-elapsed token of each kind is sent back with.
 * Each kind's lifetime differs, so the sign-in page words each differently.
 */
export const EXPIRED_REASON = {
  invite: 'invite-expired',
  link: 'link-expired',
  signin: 'expired',
} as const satisfies Record<LoginTokenKind, string>

/** What one kind of token does differently once it checks out. */
export interface KindRules {
  /** The fields `isUnspent` reads, on top of the collection's own `select`. */
  select?: SelectType
  /** Whether this token has not been spent yet. */
  isUnspent: (account: LoginDocument) => boolean
  /** The stored `magicLinkIssuedAt` a single-use token spends, as ISO. */
  spends?: string
  /** The `?error=` a spent token is sent back with, where saying so helps. Otherwise `invalid`. */
  spentReason?: string
  /** Where the session lands. Read from the signed claims, never the request. */
  redirectTo?: string
  /**
   * Work to do once the session exists, before the redirect. A failure costs
   * only that work: it is logged, and the holder is still signed in.
   */
  afterRedeem?: (args: { account: LoginDocument; payload: Payload }) => Promise<void>
}

function rulesFor(config: LoginCollectionConfig, token: LoginToken): KindRules {
  switch (token.kind) {
    case 'signin':
      // Single use, and mutual exclusion between outstanding links, both come
      // from this one equality: `issueMagicLink` stamps the field with the same
      // instant it signs into the claim, so a consumed or superseded link no
      // longer matches. Compared as numbers — see `LoginTokenClaims.issuedAt`.
      return {
        select: { magicLinkIssuedAt: true },
        isUnspent: ({ magicLinkIssuedAt }) =>
          Boolean(magicLinkIssuedAt) &&
          new Date(magicLinkIssuedAt!).getTime() === token.claims.issuedAt,
        spends: new Date(token.claims.issuedAt).toISOString(),
        // The page that sent the holder to sign in, checked as `isAdminPath`
        // when the token was read.
        redirectTo: token.claims.to,
      }
    case 'invite':
      // `_verified` is what makes an invitation single-use: it stamps nothing,
      // so the flag the acceptance sets is the only thing that can refuse the
      // second click. A manager assigned to two projects gets two invitations,
      // and whichever they accept second is spent — they are in already, so say so.
      return {
        isUnspent: (account) => account._verified !== true,
        spentReason: 'invite-accepted',
      }
    case 'link': {
      // ⚠ **Not single-use.** A reminder is re-read and clicked twice, and it
      // names a page rather than granting anything a sign-in link would not.
      // It still expires, and still refuses an account that stops qualifying.
      const { tab, to } = token.claims
      return {
        isUnspent: () => true,
        // Checked at signing and at reading (`isAdminPath`), so this is always
        // an admin path this server chose.
        redirectTo: to,
        // An invitation's "Configure notifications" lands on the account page's
        // Contact tab, which Payload offers no URL for.
        afterRedeem: tab
          ? ({ account, payload }) =>
              seedTabPreference({ collection: config.slug, payload, tab, userId: account.id })
          : undefined,
      }
    }
  }
}

/** A delivered link, as far as either caller gets with it. */
export type Preflight =
  | {
      account: LoginDocument
      /** What the redeem route does next. The sign-in page reads none of it. */
      rules: KindRules
      status: 'ready'
      token: LoginToken
    }
  | { reason: string; status: 'refused' }

/**
 * Every check a delivered link passes before either caller acts on it: authentic,
 * unexpired, this collection's audience, an existing and eligible account, and
 * unspent. `select` adds fields the caller reads off that account, beside the
 * rule's own and the collection's.
 *
 * ⚠ **One function, because the sign-in page must ask what the route answers.**
 * The page offered "Continue" on used and superseded links while it asked a
 * shorter question, and only the click failed (#1113).
 *
 * ⚠ **It writes nothing.** The page runs it on a `GET`, which a mail scanner
 * issues unprompted — the burn is the redeem route's own, after this.
 */
export async function preflight({
  config,
  payload,
  select,
  token,
}: {
  config: LoginCollectionConfig
  payload: Payload
  select?: SelectType
  token: null | string
}): Promise<Preflight> {
  const read = await readAnyLoginToken(token, payload.secret)
  if (read.status === 'expired') return { reason: EXPIRED_REASON[read.kind], status: 'refused' }
  // ⚠ The claim names its own collection, and this equality is what keeps the
  // audiences from having to. A token minted for one served collection cannot
  // sign anyone into another.
  if (read.status !== 'valid' || read.token.claims.collection !== config.slug) {
    return { reason: 'invalid', status: 'refused' }
  }

  const rules = rulesFor(config, read.token)
  // Only where the collection has the column — see `hasAcceptedFlag`.
  const acceptedFlag = hasAcceptedFlag(payload, config.slug) ? { _verified: true } : {}

  let account: LoginDocument
  try {
    account = (await payload.findByID({
      collection: config.slug,
      id: read.token.claims.userId,
      depth: 0,
      // `joins` narrows per collection, so over the slug union it collapses to
      // `undefined`; the result widens for the same reason.
      joins: false as never,
      overrideAccess: true,
      select: { ...acceptedFlag, ...rules.select, ...select, ...config.select },
    })) as unknown as LoginDocument
  } catch {
    // A deleted account. `findByID` throws `NotFound` rather than returning null.
    return { reason: 'invalid', status: 'refused' }
  }

  // Re-checked here, not only at request time: an account deactivated while a
  // token was outstanding must not be able to spend it.
  if (config.isEligible && !config.isEligible(account)) {
    return { reason: 'invalid', status: 'refused' }
  }

  // Reached only with an authentic, unexpired token for an existing, eligible
  // account — so naming it spent tells nothing to anyone probing.
  if (!rules.isUnspent(account)) {
    return { reason: rules.spentReason ?? 'invalid', status: 'refused' }
  }

  return { account, rules, status: 'ready', token: read.token }
}
