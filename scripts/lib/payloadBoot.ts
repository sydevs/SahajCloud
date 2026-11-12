import type { Payload } from 'payload'

import { getPayload } from 'payload'

/**
 * The adapter properties the boot turns off, asserted present before they are written.
 *
 * ⚠ **Presence is the only check worth making.** A write to a renamed key lands on a fresh
 * property and reads back as whatever it was set to, so reading one back proves nothing. `connect`
 * pushes the dev schema, or applies `prodMigrations` under `NODE_ENV=production`, so a Payload
 * rename has to fail here rather than leave an operator script a schema writer against production.
 */
const SCHEMA_KEYS = ['push', 'prodMigrations', 'connect'] as const

/**
 * Boot Payload against whatever `DATABASE_URL` names, with no schema push, no pending migration
 * and no `onInit`, whatever `NODE_ENV` says — so an operator script is safe to point at
 * production. What the script itself writes is still its own business.
 */
export async function loadPayloadWithoutSchemaChanges(): Promise<Payload> {
  const { default: configPromise } = await import('../../src/payload.config')
  const payload = await getPayload({
    config: await configPromise,
    disableDBConnect: true,
    disableOnInit: true,
  })
  const db = payload.db as typeof payload.db & { prodMigrations?: unknown; push?: boolean }
  for (const key of SCHEMA_KEYS) {
    if (!(key in db)) {
      throw new Error(
        `payload.db has no \`${key}\`: this boot can no longer prove it changes no schema.`,
      )
    }
  }
  db.push = false
  db.prodMigrations = undefined
  await db.connect?.()
  return payload
}

/**
 * Exit once stdout has flushed. On a pipe it flushes asynchronously, so an immediate exit can cut
 * the report, and without an exit the Payload boot's open handles keep the process alive.
 */
export const exitAfterFlush = (code: number) => process.stdout.write('', () => process.exit(code))
