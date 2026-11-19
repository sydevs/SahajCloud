import type { TableOfContentsHeadings } from '@/payload-types'

/** The nearest preceding heading with a lower level, or -1 if none. */
function parentOf(detected: TableOfContentsHeadings, position: number): number {
  for (let i = position - 1; i >= 0; i--) {
    if (detected[i].level < detected[position].level) return i
  }
  return -1
}

/**
 * The stored list for a set of positions, in document order.
 *
 * A heading whose own parent is not kept is dropped with it, so a parent
 * leaving takes its whole subtree. Every list this module emits goes through
 * here, so that rule is stated once.
 */
function storedFrom(
  detected: TableOfContentsHeadings,
  positions: ReadonlySet<number>,
): TableOfContentsHeadings {
  const kept = new Set<number>()

  for (let i = 0; i < detected.length; i++) {
    if (!positions.has(i)) continue
    const parent = parentOf(detected, i)
    if (parent === -1 || kept.has(parent)) kept.add(i)
  }

  return detected.filter((_, i) => kept.has(i))
}

/** Every position from `position` down through the headings nested under it. */
function withDescendants(detected: TableOfContentsHeadings, position: number): Set<number> {
  const range = new Set([position])
  for (let i = position + 1; i < detected.length; i++) {
    if (detected[i].level <= detected[position].level) break
    range.add(i)
  }
  return range
}

/**
 * Each heading's ordinal among the headings sharing its slug, counted from 0.
 *
 * ⚠ Cross-repo contract: this count is what a consumer rendering the document
 * re-derives to anchor a stored entry, and the rule is published to them in the
 * `describe()` on the `headings` schema
 * (`@/lib/richEditor/blocks/TableOfContentsBlock`), which `generate:types`
 * copies into every consumer's own types. Change both together, or anchors move
 * on every consumer site — sydevs/WeMeditateWeb#266 is the first.
 */
export function stampOccurrences(detected: TableOfContentsHeadings): TableOfContentsHeadings {
  const seen = new Map<string, number>()

  return detected.map((heading) => {
    const occurrence = seen.get(heading.slug) ?? 0
    seen.set(heading.slug, occurrence + 1)
    return { ...heading, occurrence }
  })
}

/**
 * Which detected headings a stored list stands for, as positions in `detected`.
 *
 * Each entry claims an unclaimed heading of its own slug, by the first
 * preference below that finds one. The occurrence is exact, and no other
 * heading moving disturbs it. The two fallbacks place an entry stored before
 * the key existed, and one whose own occurrence has since been deleted.
 *
 * shortcut: a heading inserted above two that slugify alike shifts their
 * occurrences, so the ticks move with them until the next save. Upgrade when an
 * editor reports it — a stable id per heading node is the real answer, and only
 * Lexical can mint one.
 */
export function resolveStored(
  detected: TableOfContentsHeadings,
  stored: TableOfContentsHeadings,
): Set<number> {
  const claimed = new Set<number>()

  for (const entry of stored) {
    /** The first heading of this entry's slug that nothing has claimed yet. */
    const firstFree = (matches: (candidate: TableOfContentsHeadings[number]) => boolean) =>
      detected.findIndex(
        (candidate, i) => !claimed.has(i) && candidate.slug === entry.slug && matches(candidate),
      )

    let position =
      entry.occurrence === undefined ? -1 : firstFree((c) => c.occurrence === entry.occurrence)
    if (position === -1) position = firstFree((c) => c.text === entry.text)
    if (position === -1) position = firstFree(() => true)

    if (position !== -1) claimed.add(position)
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

/** The stored list rebuilt against a freshly scanned document. */
export function rebuildStored(
  detected: TableOfContentsHeadings,
  stored: TableOfContentsHeadings,
): TableOfContentsHeadings {
  return storedFrom(detected, resolveStored(detected, stored))
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

  return storedFrom(detected, next)
}
