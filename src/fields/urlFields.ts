import type { FieldHook, PayloadRequest, TextField } from 'payload'

/** A base URL — a literal, or a resolver (e.g. reading an env var per request). */
type UrlBase = string | (() => string | null | undefined)

/** Which platform a URL is being built for. */
export type UrlPlatform = 'web' | 'app'

/** Context handed to the path builder + guard for one virtual URL read. */
export interface UrlFieldContext {
  /** The platform this field targets (`web` or `app`). */
  platform: UrlPlatform
  /** The document being read. */
  data: Record<string, unknown> | undefined
  req: PayloadRequest
}

export interface UrlFieldsOptions {
  /** Web base URL (include the trailing separator, e.g. `https://x/map#/!/`). */
  web?: UrlBase
  /** App base URL (include the trailing separator, e.g. `wemeditate://`). */
  app?: UrlBase
  /**
   * Build the path appended to the base for a read — e.g. `events/${id}`.
   * Branch on `ctx.platform` when web/app paths differ. Return `null` to omit
   * the URL (e.g. a missing slug).
   */
  buildPath: (ctx: UrlFieldContext) => string | null | Promise<string | null>
  /**
   * Optional guard: when it resolves false the field reads `null`. Use for
   * conditions like "document is published" or "is a registered app page".
   * (Named `exposeWhen` rather than "guard" to read as a predicate.)
   */
  exposeWhen?: (ctx: UrlFieldContext) => boolean | Promise<boolean>
  /** Field name overrides (default `webUrl` / `appUrl`). */
  webName?: string
  appName?: string
}

/** afterRead hook for one virtual URL field: guard → path → `base + path`. */
function urlHook(
  platform: UrlPlatform,
  base: UrlBase,
  buildPath: UrlFieldsOptions['buildPath'],
  exposeWhen: UrlFieldsOptions['exposeWhen'],
): FieldHook {
  return async ({ data, req }) => {
    const resolved = typeof base === 'function' ? base() : base
    if (!resolved) return null

    const ctx: UrlFieldContext = { platform, data, req }
    if (exposeWhen && !(await exposeWhen(ctx))) return null

    const path = await buildPath(ctx)
    if (path == null) return null

    return `${resolved}${path}`
  }
}

/** A virtual, read-only, list-hidden text field carrying a computed URL. */
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
 * Build a pair of virtual URL fields (`webUrl` / `appUrl`) that resolve a
 * document to its public web and/or in-app deep link. Only the platforms whose
 * base URL is supplied are created. Each shares the `buildPath` (path segment
 * appended to the base) and `exposeWhen` guard (returns `null` when false), so
 * the per-collection wiring stays a few lines.
 *
 * @example
 * urlFields({
 *   web: () => process.env.WEMEDITATE_WEB_URL ? `${process.env.WEMEDITATE_WEB_URL}/map#/!/` : null,
 *   buildPath: ({ data }) => (data?.id ? `events/${data.id}` : null),
 *   exposeWhen: ({ data }) => data?._status === 'published',
 * })
 */
export function urlFields({
  web,
  app,
  buildPath,
  exposeWhen,
  webName = 'webUrl',
  appName = 'appUrl',
}: UrlFieldsOptions): TextField[] {
  const fields: TextField[] = []
  if (web !== undefined) {
    fields.push(virtualUrlField(webName, urlHook('web', web, buildPath, exposeWhen)))
  }
  if (app !== undefined) {
    fields.push(virtualUrlField(appName, urlHook('app', app, buildPath, exposeWhen)))
  }
  return fields
}
