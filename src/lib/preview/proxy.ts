/**
 * The contract between a Railway preview, the Cloudflare Worker in front of it,
 * and the scripts that create, sweep and reach its address. Seven consumers
 * spell these values, so they live here rather than in any one of them:
 * `src/middleware.ts` (the gate), `src/lib/utilities/serverUrl.ts` (the CSRF
 * origin), `src/plugins/previewAdmin` (the environment test),
 * `preview-proxy/index.ts` (the Worker), `next.config.ts` (the preview's
 * Server Action origin), `scripts/preview-domain.ts` and `seeds/run.ts`.
 *
 * Pure, with no imports: `src/middleware.ts` reaches it from a bundle that must
 * stay free of `serverEnv` and Payload, the Worker reaches it by relative path
 * outside this app's module resolution, and `next.config.ts` and
 * `playwright.config.ts` each reach it outside the app altogether — the config
 * from a file swc transpiles before Next itself has started.
 *
 * ⚠ **Not the live-preview secret.** `@/lib/utilities/previewSecret` and
 * `x-sahajcloud-preview-secret` are the Lexical draft-preview credential, which
 * has nothing to do with this. Everything here is about a Railway PR preview of
 * the whole deployment.
 */

/**
 * Proof that a request arrived through the Worker rather than straight at the
 * Railway host.
 *
 * ⚠ **Not an identity.** Who the caller is was settled by Cloudflare Access
 * before the Worker ran; this only says the hop happened. The Railway host
 * carries the same `Host` on the Worker's own subrequest, so nothing else can
 * tell the two apart.
 *
 * ⚠ **The value is compared, never merely counted.** The header's name is in a
 * public repository, so a gate that asked whether the header was *present*
 * would be opened by anyone who read this file.
 */
export const PREVIEW_PROXY_SECRET_HEADER = 'x-sahajcloud-preview-proxy'

/** The zone every per-PR preview address is created under. */
export const PREVIEW_DOMAIN_SUFFIX = 'cloud-preview.sydevelopers.com'

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
 * in this leaf rather than beside the seeder so the seed CLI and the smoke lane
 * can read it without loading the Payload config.
 */
export const PREVIEW_ADMIN_ADDRESS = 'preview-admin@sydevelopers.com'

/** One pull request's label, which is both its hostname's first part and its KV key. */
const previewLabel = (pr: number | string): string => `pr-${pr}`

/**
 * The fixed address for one pull request, known the moment the PR exists.
 * A Workers Custom Domain is created at this hostname on the first push and
 * deleted by the daily sweep a day after the PR closes.
 */
export const previewHostname = (pr: number | string): string =>
  `${previewLabel(pr)}.${PREVIEW_DOMAIN_SUFFIX}`

/** The same address as an origin. */
export const previewOrigin = (pr: number | string): string => `https://${previewHostname(pr)}`

/** The KV key mapping one PR to the Railway host CI discovered. */
export const previewHostKey = previewLabel

/**
 * The one path a Railway preview serves without the Worker's header, and then
 * only for a `GET` or a `HEAD`.
 *
 * ⚠ **Its consumer is CI's discovery poll**, which has to reach the Railway host
 * before the fixed address can answer for this push — `scripts/get-railway-preview-url.ts`
 * reads the served commit there, with no credential. Railway's own healthcheck
 * needs no exemption at all: it reaches the container directly rather than
 * through this deployment's public host, and the gate's own docstring used to
 * claim otherwise.
 *
 * ⚠ **Compared exactly, never by prefix, and never for a write.** This is the
 * gate's only hole. A prefix test would widen it to every
 * `/api/health/<anything>`, which falls through to Payload's catch-all — paths
 * no collection serves today and nothing would notice tomorrow.
 */
export const PREVIEW_HEALTH_PATH = '/api/health'

/**
 * The pull-request number a **fixed** address belongs to, read off the leftmost
 * label. Any other hostname is not one of ours.
 *
 * The Worker answers on it, and the sweep decides which Custom Domains are ours
 * by it. Both used to spell the parse themselves, and neither copy checked the
 * suffix — so a change to the address shape would have stopped the Worker
 * routing while the sweep kept matching, or left the sweep silently matching
 * nothing while the zone's 100-domain ceiling filled up.
 */
export const previewNumberFromProxyHost = (host: string | undefined | null): null | string => {
  if (!host || !host.endsWith(`.${PREVIEW_DOMAIN_SUFFIX}`)) return null
  return /^pr-(\d+)$/.exec(host.slice(0, -(PREVIEW_DOMAIN_SUFFIX.length + 1)))?.[1] ?? null
}

/**
 * A PR preview's Railway environment name.
 *
 * ⚠ **Railway spells it `SahajCloud-pr-<n>`, with the project's prefix**, which a
 * deployed preview reports at `/api/health`. A pattern of bare `pr-<n>` matched
 * no real deployment, so the gate, the sign-in bypass and the fixed address were
 * all switched off on every preview while every spec, written against `pr-<n>`,
 * stayed green. The bare form stays accepted for those fixtures and for a
 * project renamed without a prefix; nothing else widens it.
 */
const PREVIEW_ENVIRONMENT_NAME = /^(?:SahajCloud-)?pr-(\d+)$/

/**
 * True for the Railway environment name of a PR preview, and nothing else.
 *
 * ⚠ **Every preview decision keys on this, and on nothing a caller can write.**
 * The gate, the sign-in bypass and the login page's account list all turn on it,
 * so they cover exactly one set and cannot drift apart. An earlier shape read
 * the request's own `Host` header, which fails **open** on every host it does
 * not recognise — an absent header, a `:port` suffix, a `railway.app` domain
 * without `up.` — and a gate that serves what it cannot identify is not a gate.
 *
 * ⚠ **An allowlist, not "any name but production".** A named non-production
 * environment — `staging`, a renamed production, a one-off `hotfix` — is reached
 * on a host no Worker answers for and no Access app covers, so answering `true`
 * there would publish every manager's name, address, roles and managed records,
 * with one-click admin sign-in beside them, on an ordinary public URL.
 */
export const isPreviewEnvironmentName = (name: string | undefined | null): boolean =>
  previewNumberFromEnvironmentName(name) !== null

/**
 * The pull-request number a preview environment's name names, or `null` — the
 * test above, with its answer. The gate reads this one.
 */
export const previewNumberFromEnvironmentName = (name: string | undefined | null): null | string =>
  (name && PREVIEW_ENVIRONMENT_NAME.exec(name.trim())?.[1]) || null

/**
 * The Cloudflare Access service-token headers, or none when either half is
 * missing.
 *
 * ⚠ **Both or neither.** Access reads a blank client id as a failed
 * service-token attempt and logs one, so a half-set pair is worse than an
 * unauthenticated request. The seed CLI and `playwright.config.ts` both attach
 * these and read their own environment — only the vendor's header names, which
 * nothing validates, are shared.
 */
export const accessTokenHeaders = (
  clientId: string | undefined,
  clientSecret: string | undefined,
): Record<string, string> =>
  clientId && clientSecret
    ? { 'CF-Access-Client-Id': clientId, 'CF-Access-Client-Secret': clientSecret }
    : {}
