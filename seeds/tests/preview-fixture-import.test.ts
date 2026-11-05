/**
 * `pnpm seed preview-fixture` — the content CI puts into every Railway preview.
 *
 * This is the only place the fixture's shape is checked against the real
 * collections. A Railway preview is built by the pull request that gates it, so
 * a fixture that refuses to write there cannot be fixed by re-running CI, and
 * the failure arrives as a red check on a change about something else entirely.
 *
 * Two things it asks that nothing else can: does every row this fixture claims
 * actually write, and does a second run leave the same counts.
 *
 * Named `*.test.ts`, not `*.int.spec.ts`: `seeds/**` is included in the int
 * project by that pattern (`vitest.config.mts`).
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from 'tests/utils/testHelpers'

import { PreviewFixtureImporter } from '../preview-fixture/import'

describe('seed: preview-fixture', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  const runSeed = () =>
    new PreviewFixtureImporter({ clearCache: false, dryRun: false, payload }).run()

  const count = (collection: 'events' | 'forms' | 'managers' | 'regions' | 'users') =>
    payload.count({ collection, overrideAccess: true }).then((r) => r.totalDocs)

  const submissions = (where: Record<string, unknown>) =>
    payload
      .count({ collection: 'user-submissions', where: where as never, overrideAccess: true })
      .then((r) => r.totalDocs)

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    await runSeed()
  }, 180_000)

  afterAll(async () => {
    await cleanup()
  })

  it('writes the three-level region tree, with each node under the last', async () => {
    const { docs } = await payload.find({
      collection: 'regions',
      depth: 0,
      overrideAccess: true,
      sort: 'level',
    })
    const byLevel = new Map(docs.map((doc) => [doc.level, doc]))

    expect(await count('regions')).toBe(3)
    expect(byLevel.get('city')?.parent).toBe(byLevel.get('country')?.id)
    expect(byLevel.get('venue')?.parent).toBe(byLevel.get('city')?.id)
  })

  it('writes two managers a preview can actually sign in as', async () => {
    // ⚠ `_verified` is the whole of it: the JWT strategy yields no user while
    // that flag is false, so an unaccepted manager appears in the sign-in
    // picker and signs nobody in.
    const { docs } = await payload.find({ collection: 'managers', depth: 0, overrideAccess: true })
    const fixture = docs.filter((doc) => doc.email.endsWith('@sahaj-preview.invalid'))

    expect(fixture).toHaveLength(2)
    for (const manager of fixture) expect(manager._verified).toBe(true)
  })

  it('publishes both events, each on a schedule that still runs', async () => {
    const { docs } = await payload.find({
      collection: 'events',
      depth: 0,
      overrideAccess: true,
    })

    expect(docs).toHaveLength(2)
    for (const event of docs) {
      expect(event._status).toBe('published')
      // An event with no schedule shows nothing on the map, the calendar or
      // the listing — the pages most changes here are about.
      expect(event.schedule?.firstDate).toBeTruthy()
      expect(event.inactive).toBe(false)
    }
  })

  it('gives the two events different managers, so a reviewer can compare views', async () => {
    const { docs } = await payload.find({ collection: 'events', depth: 0, overrideAccess: true })
    const managers = new Set(docs.map((doc) => doc.manager))

    expect(managers.size).toBe(2)
  })

  it('writes 8 registrations and 5 messages, covering all five statuses', async () => {
    const statuses = ['pending', 'accepted', 'rejected', 'spam', 'failed'] as const

    expect(await submissions({ type: { equals: 'registration' } })).toBe(8)
    expect(await submissions({ type: { equals: 'contact' } })).toBe(5)
    for (const status of statuses) {
      expect(
        await submissions({ type: { equals: 'contact' }, status: { equals: status } }),
        `one contact message per status, missing ${status}`,
      ).toBe(1)
      expect(
        await submissions({ type: { equals: 'registration' }, status: { equals: status } }),
        `at least one registration at ${status}`,
      ).toBeGreaterThan(0)
    }
  })

  it('reaches a pending registration, which a create cannot', async () => {
    // ⚠ A created-`pending` row queues screening, a screening pass leaves it
    // `pending`, and delivery then writes `accepted` — because a registration's
    // `deliveredStatus` is `accepted`. Both guards read the status at create,
    // so the fixture authors a terminal status and updates to `pending`
    // afterwards. This is the floor `COLLECTION_METADATA` also states.
    expect(
      await submissions({
        and: [{ status: { equals: 'pending' } }, { type: { equals: 'registration' } }],
      }),
    ).toBeGreaterThan(0)
  })

  it('names every registrant, so the Registrations page shows something', async () => {
    const { docs } = await payload.find({
      collection: 'user-submissions',
      depth: 0,
      overrideAccess: true,
      where: { type: { equals: 'registration' } } as never,
    })

    expect(await count('users')).toBe(6)
    for (const row of docs) expect(row.user).toBeTruthy()
  })

  it('puts no real person in — every address is on a .invalid domain', async () => {
    // The promise is about what CI writes and nothing else: a reviewer may
    // still point the `atlas` script at a preview and load real coordinators.
    const { docs } = await payload.find({ collection: 'users', depth: 0, overrideAccess: true })

    for (const user of docs) expect(user.email).toMatch(/\.invalid$/)
  })

  it('creates nothing twice', async () => {
    const before = {
      events: await count('events'),
      forms: await count('forms'),
      managers: await count('managers'),
      regions: await count('regions'),
      submissions: await submissions({}),
      users: await count('users'),
    }

    await runSeed()

    expect({
      events: await count('events'),
      forms: await count('forms'),
      managers: await count('managers'),
      regions: await count('regions'),
      submissions: await submissions({}),
      users: await count('users'),
    }).toEqual(before)
  }, 180_000)
})
