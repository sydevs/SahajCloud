/**
 * The slug each region the commit creates will carry.
 *
 * ⚠ **`Regions.slug` is unique collection-wide**, not per parent — the field is
 * declared with `collectionSlug: 'regions'` (`Regions.ts`), which validates it
 * against every region there is. So a batch proposing a city named like one on
 * the other side of the world has to disambiguate before the commit, or the
 * write fails on a constraint the volunteer cannot read.
 *
 * ⚠ **The disambiguation is the Atlas seed's own rule**, `name` then
 * `name-parent` (`buildRegionSlugs`, `seeds/atlas/import.ts`): Georgia the
 * country keeps `georgia` and Georgia the state becomes `georgia-united-states`.
 * Matching it matters because both writers share one namespace — an importer
 * inventing its own shape would make two spellings of the same answer, and the
 * reviewer could not tell which node a slug names.
 *
 * ⚠ **The numeric tail is this file's own, because the seed's is a legacy id.**
 * An imported node has none, so a third spelling of the same name falls back to
 * a counter rather than to something a reader would mistake for an id.
 */

import { slugifyValue } from '@/lib/utilities/slugify'

import { comparableKey } from '../resolve/duplicates'

export interface SluggableNode {
  key: string
  name: string
  /**
   * Used only when the name slugifies to nothing — a node named entirely in
   * punctuation still needs a slug.
   */
  level: string
  /** The parent's name, which is the first disambiguator. Null under a country. */
  parentName: string | null
}

/**
 * A slug per node key, unique among themselves and against `taken`.
 *
 * Assigned in the order given, so the caller's ordering decides which of two
 * same-named nodes keeps the bare slug. The proposal passes nodes parent-first,
 * which is what the seed's level sort achieves there.
 */
export function assignSlugs(
  nodes: readonly SluggableNode[],
  taken: Iterable<string>,
): Map<string, string> {
  const used = new Set<string>()
  for (const slug of taken) {
    // `comparableKey`, not a second trim-and-lowercase: it is the one
    // normalisation this import compares text with (`duplicates.ts`).
    const key = comparableKey(slug)
    if (key) used.add(key)
  }

  const slugs = new Map<string, string>()
  for (const node of nodes) {
    const base = slugifyValue(node.name) || slugifyValue(node.level) || 'region'
    const slug = firstFree(base, node.parentName, used)
    used.add(slug)
    slugs.set(node.key, slug)
  }
  return slugs
}

function firstFree(base: string, parentName: string | null, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base

  const parent = parentName ? slugifyValue(parentName) : ''
  // `parent !== base` because a city named after its state would otherwise
  // propose `berlin-berlin`, which disambiguates nothing a reader can use.
  if (parent && parent !== base && !used.has(`${base}-${parent}`)) return `${base}-${parent}`

  // From 2, so the first duplicate reads as the second of its name.
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
}
