import type { FieldHook, PayloadRequest, TextField } from 'payload'

/**
 * A base URL — a literal, or a resolver.
 *
 * The resolver is handed the same {@link PublicUrlFieldContext} as `buildPath`,
 * so a base can vary per document (e.g. resolving the client that owns the
 * canonical URLs for an event's region). It stays **optional-arity**: a zero-arg
 * thunk reading an env var is still assignable, since a function that ignores
 * its parameter satisfies one that receives it.
 */
type UrlBase =
  | string
  | ((ctx: PublicUrlFieldContext) => string | null | undefined | Promise<string | null | undefined>)

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
  /** Web base URL, prepended to the web path to form `webUrl` (e.g. an Atlas host). */
  web?: UrlBase
  /** App base URL, prepended to the app path to form `appUrl` (e.g. `wemeditate://`). */
  app?: UrlBase
  /**
   * Build the path for a read — the value of `webPath`, and the segment each
   * base is prepended to. Branch on `ctx.platform` when web/app paths differ;
   * `ctx.req` lets it resolve computed paths (e.g. `getRegionWebPaths(req)`).
   * Return `null` to omit every field for this doc.
   */
  buildPath: (ctx: PublicUrlFieldContext) => string | null | Promise<string | null>
  /**
   * Optional *additional* guard, AND-ed with the publish gate: when it resolves
   * false the field reads `null`. Use for extra conditions beyond published —
   * e.g. "is a registered app page". (Named `exposeWhen` rather than "guard" to
   * read as a predicate.)
   */
  exposeWhen?: (ctx: PublicUrlFieldContext) => boolean | Promise<boolean>
  /**
   * Gate every field on `_status === 'published'`. Default `true`. Set `false`
   * for collections with no drafts/`_status` (e.g. Regions) — otherwise the
   * absent `_status` reads as "not published" and every field resolves to null.
   * A field-hook can't tell "no `_status` column" from "`_status` deselected",
   * so this stays an explicit per-collection choice rather than a runtime guess.
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
 * afterRead hook for one field: publish gate → `exposeWhen` → path → optional
 * base prefix. `base === null` builds the path-only field (returns the raw
 * path); any other `base` builds a URL (`base + path`), and an unset base
 * (`undefined`) means that URL platform isn't configured, so it reads `null`.
 */
function computeHook(
  platform: PublicUrlPlatform,
  base: UrlBase | null | undefined,
  config: HookConfig,
): FieldHook {
  const { buildPath, exposeWhen, requirePublished } = config
  const isPath = base === null
  return async ({ data, req }) => {
    // A public URL/path only exists once the document is published — an
    // unpublished / draft / expired doc has no public page. Built in (rather
    // than left to each call site) so no draft-enabled collection can leak one;
    // opt out with `requirePublished: false` for collections with no `_status`.
    if (requirePublished && data?._status !== 'published') return null
    // A URL platform with no base configured can never resolve — skip the work.
    if (!isPath && base === undefined) return null

    const ctx: PublicUrlFieldContext = { platform, data, req }
    if (exposeWhen && !(await exposeWhen(ctx))) return null

    const path = await buildPath(ctx)
    if (path == null) return null
    if (isPath) return path

    // Resolved after the path, and with the same context, so a per-document
    // base (the client owning this region's canonical URLs) can read `data` /
    // `req` — and pays nothing on a document whose path didn't resolve.
    const resolved = typeof base === 'function' ? await base(ctx) : base
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
 * Build the three virtual public-link fields every collection exposes
 * consistently, all from one `buildPath` and all published-gated:
 *
 * - `webPath` — the raw path (no base).
 * - `webUrl` — the web path prefixed with the `web` base (null if `web` unset).
 * - `appUrl` — the app path prefixed with the `app` base (null if `app` unset).
 *
 * Fields are published-gated by default; pass `requirePublished: false` for
 * collections without `_status`.
 *
 * @example
 * publicUrlFields({
 *   web: () => (process.env.WEMEDITATE_WEB_URL ? `${process.env.WEMEDITATE_WEB_URL}/` : null),
 *   app: 'wemeditate://',
 *   buildPath: ({ platform, data }) => (data?.slug ? `wisdom/${data.slug}` : null),
 * })
 */
export function publicUrlFields({
  web,
  app,
  buildPath,
  exposeWhen,
  requirePublished = true,
}: PublicUrlFieldsOptions): TextField[] {
  const config: HookConfig = { buildPath, exposeWhen, requirePublished }
  return [
    virtualUrlField('webPath', computeHook('web', null, config)),
    virtualUrlField('webUrl', computeHook('web', web, config)),
    virtualUrlField('appUrl', computeHook('app', app, config)),
  ]
}
