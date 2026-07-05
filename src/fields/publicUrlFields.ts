import type { FieldHook, PayloadRequest, TextField } from 'payload'

/** A base URL — a literal, or a resolver (e.g. reading an env var per request). */
type UrlBase = string | (() => string | null | undefined)

/** Which platform a URL is being built for. */
export type PublicUrlPlatform = 'web' | 'app'

/** Context handed to the path builder + guard for one virtual URL read. */
export interface PublicUrlFieldContext {
  /** The platform this field targets (`web` or `app`). */
  platform: PublicUrlPlatform
  /** The document being read. */
  data: Record<string, unknown> | undefined
  req: PayloadRequest
}

export interface PublicUrlFieldsOptions {
  /** Web base URL (prepended to the path, e.g. `https://x/map#/!/` or an Atlas host). */
  web?: UrlBase
  /** App base URL (prepended to the path, e.g. `wemeditate://`). */
  app?: UrlBase
  /**
   * Build the path for a read — the value of the `pathName` field, and the
   * segment each base is prepended to. Branch on `ctx.platform` when web/app
   * paths differ; `ctx.req` lets it resolve computed paths (e.g.
   * `getRegionWebPaths(req)`). Return `null` to omit every field for this doc.
   */
  buildPath: (ctx: PublicUrlFieldContext) => string | null | Promise<string | null>
  /**
   * Optional *additional* guard, AND-ed with the publish gate: when it resolves
   * false the field reads `null`. Use for extra conditions beyond published —
   * e.g. "is a registered app page". (Named `exposeWhen` rather than "guard" to
   * read as a predicate.)
   */
  exposeWhen?: (ctx: PublicUrlFieldContext) => boolean | Promise<boolean>
  /** Field name overrides (default `webUrl` / `appUrl`). */
  webName?: string
  appName?: string
  /**
   * When set, also emit a **path-only** field (the raw `buildPath` result, no
   * base) under this name — e.g. `webPath`. It carries the canonical path the
   * URL fields are built from, so a caller can navigate without re-deriving it.
   * Uses the web-platform path and shares the same gate + `exposeWhen`.
   */
  pathName?: string
  /**
   * Gate every field on `_status === 'published'`. Default `true`. Set `false`
   * for collections without drafts/`_status` (e.g. Regions) — otherwise the
   * absent `_status` reads as "not published" and every field resolves to null.
   */
  requirePublished?: boolean
}

/** Shared per-read inputs for a field's afterRead hook. */
interface HookConfig {
  buildPath: PublicUrlFieldsOptions['buildPath']
  exposeWhen: PublicUrlFieldsOptions['exposeWhen']
  requirePublished: boolean
}

/**
 * afterRead hook for one computed field: publish gate → `exposeWhen` → path →
 * optional base prefix. A `null` base builds the path-only field.
 */
function computeHook(
  platform: PublicUrlPlatform,
  base: UrlBase | null,
  config: HookConfig,
): FieldHook {
  const { buildPath, exposeWhen, requirePublished } = config
  return async ({ data, req }) => {
    // A public URL/path only exists once the document is published — an
    // unpublished / draft / expired doc has no public page. Built in (rather
    // than left to each call site) so no draft-enabled collection can leak one;
    // opt out with `requirePublished: false` for collections with no `_status`.
    if (requirePublished && data?._status !== 'published') return null

    const ctx: PublicUrlFieldContext = { platform, data, req }
    if (exposeWhen && !(await exposeWhen(ctx))) return null

    const path = await buildPath(ctx)
    if (path == null) return null
    if (base === null) return path

    const resolved = typeof base === 'function' ? base() : base
    return resolved ? `${resolved}${path}` : null
  }
}

/** A virtual, read-only, list-hidden text field carrying a computed URL/path. */
function virtualUrlField(name: string, hook: FieldHook): TextField {
  return {
    name,
    type: 'text',
    virtual: true,
    admin: { readOnly: true, disableListColumn: true, disableListFilter: true },
    hooks: { afterRead: [hook] },
  }
}

/**
 * Build virtual, read-time URL/path fields from a single `buildPath`. Any of
 * three fields are emitted, each sharing the same path builder, publish gate,
 * and `exposeWhen`:
 *
 * - `pathName` (optional) — the raw path, no base (e.g. `webPath`).
 * - `webName` / `appName` — `buildPath` prefixed with the `web` / `app` base.
 *
 * Only the outputs whose option is supplied are created, so per-collection
 * wiring stays a few lines. Fields are published-gated by default; pass
 * `requirePublished: false` for collections without `_status`.
 *
 * @example  // published web + app deep links
 * publicUrlFields({
 *   web: () => process.env.WEMEDITATE_WEB_URL ? `${process.env.WEMEDITATE_WEB_URL}/` : null,
 *   buildPath: ({ data }) => (data?.slug ? `wisdom/${data.slug}` : null),
 * })
 *
 * @example  // canonical path + URL for a collection with no drafts
 * publicUrlFields({
 *   web: ATLAS_WEB_BASE,
 *   buildPath: async ({ data, req }) => (await getRegionWebPaths(req)).get(data?.id) ?? null,
 *   pathName: 'webPath',
 *   requirePublished: false,
 * })
 */
export function publicUrlFields({
  web,
  app,
  buildPath,
  exposeWhen,
  webName = 'webUrl',
  appName = 'appUrl',
  pathName,
  requirePublished = true,
}: PublicUrlFieldsOptions): TextField[] {
  const config: HookConfig = { buildPath, exposeWhen, requirePublished }
  const fields: TextField[] = []
  if (pathName) fields.push(virtualUrlField(pathName, computeHook('web', null, config)))
  if (web !== undefined) fields.push(virtualUrlField(webName, computeHook('web', web, config)))
  if (app !== undefined) fields.push(virtualUrlField(appName, computeHook('app', app, config)))
  return fields
}
