/**
 * The contract between a Railway preview, the Cloudflare Worker in front of it,
 * and the scripts that create and sweep its address. Four consumers spell these
 * values, so they live here rather than in any one of them: `src/middleware.ts`
 * (the gate), `src/lib/utilities/serverUrl.ts` (the CSRF origin),
 * `preview-proxy/index.ts` (the Worker), and `scripts/preview-domain.ts`.
 *
 * Pure, with no imports: `src/middleware.ts` reaches it from the Edge bundle and
 * the Worker reaches it by relative path, outside this app's module resolution.
 */

/**
 * Proof that a request arrived through the Worker rather than straight at the
 * Railway host.
 *
 * ⚠ **Not an identity.** Who the caller is was settled by Cloudflare Access
 * before the Worker ran; this only says the hop happened. The Railway host
 * carries the same `Host` on the Worker's own subrequest, so nothing else can
 * tell the two apart.
 */
export const PREVIEW_PROXY_SECRET_HEADER = 'x-sahajcloud-preview-proxy'

/**
 * The admin account every preview provisions, spelled once.
 *
 * ⚠ **It is not a credential**, and that is what changed in #1081: a preview is
 * reachable only behind Cloudflare Access and the gate above, so who may ask is
 * settled before a request arrives. It used to be an environment variable held
 * as a secret in Railway, in GitHub and in the loop's own settings at once,
 * which could not be taken away from one of them alone.
 *
 * Lowercase and untrimmed on purpose: Payload's `email` field lowercases and
 * trims on every write, so any other spelling here would match no row. It lives
 * in this leaf rather than beside the seeder so the seed CLI can read it without
 * loading the Payload config.
 */
export const PREVIEW_ADMIN_ADDRESS = 'preview-admin@sydevelopers.com'

/** The zone every per-PR preview address is created under. */
export const PREVIEW_DOMAIN_SUFFIX = 'cloud-preview.sydevelopers.com'

/**
 * The fixed address for one pull request, known the moment the PR exists.
 * A Workers Custom Domain is created at this hostname on the first push and
 * deleted by the daily sweep a day after the PR closes.
 */
export const previewHostname = (pr: number | string): string => `pr-${pr}.${PREVIEW_DOMAIN_SUFFIX}`

/** The same address as an origin. */
export const previewOrigin = (pr: number | string): string => `https://${previewHostname(pr)}`

/** The KV key mapping one PR to the Railway host CI discovered for it. */
export const previewHostKey = (pr: number | string): string => `pr-${pr}`

/**
 * Paths served on the raw Railway host without the Worker's header.
 *
 * ⚠ **Railway's healthcheck is the whole reason this list exists.** It arrives
 * inside Railway as `Host: healthcheck.railway.app` and never traverses
 * Cloudflare, so a host-only gate makes every preview undeployable — and
 * because the gate ships in the PR that gates its own preview, the only symptom
 * is three failed deploys in a row. Exempting it app-side needs no Access
 * bypass policy, which is what keeps every use of the gate logged.
 */
export const PREVIEW_GATE_EXEMPT_PATHS = ['/api/health'] as const

/** True for a path Railway's own healthcheck reaches. */
export const isPreviewGateExempt = (pathname: string): boolean =>
  PREVIEW_GATE_EXEMPT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

/**
 * The pull-request number inside a Railway preview host, or `null`.
 *
 * ⚠ **Reading a number out of the host is safe; building the host from one is
 * not.** Railway appends a random suffix to some generated domains, so a
 * constructed host turns #661's loud failure into a 502 — the Railway host only
 * ever comes from `scripts/get-railway-preview-url.ts`'s discovery. This
 * direction is what lets the gate name a visitor's fixed address with no
 * environment variable, from the Edge bundle, where Railway injects nothing at
 * build time.
 */
export const previewNumberFromRailwayHost = (host: string | undefined | null): null | string => {
  const matched = /-pr-(\d+)(?:[-.]|$)/.exec(host ?? '')
  return matched?.[1] ?? null
}

/** Railway's own generated-domain suffix. */
export const RAILWAY_HOST_SUFFIX = '.up.railway.app'

/**
 * True for a Railway **preview** host — the generated domain of a `pr-<n>`
 * environment, and nothing else.
 *
 * ⚠ Production keeps a `*.up.railway.app` domain of its own, and must (#661),
 * so the suffix alone cannot decide this. The `-pr-<n>` segment is what does.
 */
export const isRailwayPreviewHost = (host: string | undefined | null): boolean =>
  !!host && host.endsWith(RAILWAY_HOST_SUFFIX) && previewNumberFromRailwayHost(host) !== null
