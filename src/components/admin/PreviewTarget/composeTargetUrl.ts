import type { PreviewTarget } from '@/fields/previewTargetField'

/**
 * The URL one {@link PreviewTarget} wants, built by rewriting the
 * server-resolved default rather than composing a new URL.
 *
 * That direction is the whole point. The default carries the origin and the
 * `secret` the preview session authenticates with, and neither may appear in a
 * declaration that ships to the browser. So this takes both from the default
 * and changes only the path and the query the target names.
 *
 * `path` resolves against the default exactly as a browser would resolve an
 * `href`, which is what lets a locale-prefixed site declare `map` and keep its
 * `/fr` prefix while the Atlas declares `/search` and replaces its whole path.
 *
 * Returns `null` — meaning "leave the panel alone" — when the default is not a
 * URL, when the target names nothing to change, or when the target would move
 * the preview **off the default's origin**. That last case is the security
 * check: `//evil.example`, `https://evil.example/x`, a leading backslash
 * (browsers normalise it to a slash) and `javascript:` all resolve to another
 * origin, and all are refused here rather than loaded into the iframe.
 *
 * Pure, and DOM-free on purpose — the component around it is not testable
 * without booting Payload's admin, and this is the part worth pinning.
 */
export function composeTargetUrl(defaultUrl: string, target: PreviewTarget): string | null {
  if (!defaultUrl) return null
  if (!target.path && !target.params) return null

  let base: URL
  try {
    base = new URL(defaultUrl)
  } catch {
    return null
  }

  let next: URL
  try {
    next = new URL(target.path ?? '', base)
  } catch {
    return null
  }

  // `origin` is the literal string 'null' for an opaque origin (`javascript:`,
  // `data:`), which would otherwise compare equal to another opaque one.
  if (next.origin === 'null' || next.origin !== base.origin) return null

  const params = new URLSearchParams(base.search)
  next.searchParams.forEach((value, key) => params.set(key, value))
  for (const [key, value] of Object.entries(target.params ?? {})) params.set(key, value)
  next.search = params.toString()

  return next.toString()
}
