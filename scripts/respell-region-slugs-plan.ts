/**
 * The decision half of `scripts/respell-region-slugs.ts`.
 *
 * Pure — no database — so `tests/unit/respell-region-slugs-plan.spec.ts`
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

export interface RespellPlan {
  renames: SlugChange[]
  /** The new spelling is already a region's slug. Left as is. */
  collisions: SlugChange[]
  /** A slug not generated from the region's name. Left as is. */
  unmatched: Array<{ id: number; name: string; slug: string }>
}

const hasStem = (slug: string, stem: string) => slug === stem || slug.startsWith(`${stem}-`)

/**
 * A slug is re-spelled only when it is the old spelling of the region's own
 * name, alone or with a disambiguating suffix (`sofiya-2 → софия-2`). The suffix
 * is kept as it is, and a slug someone typed by hand is reported, never
 * guessed at.
 */
export function planRespelledSlugs(
  rows: ReadonlyArray<{ id: number; name?: string | null; slug?: string | null }>,
): RespellPlan {
  const plan: RespellPlan = { renames: [], collisions: [], unmatched: [] }
  const taken = new Set(rows.map((row) => row.slug))

  for (const { id, name, slug } of [...rows].sort((a, b) => a.id - b.id)) {
    if (!name || !slug) continue
    // The `slugify` library's ASCII spelling, which every slug had before.
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
