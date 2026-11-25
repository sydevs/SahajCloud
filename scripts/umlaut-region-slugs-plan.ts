/**
 * The decision half of `scripts/umlaut-region-slugs.ts`: which region slugs
 * to re-spell now that `slugifyValue` writes umlauts as `ae`/`oe`/`ue`
 * (`universitat-trier → universitaet-trier`).
 *
 * Pure — no database — so `tests/unit/umlaut-region-slugs-plan.spec.ts`
 * covers it. The CLI half reads and writes regions.
 */
import { slugifyAnchor, slugifyValue } from '../src/fields/slugify'

export interface RegionSlugRow {
  id: number
  name?: string | null
  slug?: string | null
}

export interface SlugChange {
  id: number
  name: string
  from: string
  to: string
}

export interface UmlautSlugPlan {
  renames: SlugChange[]
  /** The new spelling is already another region's slug. Left as is. */
  collisions: SlugChange[]
  /** A name with an umlaut whose slug was not generated from it. Left as is. */
  unmatched: Array<{ id: number; name: string; slug: string }>
}

/**
 * A slug is re-spelled only when it is the old spelling of the region's own
 * name, alone or with the importer's disambiguating suffix
 * (`neustadt-baden-wurttemberg`). A slug someone typed by hand is reported,
 * never guessed at.
 */
export function planUmlautSlugs(rows: readonly RegionSlugRow[]): UmlautSlugPlan {
  const plan: UmlautSlugPlan = { renames: [], collisions: [], unmatched: [] }
  const candidates: SlugChange[] = []

  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const name = row.name ?? ''
    const slug = row.slug ?? ''
    if (!name || !slug) continue

    // `slugifyAnchor` is the spelling every slug had before the umlaut rule.
    const before = slugifyAnchor(name)
    const after = slugifyValue(name)
    if (before === after) continue
    if (slug === after || slug.startsWith(`${after}-`)) continue

    if (slug === before) candidates.push({ id: row.id, name, from: slug, to: after })
    else if (slug.startsWith(`${before}-`))
      candidates.push({ id: row.id, name, from: slug, to: after + slug.slice(before.length) })
    else plan.unmatched.push({ id: row.id, name, slug })
  }

  const renamed = new Set(candidates.map((change) => change.id))
  const taken = new Set(
    rows.filter((row) => row.slug && !renamed.has(row.id)).map((row) => row.slug as string),
  )
  for (const change of candidates) {
    if (taken.has(change.to)) {
      plan.collisions.push(change)
      taken.add(change.from)
    } else {
      plan.renames.push(change)
      taken.add(change.to)
    }
  }

  return plan
}
