/**
 * The `preview` seed: example submissions of every type for a PR preview.
 *
 * The property that matters most is the one a preview cannot show: a preview
 * inherits production's variables, so a seeded row that reached delivery would
 * mail real recipients. Asserted by draining the screening queue and finding
 * nothing queued behind it.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PreviewImporter } from '../../seeds/preview/import'
import { createTestEnvironment } from '../utils/testHelpers'

describe('preview seed', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  const seed = () => new PreviewImporter({ dryRun: false, clearCache: false, payload }).run()

  const seeded = () =>
    payload.find({
      collection: 'user-submissions',
      where: { uuid: { like: '00000000-0000-4000-8000-' } },
      depth: 0,
      pagination: false,
    })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    await seed()
  })

  afterAll(async () => {
    await cleanup()
  })

  it('seeds every type, in the statuses a reviewer needs', async () => {
    const { docs } = await seeded()
    const pairs = new Set(docs.map((doc) => `${doc.type}:${doc.status}`))

    expect(docs).toHaveLength(12)
    expect([...pairs].sort()).toEqual(
      [
        'contact:accepted',
        'contact:failed',
        'contact:pending',
        'contact:spam',
        'proposal:pending',
        'proposal:rejected',
        'registration:accepted',
        'subscribe:accepted',
      ].sort(),
    )
    // Every row has a sender on record, and only reserved addresses.
    for (const doc of docs) {
      expect(doc.senderEmail).toMatch(/@example\.org$/)
    }
  })

  it('blocks one Registrant, whose submission reads as a blocked-sender refusal', async () => {
    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: 'blocked.sender@example.org' } },
      depth: 0,
    })
    expect(docs[0]?.blockedAt).toEqual(expect.any(String))

    const { docs: refused } = await payload.find({
      collection: 'user-submissions',
      where: { user: { equals: docs[0]!.id } },
      depth: 0,
    })
    expect(refused.map((row) => row.screeningResult?.verdict)).toEqual(['blocked_sender'])
  })

  it('queues nothing for delivery, so a preview mails nobody', async () => {
    await payload.jobs.run({ queue: 'screening' })

    const { totalDocs } = await payload.count({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'deliverSubmission' } },
    })
    expect(totalDocs).toBe(0)

    const { docs } = await seeded()
    expect(docs.filter((doc) => doc.status === 'pending')).toHaveLength(3)
  })

  it('skips everything on a second run', async () => {
    await seed()
    const { docs } = await seeded()
    expect(docs).toHaveLength(12)
    const { totalDocs: events } = await payload.count({
      collection: 'events',
      where: { contactName: { equals: 'Preview Seed Host' } },
    })
    expect(events).toBe(1)
  })
})
