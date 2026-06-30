/**
 * Origin / Referer enforcement helpers for API-client requests.
 *
 * Pure functions (no Payload bootstrap) backing `validateClientOriginHook` in
 * `./hooks.ts`. They reduce a request's browser origin and a client's
 * `allowedDomains` allowlist to comparable bare hosts and decide whether the
 * request is allowed. Matching is exact-host or `*.`-wildcard; see
 * `.claude/rules/api-clients.md` for the contract.
 */
import type { PayloadRequest } from 'payload'

/**
 * Reduce a raw origin/host string to a bare, comparable host: lowercased, with
 * scheme + userinfo + port + path + trailing dot stripped. Accepts a full URL
 * (`https://www.example.org:8080/widget`), a bare host (`www.example.org`), or a
 * `*.`-prefixed wildcard pattern (`*.example.org`, whose label is preserved).
 * Returns `null` when nothing host-like can be extracted.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = raw.trim().toLowerCase()
  if (!value) return null

  // Strip any scheme first so a wildcard written with or without one
  // (`*.example.org` or `https://*.example.org`) is detected the same way.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')

  // Preserve a leading wildcard label — the URL parser would reject a bare `*`.
  const wildcard = value.startsWith('*.')
  if (wildcard) value = value.slice(2)

  let host: string
  try {
    // Re-attach a scheme so the parser accepts bare hosts; it drops any
    // userinfo / port / path and lowercases the hostname.
    host = new URL(`https://${value}`).hostname
  } catch {
    return null
  }
  host = host.replace(/\.$/, '') // trailing-dot FQDN form
  // The only valid wildcard is a leading `*.` label (handled above); any `*` left
  // in the host itself is malformed (a bare `*`, `a.*.org`, `*.*.org`, …).
  if (!host || host.includes('*')) return null

  return wildcard ? `*.${host}` : host
}

/**
 * Parse a client's newline-separated `allowedDomains` textarea into a list of
 * normalized host patterns. Also tolerates comma separators and blank lines.
 * Empty / unset input yields `[]` — the caller treats that as "allow all".
 */
export function parseAllowedDomains(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[\r\n,]+/)
    .map((line) => normalizeHost(line))
    .filter((host): host is string => host !== null)
}

/**
 * Resolve the request's browser host: the `Origin` header, falling back to the
 * `Referer` host. An opaque `Origin: null` (sandboxed iframe, privacy redirect)
 * is treated as absent so the Referer can answer. Returns `null` when neither
 * yields a host — the caller treats that as a server-to-server call and allows it.
 */
export function extractRequestHost(req: PayloadRequest): string | null {
  const origin = req.headers?.get?.('origin')
  if (origin && origin.toLowerCase() !== 'null') {
    const fromOrigin = normalizeHost(origin)
    if (fromOrigin) return fromOrigin
  }
  return normalizeHost(req.headers?.get?.('referer'))
}

/**
 * True when `host` matches an entry in `patterns`. An entry is either an exact
 * host (`example.org`) or a `*.`-wildcard (`*.example.org`) that matches any
 * subdomain but NOT the apex. The leading dot in the wildcard suffix prevents
 * suffix-injection (`evil-example.org` does not match `*.example.org`).
 */
export function isHostAllowed(host: string | null, patterns: string[]): boolean {
  if (!host) return false
  return patterns.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1) // ".example.org"
      return host.length > suffix.length && host.endsWith(suffix)
    }
    return host === pattern
  })
}
