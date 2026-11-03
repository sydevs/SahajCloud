import {
  isHostAllowed,
  normalizeHost,
  parseAllowedDomains,
} from '@/plugins/usage/originEnforcement'

/** What the frame URL asks for. `parent` is `null` when it is missing or not an http(s) origin. */
export type ChallengeRequest = {
  parent: string | null
  theme: 'light' | 'dark' | 'auto'
  /** Turnstile's own `language` option — `auto`, or a two-letter code with an optional region. */
  language: string
  /** Hand back the handshake and render nothing: the widget's eager availability check. */
  probe: boolean
}

const first = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : Array.isArray(value) ? first(value[0]) : undefined

/**
 * The exact origin a parent named, or `null`. A path, a query, credentials or an opaque `null`
 * origin are all refusals rather than something to trim: the widget sends `location.origin`, and
 * anything else is not the widget.
 */
export function parentOrigin(raw: string | undefined): string | null {
  const url = raw ? URL.parse(raw) : null
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null
  return url.origin === raw ? url.origin : null
}

/**
 * The frame URL's query, read back. An unknown theme or language falls back rather than refusing:
 * a captcha that will not render is a worse answer than one in the wrong theme.
 */
export function readChallengeRequest(query: Record<string, unknown>): ChallengeRequest {
  const theme = first(query.theme)
  const language = first(query.language) ?? ''

  return {
    parent: parentOrigin(first(query.parent)),
    theme: theme === 'light' || theme === 'dark' || theme === 'auto' ? theme : 'auto',
    language: /^[a-z]{2}(-[a-z]{2})?$/i.test(language) ? language : 'auto',
    probe: first(query.probe) === '1',
  }
}

/**
 * Cloudflare's dummy site keys — `1x…` passes, `2x…` blocks, `3x…` forces a challenge — matched
 * by shape so an unpublished variant counts too. A real key starts `0x`.
 *
 * ⚠ Production refuses one (sydevs/SahajAtlasWeb#259's guard, moved here with the key): the
 * tracked `.env` carries the test pair, and a production service that picked up both halves of
 * it would run a captcha that passes everything, with nothing failing to say so.
 */
export const isTestSiteKey = (key: string): boolean => /^[123]x0{16,}/i.test(key.trim())

/**
 * Hosts allowed to frame the challenge before any client record is read: the two first-party
 * frontends with every subdomain under them (design and preview hosts), plus loopback.
 *
 * ⚠ **Loopback is allowed in production on purpose.** What this list protects is a token reaching
 * a page in somebody else's visitor's browser. A loopback page only ever runs on the solver's own
 * machine, which can already open this page directly and read its own token, so allowing it costs
 * nothing and keeps `pnpm dev` and `pnpm ladle` working against the production CMS.
 */
export function builtInParentHosts(firstPartyUrls: readonly string[]): string[] {
  const hosts = firstPartyUrls
    .map((url) => normalizeHost(url))
    .filter((host): host is string => host !== null)
  return [...hosts.flatMap((host) => [host, `*.${host}`]), 'localhost', '127.0.0.1']
}

/** Every published client's `allowedDomains`, beside the built-in hosts. */
export function allowedParentHosts(
  firstPartyUrls: readonly string[],
  clientDomains: ReadonlyArray<string | null | undefined>,
): string[] {
  return [...builtInParentHosts(firstPartyUrls), ...clientDomains.flatMap(parseAllowedDomains)]
}

/**
 * Whether `parent` may receive this page's messages. The same matcher API origin enforcement
 * uses, so an embed whose reads pass for a listed host passes here too, with one exception that
 * is the point: a client with an EMPTY list contributes nothing here (sydevs/SahajCloud#1072,
 * question 1), where API reads treat empty as "allow any origin". Widening that to every origin
 * would hand any third party a token minter.
 */
export function isParentAllowed(parent: string | null, patterns: readonly string[]): boolean {
  return parent !== null && isHostAllowed(normalizeHost(parent), [...patterns])
}
