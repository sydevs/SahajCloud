import type { LoginCollectionConfig } from './types'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { signInviteToken, signLinkToken, signSigninToken } from './token'

/**
 * The URLs the three emailed links carry, one per token kind.
 *
 * ⚠ **Each addresses the sign-in page, never the redeem route.** The page reads
 * the token and writes nothing, so a mail scanner's `GET` spends nothing; the
 * session is minted only behind that page's form. All three use `?token=`: the
 * page tells the kinds apart by the token's own audience (`readAnyLoginToken`).
 */
function pageUrl(config: LoginCollectionConfig, token: string) {
  return `${getServerUrl()}${config.requestPagePath}?token=${encodeURIComponent(token)}`
}

/** Who a link signs in, and the instant it was minted. */
const claimsFor = (config: LoginCollectionConfig, userId: number | string, now: Date) => ({
  collection: config.slug as string,
  issuedAt: now.getTime(),
  userId,
})

/**
 * A sign-in link. ⚠ `now` must be the instant stamped into
 * `magicLinkIssuedAt`, or the redeem route refuses it — see `stampIssuedAt`.
 */
export async function signInLinkUrl(
  config: LoginCollectionConfig,
  userId: number | string,
  secret: string,
  now: Date,
): Promise<string> {
  return pageUrl(config, await signSigninToken(claimsFor(config, userId, now), secret, now))
}

/** An invitation. Single-use by `_verified`, not by a stamp — see `endpoints/redeem.ts`. */
export async function inviteLinkUrl(
  config: LoginCollectionConfig,
  userId: number | string,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  return pageUrl(config, await signInviteToken(claimsFor(config, userId, now), secret, now))
}

/**
 * A link that signs its holder in and lands on one admin page.
 *
 * @param to - The admin path to land on. Refused unless under `/admin/`.
 * @param label - What the link opens, for the confirmation page.
 * @param tab - A tab to open that page on, by label. @see seedTabPreference
 */
export async function pageLinkUrl(
  config: LoginCollectionConfig,
  userId: number | string,
  { label, tab, to }: { label: string; tab?: string; to: string },
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const token = await signLinkToken(
    { ...claimsFor(config, userId, now), label, to, ...(tab && { tab }) },
    secret,
    now,
  )
  return pageUrl(config, token)
}
