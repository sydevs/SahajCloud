export interface DetectedHeading {
  slug: string
  text: string
  level: number
  /**
   * Ordinal among the document's detected headings, counted from 0. A consumer
   * re-derives it from the rendered document to anchor its link, so what counts
   * as a heading — a top-level heading node with non-empty trimmed text — is a
   * published contract, not an implementation detail.
   *
   * Optional only because an entry stored before this key existed carries none.
   * Read its absence as unknown, never as 0.
   */
  index?: number
}

/** The nearest preceding heading with a lower level, or -1 if none. */
function parentOf(detected: DetectedHeading[], position: number): number {
  for (let i = position - 1; i >= 0; i--) {
    if (detected[i].level < detected[position].level) return i
  }
  return -1
}

/** `position` and every heading nested under it. */
function withDescendants(detected: DetectedHeading[], position: number): Set<number> {
  const range = new Set([position])
  for (let i = position + 1; i < detected.length; i++) {
    if (detected[i].level <= detected[position].level) break
    range.add(i)
  }
  return range
}

function at(detected: DetectedHeading[], positions: ReadonlySet<number>): DetectedHeading[] {
  return detected.filter((_, i) => positions.has(i))
}

/**
 * Which detected headings a stored list stands for, as positions in `detected`.
 *
 * Each entry claims an unclaimed heading of its own slug — a slug change still
 * drops a heading, as it always did — preferring the same text, then the
 * nearest position. Both tie-breaks are load-bearing, and neither covers the
 * other: text is what survives a heading inserted above, which moves every
 * position, and the position is all that tells two headings apart when their
 * text is identical too.
 *
 * `index` alone cannot do this, and neither can slug order. The stored list is
 * a subsequence of the document's headings, so an entry's rank among its alike
 * siblings is not its rank in the document: untick the first of two alike
 * headings and the single entry left is the second one.
 */
export function resolveStored(detected: DetectedHeading[], stored: DetectedHeading[]): Set<number> {
  const claimed = new Set<number>()

  for (const entry of stored) {
    let best = -1
    let bestRank = Infinity

    for (let i = 0; i < detected.length; i++) {
      if (claimed.has(i) || detected[i].slug !== entry.slug) continue
      // A text mismatch costs more than the widest possible distance, so text
      // decides first and the distance only breaks its ties.
      const rank =
        (detected[i].text === entry.text ? 0 : detected.length) +
        (entry.index === undefined ? 0 : Math.abs(i - entry.index))
      if (rank < bestRank) {
        best = i
        bestRank = rank
      }
    }

    if (best !== -1) claimed.add(best)
  }

  return claimed
}

/** Headings that cannot be enabled because their own nearest parent is disabled. */
export function blockedHeadings(
  detected: DetectedHeading[],
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
  detected: DetectedHeading[],
  stored: DetectedHeading[],
): DetectedHeading[] {
  const resolved = resolveStored(detected, stored)
  const kept = new Set<number>()

  for (let i = 0; i < detected.length; i++) {
    if (!resolved.has(i)) continue
    const parent = parentOf(detected, i)
    if (parent === -1 || kept.has(parent)) kept.add(i)
  }

  return at(detected, kept)
}

/** The stored list after enabling or disabling `position`, with its nested headings. */
export function toggleHeading(
  detected: DetectedHeading[],
  enabled: ReadonlySet<number>,
  position: number,
): DetectedHeading[] {
  if (position < 0 || position >= detected.length) return at(detected, enabled)

  const range = withDescendants(detected, position)
  const next = new Set(enabled)

  if (enabled.has(position)) {
    range.forEach((i) => next.delete(i))
  } else {
    range.forEach((i) => next.add(i))
  }

  return at(detected, next)
}
