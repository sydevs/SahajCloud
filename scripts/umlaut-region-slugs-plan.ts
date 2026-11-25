/**
 * The decision half of `scripts/umlaut-region-slugs.ts`.
 *
 * Pure — no database — so `tests/unit/umlaut-region-slugs-plan.spec.ts`
 * covers it.
 */
import slugify from 'slugify'

import { slugifyValue } from '../src/fields/slugify'

export interface SlugChange {
  id: number
  name: string
  from: string
  to: string
}

export interface UmlautSlugPlan {
  renames: SlugChange[]
  /** The new spelling is already a region's slug. Left as is. */
  collisions: SlugChange[]
  /** A name with an umlaut whose slug was not generated from it. Left as is. */
  unmatched: Array<{ id: number; name: string; slug: string }>
}

const hasStem = (slug: string, stem: string) => slug === stem || slug.startsWith(`${stem}-`)

/**
 * A slug is re-spelled only when it is the old spelling of the region's own
 * name, alone or with a disambiguating suffix (`koln-2 → koeln-2`). The suffix
 * is kept as it is, and a slug someone typed by hand is reported, never
 * guessed at.
 */
export function planUmlautSlugs(
  rows: ReadonlyArray<{ id: number; name?: string | null; slug?: string | null }>,
): UmlautSlugPlan {
  const plan: UmlautSlugPlan = { renames: [], collisions: [], unmatched: [] }
  const taken = new Set(rows.map((row) => row.slug))

  for (const { id, name, slug } of [...rows].sort((a, b) => a.id - b.id)) {
    if (!name || !slug) continue
    // The library's own spelling (`ü → u`), which every slug had before the umlaut rule.
    const before = slugify(name, { lower: true, strict: true })
    const after = slugifyValue(name)
    if (before === after || hasStem(slug, after)) continue
    if (!hasStem(slug, before)) {
      plan.unmatched.push({ id, name, slug })
      continue
    }

    const change = { id, name, from: slug, to: after + slug.slice(before.length) }
    if (taken.has(change.to)) {
      plan.collisions.push(change)
    } else {
      plan.renames.push(change)
      taken.add(change.to)
    }
  }

  return plan
}
