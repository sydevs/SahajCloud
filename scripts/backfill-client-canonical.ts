#!/usr/bin/env node
/**
 * Seed `canonical.domain` / `canonical.routing` on imported Atlas services from
 * their raw legacy record (#633).
 *
 * A convenience, not a migration: it saves whoever designates a canonical owner
 * from retyping a domain someone already recorded. **`canonical.enabled` is
 * never written** — the legacy values are unverified and wrong in places
 * (`sahajayoga.at` records `embed_type: 'script'` while serving an iframe), so a
 * human confirms each one against the embeds the widget reports before anything
 * resolves differently.
 *
 * Reads `legacyData.config`, not the removed `legacyConfig` field, so it stays
 * runnable after the drop migration applies. The derivation itself lives in
 * `src/collections/Clients/canonicalSeed.ts`.
 *
 * Reports by default; writes only with `--force`. Re-runnable — a service that
 * already has a value keeps it, so a second pass finds nothing to do (pass
 * `--overwrite` to re-seed from legacy anyway).
 *
 * Usage:
 *   pnpm tsx scripts/backfill-client-canonical.ts               # dry run
 *   pnpm tsx scripts/backfill-client-canonical.ts --force       # apply
 *   pnpm tsx scripts/backfill-client-canonical.ts --force --overwrite
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { getPayload } from 'payload'

import { canonicalSeedFromLegacy } from '../src/collections/Clients/canonicalSeed'

interface Args {
  force: boolean
  overwrite: boolean
}

function parseArgs(argv: string[]): Args {
  let force = false
  let overwrite = false

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--force') {
      force = true
    } else if (arg === '--overwrite') {
      overwrite = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { force, overwrite }
}

/**
 * The Payload config validates the whole server env when it's imported, and ESM
 * hoists every static import above the module body — so dotenv has to run first
 * and the config has to be pulled in dynamically.
 */
async function loadPayload(): Promise<Payload> {
  // Shell env wins, then .env.local, then .env (see seeds/env.ts).
  dotenv.config({ path: ['.env.local', '.env'] })
  const { default: configPromise } = await import('../src/payload.config')
  return getPayload({ config: await configPromise })
}

async function main(): Promise<void> {
  const { force, overwrite } = parseArgs(process.argv)

  console.log(
    force
      ? 'APPLYING — seeding canonical.domain / canonical.routing. `enabled` is never written.\n'
      : 'DRY RUN — no rows will be written. Re-run with --force to apply.\n',
  )

  const payload = await loadPayload()

  // Every service, unpublished ones included — a disabled Atlas service imports
  // as a draft and is exactly the kind someone may publish later, so it should
  // already carry its starting values when they do. `overrideAccess` is what
  // makes them visible: no `_status` filter is applied, and no `draft: true`
  // either, so this reads and writes the same row the rest of the feature does.
  const { docs } = await payload.find({
    collection: 'clients',
    pagination: false,
    depth: 0,
    select: { name: true, canonical: true, legacyData: true },
    overrideAccess: true,
  })

  let seeded = 0
  let skipped = 0
  let failed = 0

  for (const client of docs) {
    const seed = canonicalSeedFromLegacy(client.legacyData)
    if (!seed) {
      skipped++
      continue
    }

    // Only fill what is empty, so a hand-corrected value is never clobbered by a
    // legacy one that is probably worse.
    const data: { domain?: string; routing?: 'query' | 'path' } = {}
    if (seed.domain && (overwrite || !client.canonical?.domain)) data.domain = seed.domain
    if (seed.routing && (overwrite || !client.canonical?.routing)) data.routing = seed.routing

    if (Object.keys(data).length === 0) {
      skipped++
      continue
    }

    const summary = Object.entries(data)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ')

    if (!force) {
      console.log(`  clients#${client.id} (${client.name}): ${summary} (dry run)`)
      seeded++
      continue
    }

    try {
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { canonical: data },
        overrideAccess: true,
      })
      console.log(`  clients#${client.id} (${client.name}): ${summary}`)
      seeded++
    } catch (error) {
      failed++
      console.error(
        `  clients#${client.id} (${client.name}): FAILED — ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  console.log(
    `\nscanned ${docs.length}, ${force ? 'seeded' : 'would seed'} ${seeded}, ` +
      `nothing to seed ${skipped}, failed ${failed}`,
  )

  if (failed > 0) {
    console.error(`Completed with ${failed} failure(s).`)
    process.exit(1)
  }
  console.log('Done.')
  process.exit(0)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
