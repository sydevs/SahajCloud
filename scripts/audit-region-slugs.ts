#!/usr/bin/env node
/**
 * Report regions with a blank slug, and the damage each one does (#634).
 *
 * A region's slug is one segment of every canonical URL beneath it. So a
 * blank slug silently costs that region, its whole descendant subtree,
 * and every event inside them their `webPath` and `webUrl`.
 * `buildRegionPath` refuses a chain with a gap, rather than emitting
 * `//`.
 *
 * **Read-only, always.** There is no `--force`. The right name for each
 * of these regions cannot come from the data, so fixing them is a human
 * decision, made in the admin panel or by the Atlas importer. This
 * script exists to say exactly which rows need that decision, and what
 * each one costs, so `withNonEmptySlug`'s grandfather clause can
 * eventually be dropped.
 *
 * Usage:
 *   pnpm tsx scripts/audit-region-slugs.ts
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { relationId } from '../src/lib/utilities/relationId'

interface RegionRow {
  id: number
  name?: string | null
  slug?: string | null
  level?: string | null
  breadcrumbs?: Array<{ doc?: unknown }> | null
}

async function loadPayload(): Promise<Payload> {
  dotenv.config({ path: ['.env.local', '.env'] })
  const { default: configPromise } = await import('../src/payload.config')
  return getPayload({ config: await configPromise })
}

async function main(): Promise<void> {
  const payload = await loadPayload()

  const { docs } = await payload.find({
    collection: 'regions',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, slug: true, level: true, breadcrumbs: true },
  })
  const rows = docs as RegionRow[]

  const blank = rows.filter((row) => typeof row.slug !== 'string' || row.slug.trim() === '')
  if (blank.length === 0) {
    console.log(`All ${rows.length} regions have a slug. Nothing to fix.`)
    process.exit(0)
  }

  const blankIds = new Set(blank.map((row) => row.id))
  // A region counts as collateral when a blank-slugged region sits
  // anywhere in its ancestry. That is exactly the set whose canonical
  // URLs cannot be built.
  const affected = rows.filter((row) =>
    (row.breadcrumbs ?? []).some((crumb) => {
      const id = relationId(crumb?.doc)
      return id !== null && blankIds.has(id)
    }),
  )

  // This is every region whose canonical URL cannot be built: the blank
  // ones, plus everything that inherits the gap. One `events` query
  // covers the whole set, tallied in memory. A separate count per region
  // would cost one round trip each.
  const affectedIds = new Set([...blankIds, ...affected.map((row) => row.id)])
  const { docs: eventDocs } = await payload.find({
    collection: 'events',
    where: { region: { in: [...affectedIds] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { region: true },
  })
  const eventsByRegion = new Map<number, number>()
  for (const doc of eventDocs) {
    const id = relationId((doc as { region?: unknown }).region)
    if (id !== null) eventsByRegion.set(id, (eventsByRegion.get(id) ?? 0) + 1)
  }

  console.log(`${blank.length} of ${rows.length} regions have a blank slug:\n`)
  for (const row of blank) {
    console.log(
      `  regions#${row.id}  level=${row.level ?? '?'}  name=${JSON.stringify(row.name ?? '')}` +
        `  events=${eventsByRegion.get(row.id) ?? 0}`,
    )
  }

  const collateral = affected.filter((row) => !blankIds.has(row.id)).length
  console.log(
    `\n${collateral} further region(s) inherit the gap and resolve no canonical URL either,` +
      ` and ${eventDocs.length} event(s) sit somewhere in the affected set.`,
  )
  console.log('Fix: give each region above a name (or set its slug) in the admin panel.')
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
