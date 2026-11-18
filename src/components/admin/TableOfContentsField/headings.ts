import type { TableOfContentsHeadings } from '@/payload-types'

/** The nearest preceding heading with a lower level, or -1 if none. */
function parentOf(detected: TableOfContentsHeadings, position: number): number {
  for (let i = position - 1; i >= 0; i--) {
    if (detected[i].level < detected[position].level) return i
  }
  return -1
}

function withDescendants(detected: TableOfContentsHeadings, position: number): Set<number> {
  const range = new Set([position])
  for (let i = position + 1; i < detected.length; i++) {
    if (detected[i].level <= detected[position].level) break
    range.add(i)
  }
  return range
}

function headingsAt(
  detected: TableOfContentsHeadings,
  positions: ReadonlySet<number>,
): TableOfContentsHeadings {
  return detected.filter((_, i) => positions.has(i))
}

/**
 * Which detected headings a stored list stands for, as positions in `detected`.
 *
 * Each entry claims an unclaimed heading of its own slug, preferring the same
 * text, then the nearest position. Neither tie-break covers the other: text is
 * what survives a heading inserted above, which moves every position, and the
 * position is all that tells two headings apart when their text is identical
 * too.
 */
export function resolveStored(
  detected: TableOfContentsHeadings,
  stored: TableOfContentsHeadings,
): Set<number> {
  const claimed = new Set<number>()

  for (const entry of stored) {
    let best: { distance: number; exact: boolean; position: number } | null = null

    for (let position = 0; position < detected.length; position++) {
      const candidate = detected[position]
      if (claimed.has(position) || candidate.slug !== entry.slug) continue

      const exact = candidate.text === entry.text
      const distance = entry.index === undefined ? 0 : Math.abs(position - entry.index)
      const better =
        !best || (exact && !best.exact) || (exact === best.exact && distance < best.distance)

      if (better) best = { distance, exact, position }
    }

    if (best) claimed.add(best.position)
  }

  return claimed
}

/** Headings that cannot be enabled because their own nearest parent is disabled. */
export function blockedHeadings(
  detected: TableOfContentsHeadings,
  enabled: ReadonlySet<number>,
): Set<number> {
  const blocked = new Set<number>()
  for (let i = 0; i < detected.length; i++) {
    if (enabled.has(i)) continue
    const parent = parentOf(detected, i)
    if (parent !== -1 && !enabled.has(parent)) blocked.add(i)
  }
  return blocked
}

/**
 * The stored list rebuilt against a freshly scanned document.
 *
 * Walked in document order so a heading whose parent dropped out — its text
 * edited, or the heading deleted — is dropped with it rather than left
 * orphaned.
 */
export function rebuildStored(
  detected: TableOfContentsHeadings,
  stored: TableOfContentsHeadings,
): TableOfContentsHeadings {
  const resolved = resolveStored(detected, stored)
  const kept = new Set<number>()

  for (let i = 0; i < detected.length; i++) {
    if (!resolved.has(i)) continue
    const parent = parentOf(detected, i)
    if (parent === -1 || kept.has(parent)) kept.add(i)
  }

  return headingsAt(detected, kept)
}

/** The stored list after enabling or disabling `position`, with its nested headings. */
export function toggleHeading(
  detected: TableOfContentsHeadings,
  enabled: ReadonlySet<number>,
  position: number,
): TableOfContentsHeadings {
  const range = withDescendants(detected, position)
  const next = new Set(enabled)

  if (enabled.has(position)) {
    range.forEach((i) => next.delete(i))
  } else {
    range.forEach((i) => next.add(i))
  }

  return headingsAt(detected, next)
}
