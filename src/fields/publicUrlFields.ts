import type { Field, FieldHook, PayloadRequest, TextField } from 'payload'

import { virtualFieldInputs } from '@/plugins/virtualFields'

/**
 * A base URL — a literal, or a resolver, which lets a base vary per document
 * (resolving the client that owns the canonical URLs for an event's region).
 *
 * **Optional-arity**, so a zero-arg thunk reading an env var is still
 * assignable.
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
   * An *additional* guard, AND-ed with the publish gate: when it resolves false
   * the field reads `null`. For a condition beyond published — "is a registered
   * app page".
   */
  exposeWhen?: (ctx: PublicUrlFieldContext) => boolean | Promise<boolean>
  /**
   * Gate every field on `_status === 'published'`. Default `true`. Set `false`
   * for a collection with no drafts (Regions), where an absent `_status` would
   * otherwise read as "not published" and null every field.
   *
   * Explicit rather than guessed: a field hook cannot tell "no `_status`
   * column" from "`_status` deselected".
   */
  requirePublished?: boolean
  /** Label for the collapsible the fields are grouped into. Default `Public Links`. */
  label?: string
  /**
   * The stored fields `buildPath`, a resolver `web`/`app` and `exposeWhen`
   * read, so `virtualFieldsPlugin` keeps all three fields resolvable under an
   * include-mode `select`. `_status` is added whenever `requirePublished` is
   * on.
   *
   * Required rather than optional: a collection that declares nothing reads
   * `null` for every published document under a `select`, with nothing saying
   * so — which is #1084. Pass `[]` for a path built from `id` alone.
   */
  inputs: readonly string[]
}

/**
 * `_status` is a **string** without `versions.drafts.localizeStatus`, and a
 * per-locale **map** with it (`pages`, `app-cards`). Both shapes arrive here:
 * Payload hoists a localized value down to the requested locale in the same
 * `afterRead` field pass that runs this hook, so field order decides which.
 *
 * At `locale: 'all'` no single locale is being asked about, so any published
 * locale counts.
 */
export function isPublished(status: unknown, locale: string | undefined): boolean {
  if (typeof status === 'string') return status === 'published'
  if (typeof status !== 'object' || status === null) return false
  const map = status as Record<string, unknown>
  if (!locale || locale === 'all') return Object.values(map).includes('published')
  return map[locale] === 'published'
}

interface HookConfig {
  buildPath: PublicUrlFieldsOptions['buildPath']
  exposeWhen: PublicUrlFieldsOptions['exposeWhen']
  requirePublished: boolean
}

/**
 * `base === null` builds the path-only field. Any other `base` builds a URL, and
 * an unset one (`undefined`) means that platform is not configured, so the field
 * reads `null`.
 */
function computeHook(
  platform: PublicUrlPlatform,
  base: UrlBase | null | undefined,
  config: HookConfig,
): FieldHook {
  const { buildPath, exposeWhen, requirePublished } = config
  const isPath = base === null
  return async ({ data, req }) => {
    // Built in rather than left to each call site, so no draft-enabled
    // collection can leak a URL for a page that has no public address yet.
    if (requirePublished && !isPublished(data?._status, req.locale)) return null
    if (!isPath && base === undefined) return null

    const ctx: PublicUrlFieldContext = { platform, data, req }
    if (exposeWhen && !(await exposeWhen(ctx))) return null

    const path = await buildPath(ctx)
    if (path == null) return null
    if (isPath) return path

    // After the path, so a per-document base pays nothing on a document whose
    // path did not resolve.
    const resolved = typeof base === 'function' ? await base(ctx) : base
    // A slug keeps its native letters (`/bg/софия`), so the path is stored raw
    // and percent-encoded only where it becomes a URL.
    return resolved ? `${resolved}${encodeURI(path)}` : null
  }
}

/**
 * ⚠ **Private, and must stay private.** `@/plugins/storage/urlFields` already
 * exports a `virtualUrlField`, with an object argument, used by the four upload
 * collections — exporting this one would put two different functions behind one
 * name. A collection needing a computed text field outside this factory's three
 * declares its own, with `virtualFieldInputs` (`Pages.path`).
 */
function virtualUrlField(name: string, hook: FieldHook, inputs: readonly string[]): TextField {
  return {
    name,
    type: 'text',
    virtual: true,
    custom: virtualFieldInputs(...inputs),
    admin: { readOnly: true, disableListColumn: true, disableListFilter: true },
    hooks: { afterRead: [hook] },
  }
}

/**
 * `webPath` (the raw path), `webUrl` and `appUrl`, all from one `buildPath` and
 * all published-gated.
 *
 * Wrapped in a **collapsed collapsible**, because these are derived values an
 * editor only occasionally copies. A collapsible carries no `name`, so the
 * fields stay top-level in the data and in `select`.
 *
 * @example
 * publicUrlFields({
 *   web: () => (process.env.WEMEDITATE_WEB_URL ? `${process.env.WEMEDITATE_WEB_URL}/` : null),
 *   app: 'wemeditate://',
 *   buildPath: ({ platform, data }) => (data?.slug ? `wisdom/${data.slug}` : null),
 *   inputs: ['slug'],
 * })
 */
export function publicUrlFields({
  web,
  app,
  buildPath,
  exposeWhen,
  requirePublished = true,
  label = 'Public Links',
  inputs,
}: PublicUrlFieldsOptions): Field[] {
  const config: HookConfig = { buildPath, exposeWhen, requirePublished }
  // The publish gate is this factory's own, so the caller never names `_status`.
  const declared = requirePublished ? [...inputs, '_status'] : inputs
  const fields: TextField[] = [
    virtualUrlField('webPath', computeHook('web', null, config), declared),
    virtualUrlField('webUrl', computeHook('web', web, config), declared),
    virtualUrlField('appUrl', computeHook('app', app, config), declared),
  ]

  return [{ label, type: 'collapsible', admin: { initCollapsed: true }, fields }]
}
