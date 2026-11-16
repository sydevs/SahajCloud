import type { FixtureSlug } from './types'
import type { FlattenedField, SanitizedCollectionConfig } from 'payload'

/** Visit every field at every depth: groups, tabs, arrays and blocks included. */
export function walkFields(fields: FlattenedField[], visit: (field: FlattenedField) => void): void {
  for (const field of fields) {
    visit(field)
    if ('flattenedFields' in field) walkFields(field.flattenedFields, visit)
    if (field.type === 'blocks') {
      for (const block of field.blocks ?? []) walkFields(block.flattenedFields, visit)
    }
  }
}

/** The collections a collection's relationship and upload columns point at. */
export function relationTargets(config: SanitizedCollectionConfig): Set<string> {
  const targets = new Set<string>()
  walkFields(config.flattenedFields, (field) => {
    if (field.type !== 'relationship' && field.type !== 'upload') return
    for (const slug of [field.relationTo].flat()) targets.add(slug)
  })
  return targets
}

/**
 * The fixture's collections, each after every collection it points at.
 *
 * A row's relationship columns are foreign keys, so a row can only be written
 * once what it names exists. A collection pointing at itself (a region's parent)
 * is ordered within its own file, parents first. A cycle between two
 * collections cannot be ordered at all, so it throws, naming the cycle.
 */
export function fixtureOrder(
  collections: SanitizedCollectionConfig[],
  slugs: readonly FixtureSlug[],
): FixtureSlug[] {
  const wanted = new Set<string>(slugs)
  const deps = new Map<string, string[]>()
  for (const config of collections) {
    if (!wanted.has(config.slug)) continue
    const targets = [...relationTargets(config)].filter((t) => t !== config.slug && wanted.has(t))
    deps.set(config.slug, targets)
  }

  const order: FixtureSlug[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (slug: string, path: string[]): void => {
    if (state.get(slug) === 'done') return
    if (state.get(slug) === 'visiting') {
      throw new Error(`Fixture collections form a cycle: ${[...path, slug].join(' → ')}`)
    }
    state.set(slug, 'visiting')
    for (const dep of deps.get(slug) ?? []) visit(dep, [...path, slug])
    state.set(slug, 'done')
    order.push(slug as FixtureSlug)
  }
  for (const slug of slugs) visit(slug, [])
  return order
}
