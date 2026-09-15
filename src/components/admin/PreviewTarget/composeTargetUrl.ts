import type { PreviewTarget } from '@/fields/previewTargetField'
import { originOf } from '@/lib/utilities/url'

/**
 * The URL one {@link PreviewTarget} wants, built by rewriting the
 * server-resolved default rather than composing a new URL.
 *
 * That direction is why a declaration can hold neither an origin nor a
 * credential, as `previewTargetField` explains: the origin comes from the
 * default, and only the path and query the target names change.
 *
 * The default's own query rides along verbatim, and this function stays
 * incurious about what is in it. Which parameters a repointed path can still
 * use is the declaring global's business — no translations global sends a
 * preview secret, precisely because the paths their tabs compose never read
 * one (`translations-globals.int.spec.ts`).
 *
 * `path` resolves against the default exactly as a browser would resolve an
 * `href`, which is what lets a locale-prefixed site declare `map` and keep its
 * `/fr` prefix while the Atlas declares `/search` and replaces its whole path.
 *
 * Returns `null` — meaning "leave the panel alone" — when the default is not a
 * URL, when the target names nothing to change, or when the target would move
 * the preview **off the default's origin**. That last case is the security
 * check: `//evil.example`, `https://evil.example/x`, a leading backslash
 * (browsers normalise it to a slash) and `javascript:` all resolve elsewhere,
 * and all are refused here rather than loaded into the iframe.
 *
 * Pure, and DOM-free on purpose — the component around it needs Payload's
 * admin, and this is the part worth pinning.
 */
export function composeTargetUrl(defaultUrl: string, target: PreviewTarget): string | null {
  if (!target.path && !target.params) return null

  const base = URL.parse(defaultUrl)
  const baseOrigin = originOf(defaultUrl)
  if (!base || !baseOrigin) return null

  const next = URL.parse(target.path ?? '', base)
  if (!next || originOf(next.href) !== baseOrigin) return null

  const params = new URLSearchParams(base.search)
  next.searchParams.forEach((value, key) => params.set(key, value))
  for (const [key, value] of Object.entries(target.params ?? {})) params.set(key, value)
  next.search = params.toString()

  return next.toString()
}
