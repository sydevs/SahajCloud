import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FIXTURES } from '@/fixture'
import { loadFixture } from '@/fixture/load'
import { fixture, type CollectionFixture } from '@/fixture/types'
import { loadServicePages, PAGE_SERVICE_GLOBALS, type PageService } from '@/lib/pageServices'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The preview fixture's loader (#1168): rows land at their pinned ids, a reload
 * with nothing changed writes nothing, an edit rewrites that row alone, a
 * dropped entry is pruned, and a row below the floor is never touched. Then the
 * committed fixture itself loads with no error and leaves nothing queued.
 */
describe('preview fixture loader', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    ;({ payload, cleanup } = await createTestEnvironment())
  }, 120_000)

  afterAll(async () => {
    await cleanup()
  })

  const narrators = (names: [number, string][]): CollectionFixture[] => [
    fixture(
      'narrators',
      names.map(([id, name]) => ({ id, data: { name, gender: 'female' as const } })),
    ) as CollectionFixture,
  ]

  /** One line per refused row: its message, its cause, and each field Payload named. */
  const describe_ = ({ slug, id, error }: { slug: string; id: number | null; error: unknown }) => {
    const e = error as {
      message?: string
      cause?: { message?: string }
      data?: { errors?: { path: string; message: string }[] }
    }
    const fields = e.data?.errors?.map((f) => `${f.path}: ${f.message}`).join('; ')
    return `${slug}${id == null ? '' : ` ${id}`}: ${e.message ?? String(error)}${e.cause?.message ? ` — ${e.cause.message}` : ''}${fields ? ` [${fields}]` : ''}`
  }

  const read = (id: number) =>
    payload.findByID({ collection: 'narrators', id, depth: 0, disableErrors: true })

  describe('reconciling', () => {
    it('creates each row at its pinned id', async () => {
      const report = await loadFixture(
        payload,
        narrators([
          [1_906_001, 'Fixture Asha'],
          [1_906_002, 'Fixture Bea'],
        ]),
        [],
      )
      expect(report).toMatchObject({ created: 2, updated: 0, deleted: 0, errors: [] })
      expect((await read(1_906_001))?.name).toBe('Fixture Asha')
    })

    it('writes nothing when nothing changed', async () => {
      const report = await loadFixture(
        payload,
        narrators([
          [1_906_001, 'Fixture Asha'],
          [1_906_002, 'Fixture Bea'],
        ]),
        [],
      )
      expect(report).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 2 })
    })

    it('rewrites only the entry that changed', async () => {
      const report = await loadFixture(
        payload,
        narrators([
          [1_906_001, 'Fixture Asha'],
          [1_906_002, 'Fixture Beatrix'],
        ]),
        [],
      )
      expect(report).toMatchObject({ created: 0, updated: 1, unchanged: 1 })
      expect((await read(1_906_002))?.name).toBe('Fixture Beatrix')
    })

    it('prunes a dropped entry, and never a row below the floor', async () => {
      const own = await payload.create({
        collection: 'narrators',
        data: { name: 'A person’s own narrator', gender: 'male' },
      })
      const report = await loadFixture(payload, narrators([[1_906_001, 'Fixture Asha']]), [])
      expect(report).toMatchObject({ deleted: 1, errors: [] })
      expect(await read(1_906_002)).toBeNull()
      expect(await payload.kv.get('fixture:narrators:1906002')).toBeNull()
      expect((await read(own.id))?.name).toBe('A person’s own narrator')
    })
  })

  describe('the committed fixture', () => {
    it('loads with no error, every row at its pinned id', async () => {
      const report = await loadFixture(payload, FIXTURES)
      expect(report.errors.map(describe_)).toEqual([])
      for (const { slug, entries } of FIXTURES) {
        const { docs } = await payload.db.find<{ id: number }>({
          collection: slug,
          where: { id: { in: entries.map((e) => e.id) } },
          limit: 0,
          pagination: false,
          select: { id: true },
        })
        expect(docs.map((d) => Number(d.id)).sort(), slug).toEqual(entries.map((e) => e.id).sort())
      }
    }, 300_000)

    // The point of seeding the globals: without them every preview shows the
    // sidebar table refusing every page, which is what a reviewer opens.
    it('places pages in both services, by name and by tag', async () => {
      for (const service of Object.keys(PAGE_SERVICE_GLOBALS) as PageService[]) {
        const req = { payload, context: {} } as unknown as PayloadRequest
        const placed = await loadServicePages(req, service)
        expect(placed.ids.size, service).toBeGreaterThan(0)
        expect(placed.tags.length, service).toBeGreaterThan(0)
      }
    })

    it('leaves no job queued and no invitation due', async () => {
      const queued = await payload.count({
        collection: 'payload-jobs',
        where: { completedAt: { exists: false } },
        overrideAccess: true,
      })
      expect(queued.totalDocs).toBe(0)
      const invited = await payload.count({
        collection: 'managers',
        where: { invitationDueAt: { exists: true } },
        overrideAccess: true,
      })
      expect(invited.totalDocs).toBe(0)
    })

    it('writes nothing on a second boot', async () => {
      const report = await loadFixture(payload, FIXTURES)
      expect(report.errors.map(describe_)).toEqual([])
      expect(report).toMatchObject({ created: 0, updated: 0, deleted: 0 })
    }, 300_000)
  })
})
