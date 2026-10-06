/**
 * The commit under the conditions that break a naive one (#828): two callers at
 * once, a request that dies part-way, a second batch of the same file, a role
 * revoked mid-flight, and the reviewer's own decisions about duplicates and
 * invitations.
 *
 * ⚠ **Each case reproduces a failure an adversarial run proved against the
 * real database** — 12 classes for 6 lines from two concurrent commits, 41 for
 * 21 after a failed write-back, every row of a second batch imported again. The
 * assertions are counts of classes per CSV line, because a duplicate listing is
 * what a seeker sees.
 *
 * ⚠ **Every row is a hall of its own**, kilometres from any other: the commit
 * re-asks the duplicate question of every row it writes, against every class in
 * the target, and one database serves the whole file.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { recordEventImportChoices } from '@/collections/EventImports/endpoints/choices'
import { commitEventImport } from '@/collections/EventImports/endpoints/commit'
import { relationId } from '@/lib/utilities/relationId'
import type {
  Event,
  EventImport,
  EventImportProposedRegions,
  EventImportRows,
  Manager,
  Region,
} from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type Node = EventImportProposedRegions['nodes'][number]
type Row = EventImportRows[number]

const ANCHOR = '2026-01-05'
let hallSerial = 0

function row(line: number, values: Record<string, string> = {}): Row {
  const hall = (hallSerial += 1)
  return {
    line,
    values: {
      title: `Class ${line}`,
      eventType: 'offline',
      country: 'DE',
      city: 'Berlin',
      address: `Hardening Street ${hall}`,
      scheduleType: 'weekly',
      startTime: '18:30',
      weekdays: 'TU',
      ...values,
    },
    resolved: {
      latitude: 52 + hall * 0.02,
      longitude: 13.4,
      timezone: 'Europe/Berlin',
      cityKey: 'berlin',
      placeName: 'Berlin',
      placeId: 'place.berlin',
      mapboxId: `address.hardening.${hall}`,
      subdivisionCode: 'BE',
      weekdayMask: 0b10,
      startMinutes: 1110,
      languages: ['de'],
      inactive: false,
      anchorDate: ANCHOR,
    },
  }
}

function cityNode(tag: string, lines: number[]): Node {
  return {
    key: `city:id:mbx-hd-${tag}`,
    level: 'city',
    name: `Berlin ${tag}`,
    parentKey: null,
    match: { kind: 'create' },
    slug: `berlin-hd-${tag}`,
    location: { kind: 'mapbox', mapboxId: `mbx-hd-${tag}` },
    lines,
  }
}

function tree(nodes: Node[]): EventImportProposedRegions {
  return { nodes, rowErrors: [], stateLayer: { proposed: false, reason: 'one subdivision' } }
}

describe('commit hardening', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let uploader: Manager
  let germany: Region

  const reqAs = (user: Manager, id: number, body?: unknown): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      routeParams: { id: String(id) },
      user,
      locale: 'en',
      context: {},
      json: async () => {
        if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
        return body
      },
    }) as unknown as PayloadRequest

  async function commit(user: Manager, id: number) {
    const response = (await commitEventImport.handler(reqAs(user, id))) as Response
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  async function choose(user: Manager, id: number, body: unknown) {
    const response = (await recordEventImportChoices.handler(reqAs(user, id, body))) as Response
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  const createBatch = (overrides: FixtureOverrides<EventImport> = {}) =>
    payload.create({
      collection: 'event-imports',
      data: createData<'event-imports'>({
        targetRegion: germany.id,
        uploader: uploader.id,
        defaultLanguages: ['de'],
        status: 'resolved',
        uploadLocale: 'en',
        ...overrides,
      }),
      overrideAccess: true,
    })

  /** Classes carrying a title, which is what one CSV line becomes. */
  const classesTitled = async (title: string): Promise<Event[]> =>
    (
      await payload.find({
        collection: 'events',
        where: { title: { equals: title } },
        depth: 0,
        pagination: false,
        overrideAccess: true,
        trash: true,
      })
    ).docs as Event[]

  /** Run the commit to its end, the way the review loop does. */
  async function commitToEnd(user: Manager, id: number) {
    for (let call = 0; call < 10; call++) {
      const answer = await commit(user, id)
      if (answer.status !== 200 || answer.body.done) return answer
    }
    throw new Error('the commit never finished')
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    uploader = await testData.createManager(payload, {
      name: 'Hardening Uploader',
      email: 'hardening-uploader@example.com',
      roles: ['atlas-manager'],
    })
    germany = await testData.createRegion(payload, {
      name: 'Germany',
      level: 'country',
      managers: [uploader.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  /** 12 classes for 6 lines, when two calls each wrote the whole chunk. */
  it('writes each line once when two commits run at the same time', async () => {
    const lines = [2, 3, 4, 5, 6, 7]
    const batch = await createBatch({
      rows: lines.map((line) => row(line, { title: `Concurrent ${line}` })),
      proposedRegions: tree([cityNode('cc', lines)]),
    })

    const [first, second] = await Promise.all([
      commit(uploader, batch.id),
      commit(uploader, batch.id),
    ])

    // One of them held the batch; the other was told to wait, not let through.
    expect([first.status, second.status].sort()).toEqual([200, 409])
    expect([first.body, second.body].find((body) => body.busy)).toBeTruthy()
    for (const line of lines) expect(await classesTitled(`Concurrent ${line}`)).toHaveLength(1)
  })

  /**
   * ⚠ **41 classes for 21 lines**, when the chunk's write-back failed after its
   * creates and every Resume created them again. Each class's `importKey` is
   * what a retry finds.
   */
  it('creates no second class when the chunk’s write-back fails after its creates', async () => {
    const lines = [2, 3, 4]
    const batch = await createBatch({
      rows: lines.map((line) => row(line, { title: `Writeback ${line}` })),
      proposedRegions: tree([cityNode('wb', lines)]),
    })

    const original = payload.update.bind(payload)
    const update = vi.spyOn(payload, 'update').mockImplementation((async (args: never) => {
      const { collection, data } = args as { collection: string; data: { rows?: unknown } }
      if (collection === 'event-imports' && data.rows) throw new Error('connection terminated')
      return original(args)
    }) as never)
    await expect(commit(uploader, batch.id)).rejects.toThrow('connection terminated')
    update.mockRestore()

    await commitToEnd(uploader, batch.id)

    for (const line of lines) expect(await classesTitled(`Writeback ${line}`)).toHaveLength(1)
  })

  /**
   * A dropped connection is not the row's fault, so the row stays pending and
   * the next call writes it — rather than reporting it skipped and finishing.
   */
  it('leaves a row a transient error stopped for the next call, never refusing it', async () => {
    const batch = await createBatch({
      rows: [row(2, { title: 'Transient 2' }), row(3, { title: 'Transient 3' })],
      proposedRegions: tree([cityNode('tr', [2, 3])]),
    })

    const original = payload.create.bind(payload)
    let failed = false
    const create = vi.spyOn(payload, 'create').mockImplementation((async (args: never) => {
      const { collection } = args as { collection: string }
      if (collection === 'events' && !failed) {
        failed = true
        throw new Error('connection terminated unexpectedly')
      }
      return original(args)
    }) as never)
    const interrupted = await commit(uploader, batch.id)
    create.mockRestore()

    expect(interrupted.status).toBe(503)
    expect(interrupted.body).toMatchObject({ done: false })

    const finished = await commitToEnd(uploader, batch.id)
    expect((finished.body.finished as { skipped: unknown[] }).skipped).toEqual([])
    expect(await classesTitled('Transient 2')).toHaveLength(1)
    expect(await classesTitled('Transient 3')).toHaveLength(1)
  })

  /**
   * Two volunteers — or one, twice — reviewing the same file before either
   * commits. The second commit finds the first's classes and skips them.
   */
  it('skips a line a class added since the review already holds', async () => {
    const first = row(2, { title: 'Twice' })
    const second: Row = { ...first, values: { ...first.values } }
    const a = await createBatch({ rows: [first], proposedRegions: tree([cityNode('t1', [2])]) })
    const b = await createBatch({ rows: [second], proposedRegions: tree([cityNode('t1', [2])]) })

    await commitToEnd(uploader, a.id)
    const later = await commitToEnd(uploader, b.id)

    expect(await classesTitled('Twice')).toHaveLength(1)
    const skipped = (later.body.finished as { skipped: { reasons: string[] }[] }).skipped
    expect(skipped[0]?.reasons[0]).toContain('added after you reviewed this batch')
  })

  /** Ownership of the region outlives a revoked role; the import must not. */
  it('refuses a commit by a manager whose role was revoked after the upload', async () => {
    const revoked = await testData.createManager(payload, {
      name: 'Revoked',
      email: 'hardening-revoked@example.com',
      roles: [],
    })
    await payload.update({
      collection: 'regions',
      id: germany.id,
      data: { managers: [uploader.id, revoked.id] },
      overrideAccess: true,
    })
    const batch = await createBatch({
      uploader: revoked.id,
      rows: [row(2, { title: 'Revoked 2' })],
      proposedRegions: tree([cityNode('rv', [2])]),
    })

    const { status } = await commit(revoked, batch.id)

    expect(status).toBe(403)
    expect(await classesTitled('Revoked 2')).toHaveLength(0)
  })

  /**
   * A zone outside Payload's curated default list. A test database built with
   * that list passes `isSupportedTimezone` here and then refuses the class in
   * Postgres — a failure no production write can have.
   */
  it('writes a class in a zone beyond Payload’s default list', async () => {
    const oslo = row(2, { title: 'Oslo class' })
    oslo.resolved = { ...oslo.resolved!, timezone: 'Europe/Oslo' }
    const batch = await createBatch({ rows: [oslo], proposedRegions: tree([cityNode('os', [2])]) })

    await commitToEnd(uploader, batch.id)

    const [created] = await classesTitled('Oslo class')
    expect(created?.schedule?.firstDate_tz).toBe('Europe/Oslo')
  })

  /** Regions are live the moment they are written, so an empty one is a dead place. */
  it('removes a region it opened whose every line then failed', async () => {
    const doomed = { ...row(2, { title: 'Doomed' }) }
    doomed.resolved = { ...doomed.resolved!, timezone: 'Mars/Olympus_Mons' }
    const batch = await createBatch({
      rows: [doomed],
      proposedRegions: tree([cityNode('em', [2])]),
    })

    await commitToEnd(uploader, batch.id)

    const left = await payload.find({
      collection: 'regions',
      where: { slug: { equals: 'berlin-hd-em' } },
      overrideAccess: true,
    })
    expect(left.totalDocs).toBe(0)
  })

  describe('invitations', () => {
    const pendingInvitationOf = async (email: string) => {
      const [manager] = (
        await payload.find({
          collection: 'managers',
          where: { email: { equals: email } },
          overrideAccess: true,
          showHiddenFields: true,
        })
      ).docs as Manager[]
      return manager?.pendingInvitation ?? null
    }

    /** Every address in a volunteer's CSV was mailed a sign-in link. */
    it('emails no coordinator unless the reviewer opted in', async () => {
      const batch = await createBatch({
        rows: [row(2, { managerEmail: 'hardening-quiet@example.com' })],
        proposedRegions: tree([cityNode('iq', [2])]),
      })

      await commitToEnd(uploader, batch.id)

      expect(await pendingInvitationOf('hardening-quiet@example.com')).toBeNull()
    })

    it('queues the invitation once the reviewer opts in', async () => {
      const batch = await createBatch({
        rows: [row(2, { managerEmail: 'hardening-invited@example.com' })],
        proposedRegions: tree([cityNode('io', [2])]),
      })

      expect((await choose(uploader, batch.id, { inviteCoordinators: true })).status).toBe(200)
      await commitToEnd(uploader, batch.id)

      expect(await pendingInvitationOf('hardening-invited@example.com')).toBeTruthy()
    })
  })

  describe('duplicates the reviewer decided on', () => {
    async function existingClass(title: string): Promise<Event> {
      const city = await testData.createRegion(payload, {
        name: `Berlin ${title}`,
        level: 'city',
        parent: germany.id,
      })
      return testData.createEvent(payload, {
        title,
        region: city.id,
        contactEmail: 'keep@example.org',
      })
    }

    /**
     * ⚠ **Overwrite writes what the row fills and nothing else.** A blank cell
     * keeps the class's own value — the volunteer did not mean to erase it.
     */
    it('overwrites the class a row repeats with the columns the row fills', async () => {
      const existing = await existingClass('Before overwrite')
      const duplicate: Row = {
        ...row(2, { title: 'After overwrite', contactEmail: '' }),
        duplicate: { reason: 'nearby-address', strength: 'strong', eventId: existing.id },
      }
      const batch = await createBatch({ rows: [duplicate], proposedRegions: tree([]) })

      expect(
        (await choose(uploader, batch.id, { duplicates: [{ line: 2, action: 'overwrite' }] }))
          .status,
      ).toBe(200)
      const done = await commitToEnd(uploader, batch.id)

      expect((done.body.finished as { committed: unknown[] }).committed).toEqual([
        { line: 2, eventId: existing.id, action: 'overwrote' },
      ])
      const after = (await payload.findByID({
        collection: 'events',
        id: existing.id,
        depth: 0,
        overrideAccess: true,
      })) as Event
      expect(after.title).toBe('After overwrite')
      expect(after.contactEmail).toBe('keep@example.org')
    })

    it('imports a repeat the reviewer chose to keep, and skips one nobody decided on', async () => {
      const existing = await existingClass('Kept twice')
      const imported: Row = {
        ...row(2, { title: 'Imported anyway' }),
        duplicate: { reason: 'city-and-time', strength: 'weak', eventId: existing.id },
      }
      const skipped: Row = {
        ...row(3, { title: 'Left alone' }),
        duplicate: { reason: 'city-and-time', strength: 'weak', eventId: existing.id },
      }
      const batch = await createBatch({ rows: [imported, skipped], proposedRegions: tree([]) })

      await choose(uploader, batch.id, { duplicates: [{ line: 2, action: 'import' }] })
      await commitToEnd(uploader, batch.id)

      const [created] = await classesTitled('Imported anyway')
      // Filed where the class it repeats is, since the proposal left it out.
      expect(created?.region).toBe(relationId(existing.region))
      expect(await classesTitled('Left alone')).toHaveLength(0)
    })

    it('refuses to overwrite with a repeat of another line of the same file', async () => {
      const batch = await createBatch({
        rows: [row(2), { ...row(3), duplicate: { reason: 'nearby-address', line: 2 } }],
        proposedRegions: tree([]),
      })

      const { status } = await choose(uploader, batch.id, {
        duplicates: [{ line: 3, action: 'overwrite' }],
      })

      expect(status).toBe(422)
    })
  })
})
