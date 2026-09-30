#!/usr/bin/env node
/**
 * Create a manager directly against the database (#840).
 *
 * ⚠ **This is the only way to bootstrap an empty `managers` table.** Managers
 * hold no password, so Payload's `create-first-user` route answers `Forbidden`
 * like every other local-strategy operation, and `admin.autoLogin` needs a row
 * that already exists. A fresh database — a new local checkout, a restored
 * dump, a new environment — has no manager to invite the next one.
 *
 * It writes through the local API with `overrideAccess: true`, which is what
 * lets it run with no session: the routes are closed, the database is not.
 *
 * The account is created **accepted** (`_verified: true`), because nobody can
 * send this one an invitation. Every manager created afterwards should be
 * created in the admin panel and accept their own emailed invitation instead.
 *
 * Usage:
 *   pnpm tsx scripts/create-manager.ts <email> [name]
 *
 * Env vars required: DATABASE_URL, PAYLOAD_SECRET (as for any Payload CLI run).
 */
import dotenv from 'dotenv'
import { getPayload } from 'payload'

async function main(): Promise<void> {
  const [email, name] = process.argv.slice(2)
  if (!email) {
    console.error('Usage: pnpm tsx scripts/create-manager.ts <email> [name]')
    process.exit(1)
  }

  dotenv.config({ path: ['.env.local', '.env'] })
  const { default: configPromise } = await import('../src/payload.config')
  const payload = await getPayload({ config: await configPromise })

  const existing = await payload.find({
    collection: 'managers',
    where: { email: { equals: email.trim().toLowerCase() } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.docs[0]) {
    console.error(`A manager already exists for ${email} (id ${existing.docs[0].id}).`)
    process.exit(1)
  }

  const created = await payload.create({
    collection: 'managers',
    data: {
      email,
      name: name ?? email,
      type: 'admin',
      _verified: true,
    },
    // No invitation: an assignment would queue one, and a first admin has
    // nothing assigned to them yet.
    disableVerificationEmail: true,
    overrideAccess: true,
  })

  console.log(`Created admin manager ${created.email} (id ${created.id}).`)
  console.log('Sign in at /admin with "Email me a sign-in link".')
  process.exit(0)
}

void main()
