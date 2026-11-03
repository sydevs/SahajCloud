import { originOf } from '@/lib/utilities/url'
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
  const origin = originOf(raw)
  if (!origin || !/^https?:\/\//.test(origin)) return null
  return origin === raw ? origin : null
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
 * Our own Cloudflare account's Workers subdomain. Every SahajAtlasWeb and WeMeditateWeb PR
 * preview lands at `<preview>-<worker>.<this>` (`scripts/assert-preview-host.mjs` in
 * sydevs/SahajAtlasWeb holds the same literal, with the account it names).
 */
const WORKERS_PREVIEW_PARENT = '*.contact-c66.workers.dev'

/**
 * Hosts allowed to frame the challenge before any client record is read: the two first-party
 * frontends with every subdomain under them, which is what admits each one's design playground;
 * our Workers preview subdomain; and loopback.
 *
 * ⚠ **Loopback and the preview subdomain are allowed in production on purpose.** What this list
 * protects is a token reaching a page in somebody else's visitor's browser, and neither is one. A
 * loopback page only ever runs on the solver's own machine, which can already open this page
 * directly and read its own token. A Workers preview is publishable only by someone who can
 * deploy to our Cloudflare account, who already holds both halves of the Turnstile credential.
 *
 * Both earn their place: loopback keeps `pnpm dev` and `pnpm ladle` working against the production
 * CMS, and a preview build keeps `.env`'s `VITE_SAHAJCLOUD_URL`, so it frames THIS service rather
 * than its own PR's. Without the subdomain every Atlas preview shows the captcha-blocked screen,
 * which is the one place a consumer PR is reviewable in a browser.
 */
export function builtInParentHosts(firstPartyUrls: readonly string[]): string[] {
  const hosts = firstPartyUrls
    .map((url) => normalizeHost(url))
    .filter((host): host is string => host !== null)
  return [
    ...hosts.flatMap((host) => [host, `*.${host}`]),
    WORKERS_PREVIEW_PARENT,
    'localhost',
    '127.0.0.1',
  ]
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
