import { serverEnv } from '@/lib/env'

import { mintLivePreviewToken } from './token'
import { livePreviewUnavailableUrl, type LivePreviewUnavailableReason } from './unavailable'

/**
 * Prefixes a WeMeditate Web path with its locale.
 *
 * ⚠ **WeMeditateWeb derives the locale from the PATH and nowhere else.**
 * `pages/+onBeforeRoute.ts` matches `^/([a-z]{2}(?:-[A-Z]{2})?)(?:/(.*))?$`;
 * nothing in that repo reads a `locale` query parameter. Passing one leaves a
 * translator's panel silently rendering English while they edit another
 * locale — no error, just the wrong copy.
 *
 * English takes no prefix: `/en/x` 301s to `/x`, so prefixing it costs a
 * redirect for nothing.
 *
 * The atlas is the opposite and correctly keeps `?locale=` — it reads the
 * parameter through i18next's `lookupQuerystring`.
 */
export function wmWebLocalePath(path: string, localeCode: string): string {
  return localeCode === 'en' ? path : `${localeCode}/${path}`
}

/**
 * Composes the URL the Live Preview panel points at.
 *
 * Every `admin.livePreview.url` goes through here, so the shape of a preview
 * URL is stated once. Before this there were six hand-built templates, three
 * reading raw `process.env` and three reading `serverEnv`, and they had already
 * drifted — different parameter orders, different null handling, one reading
 * `data.locale` where the others read the `locale` argument.
 *
 * ⚠ **Never returns `null`.** A falsy URL makes Payload close the panel *and*
 * persist `editViewType: 'default'` as that editor's preference, so preview is
 * off next time they open any document of that collection. Every failure lands
 * on the "unavailable" page instead, which explains itself. See
 * `unavailable.ts`.
 *
 * ⚠ **Never throws.** `handleLivePreview` swallows an exception into a logger
 * call, so a throwing composer surfaces as "the panel vanished" plus a line
 * nobody reads.
 */
export async function livePreviewUrl(opts: {
  /** Origin of the consumer site, with no trailing slash. */
  base: string
  /**
   * Path within that site, or `null` when the document has no address yet.
   *
   * A leading slash is optional and normalised away: the atlas composers
   * (`buildRegionWebPath`, `buildEventWebPath`) return `/belgium/antwerp`
   * while the page one returns `cs/about`, because each matches the shape its
   * own `webPath` publishes. Normalising here means neither has to change to
   * suit the other.
   */
  path: string | null
  /**
   * The API-client role that may redeem this token — the role the consumer's
   * own key carries. Checked against `req.user.roles` when the consumer
   * forwards it back, so a token minted for one site cannot unlock the other.
   */
  /** Extra query parameters — `locale`, `scope`, or a document reference. */
  params?: Record<string, string>
  /** Which explanation to show when `path` is null. */
  reason?: LivePreviewUnavailableReason
}): Promise<string> {
  if (opts.path === null) {
    return livePreviewUnavailableUrl(opts.reason ?? 'no-path')
  }

  const token = await mintLivePreviewToken(serverEnv.LIVE_PREVIEW_SIGNING_KEY)
  if (!token) {
    return livePreviewUnavailableUrl('no-key')
  }

  const query = new URLSearchParams({ ...opts.params, 'live-preview': token })

  // An empty path is the site root, which is what the config and translations
  // globals preview against. A trailing slash, where a caller kept one, is
  // preserved — a relative preview target resolves against it.
  const path = opts.path.replace(/^\/+/, '')

  return `${opts.base}/${path}?${query.toString()}`
}
