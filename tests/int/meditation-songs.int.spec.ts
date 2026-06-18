import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { meditationSongs } from '@/collections/Meditations/endpoints/songs'
import type { Client, Meditation, Song, SongTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const DEFAULT_CLIENT_USER = { id: 0, collection: 'clients', _status: 'published' }

type SongDoc = { id: number; title?: string | null; url?: string | null; tags?: number[] }
type SongsBody = {
  docs: SongDoc[]
  totalDocs: number
  limit: number
  totalPages: number
  page: number
  pagingCounter: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage: number | null
  nextPage: number | null
}

/**
 * Direct-handler call (mirrors meditation-lectures.int.spec.ts). `select` is
 * passed as the already-parsed nested object Payload's REST layer produces from
 * `?select[title]=true`.
 */
async function callEndpoint(
  payload: Payload,
  meditationId: number | string,
  query: { select?: Record<string, boolean> } = {},
  options: {
    user?: { id: number | string; collection: string; _status?: 'published' | 'draft' } | null
  } = {},
): Promise<{ status: number; headers: Headers; body: SongsBody | unknown }> {
  const req = {
    url: `http://localhost:3000/api/meditations/${meditationId}/songs`,
    payload,
    query,
    headers: new Headers(),
    routeParams: { id: meditationId },
    locale: 'en',
    fallbackLocale: 'en',
    user: 'user' in options ? options.user : DEFAULT_CLIENT_USER,
  } as unknown as PayloadRequest

  const response = (await meditationSongs.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, headers: response.headers, body }
}

describe('meditationSongs endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let songTag: SongTag // the meditation's songTag
  let otherTag: SongTag // a different tag — its songs must be excluded
  let emptyTag: SongTag // tagged on no songs — drives the real zero-match envelope

  let meditation: Meditation // songTag = songTag
  let meditationNoTag: Meditation // no songTag
  let meditationEmptyTag: Meditation // songTag = emptyTag (zero qualifying songs)

  let included: Song[] // tagged songTag + includeForMeditations: true
  let excludedFlag: Song // tagged songTag + includeForMeditations: false
  let excludedTag: Song // tagged otherTag + includeForMeditations: true

  // IDs of the songs that must come back for `meditation`.
  let qualifyingIds: number[]

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id

    // One shared album keeps createSong from minting an album + artwork image
    // per track (8 uploads' worth of setup the suite doesn't need).
    const album = await testData.createAlbum(payload, { title: 'Songs test album' })

    songTag = await testData.createSongTag(payload, { title: 'Calm' })
    otherTag = await testData.createSongTag(payload, { title: 'Energetic' })
    emptyTag = await testData.createSongTag(payload, { title: 'Unused' })

    meditation = await testData.createMeditation(payload, undefined, {
      title: 'Songs test meditation',
      songTag: songTag.id,
    })
    meditationNoTag = await testData.createMeditation(payload, undefined, {
      title: 'No songTag meditation',
    })
    meditationEmptyTag = await testData.createMeditation(payload, undefined, {
      title: 'Empty songTag meditation',
      songTag: emptyTag.id,
    })

    // Six qualifying songs — enough entropy for the randomization assertion.
    included = []
    for (let i = 0; i < 6; i++) {
      included.push(
        await testData.createSong(payload, {
          album,
          title: `Calm Song ${i}`,
          tags: [songTag.id],
          includeForMeditations: true,
        }),
      )
    }
    qualifyingIds = included.map((s) => s.id).sort((a, b) => a - b)

    excludedFlag = await testData.createSong(payload, {
      album,
      title: 'Calm but excluded',
      tags: [songTag.id],
      includeForMeditations: false,
    })
    excludedTag = await testData.createSong(payload, {
      album,
      title: 'Energetic included',
      tags: [otherTag.id],
      includeForMeditations: true,
    })
    // No explicit hook timeout — inherit the config's hookTimeout so it picks up
    // the larger coverage-mode value (the explicit 120s here matched the normal
    // default but blocked the bump, timing out under `pnpm test:coverage`).
  })

  afterAll(async () => {
    await cleanup()
  })

  it('returns only songs tagged with the meditation songTag and flagged includeForMeditations', async () => {
    const { status, body } = await callEndpoint(payload, meditation.id)
    expect(status).toBe(200)
    const ids = (body as SongsBody).docs.map((d) => d.id).sort((a, b) => a - b)
    expect(ids).toEqual(qualifyingIds)
    // Negative cases: wrong flag and wrong tag never appear.
    expect(ids).not.toContain(excludedFlag.id)
    expect(ids).not.toContain(excludedTag.id)
  })

  it('trims each song to { id, title, url, tags } and nothing else', async () => {
    const { body } = await callEndpoint(payload, meditation.id)
    const docs = (body as SongsBody).docs
    expect(docs.length).toBe(qualifyingIds.length)
    for (const doc of docs) {
      expect(Object.keys(doc).sort()).toEqual(['id', 'tags', 'title', 'url'])
      expect(typeof doc.title).toBe('string')
      expect(typeof doc.url).toBe('string')
      // tags returned as an array of song-tag IDs (depth: 0).
      expect(Array.isArray(doc.tags)).toBe(true)
      expect(doc.tags).toContain(songTag.id)
    }
  })

  it('returns the full Payload paginated envelope', async () => {
    const { body } = await callEndpoint(payload, meditation.id)
    const b = body as SongsBody
    for (const key of [
      'docs',
      'totalDocs',
      'limit',
      'totalPages',
      'page',
      'pagingCounter',
      'hasPrevPage',
      'hasNextPage',
      'prevPage',
      'nextPage',
    ]) {
      expect(b).toHaveProperty(key)
    }
    expect(b.totalDocs).toBe(qualifyingIds.length)
    expect(b.limit).toBe(100)
  })

  it('honours select[title]=true — narrows to { id, title }', async () => {
    const { body } = await callEndpoint(payload, meditation.id, { select: { title: true } })
    const docs = (body as SongsBody).docs
    expect(docs.length).toBe(qualifyingIds.length)
    for (const doc of docs) {
      expect(Object.keys(doc).sort()).toEqual(['id', 'title'])
    }
  })

  it('honours select[url]=true without leaking filename', async () => {
    const { body } = await callEndpoint(payload, meditation.id, { select: { url: true } })
    const docs = (body as SongsBody).docs
    for (const doc of docs) {
      // url resolves even though it is virtual and depends on filename, and
      // filename is stripped from the output.
      expect(Object.keys(doc).sort()).toEqual(['id', 'url'])
      expect(typeof doc.url).toBe('string')
      expect(doc).not.toHaveProperty('filename')
    }
  })

  it('id is always present and out-of-allowlist select keys are ignored (returns all four)', async () => {
    const { body } = await callEndpoint(payload, meditation.id, {
      select: { album: true } as Record<string, boolean>,
    })
    const docs = (body as SongsBody).docs
    for (const doc of docs) {
      expect(Object.keys(doc).sort()).toEqual(['id', 'tags', 'title', 'url'])
    }
  })

  it('returns the same set on every call but varies ordering (randomized)', async () => {
    const orderings = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const { body } = await callEndpoint(payload, meditation.id)
      const ids = (body as SongsBody).docs.map((d) => d.id)
      // The set is deterministic: sorted IDs always match the qualifying set.
      expect([...ids].sort((a, b) => a - b)).toEqual(qualifyingIds)
      orderings.add(ids.join(','))
    }
    // Over 20 shuffles of 6 items, ordering must vary (false-failure ≈ 0).
    expect(orderings.size).toBeGreaterThan(1)
  })

  it('returns an empty paginated response when the meditation has no songTag', async () => {
    const noTag = await callEndpoint(payload, meditationNoTag.id)
    expect(noTag.status).toBe(200)
    expect((noTag.body as SongsBody).docs).toEqual([])

    // The hand-built empty envelope must match a real zero-match Payload
    // response (a meditation whose songTag matches no qualifying songs).
    const emptyMatch = await callEndpoint(payload, meditationEmptyTag.id)
    expect(emptyMatch.status).toBe(200)
    expect((emptyMatch.body as SongsBody).docs).toEqual([])
    expect(noTag.body).toEqual(emptyMatch.body)
  })

  it('threads the client req through the songs read (skips query validation)', async () => {
    const client = (await testData.createClient(payload, adminUserId, {
      name: 'Meditation Songs Forwarding Test',
    })) as Client

    const findSpy = vi.spyOn(payload, 'find')
    try {
      const { status } = await callEndpoint(
        payload,
        meditation.id,
        {},
        { user: { id: client.id, collection: 'clients', _status: 'published' } },
      )
      expect(status).toBe(200)

      const songsCall = findSpy.mock.calls.find(
        ([args]) => (args as { collection?: string }).collection === 'songs',
      )
      expect(songsCall).toBeDefined()
      const forwardedReq = (
        songsCall![0] as {
          req?: { user?: { id: unknown; collection: string }; context?: Record<string, unknown> }
        }
      ).req
      expect(forwardedReq?.user?.id).toBe(client.id)
      expect(forwardedReq?.context?.['skipClientQueryValidation']).toBe(true)
    } finally {
      findSpy.mockRestore()
    }
  })

  describe('auth gate', () => {
    it('rejects unauthenticated callers with 403', async () => {
      const { status, body } = await callEndpoint(payload, meditation.id, {}, { user: null })
      expect(status).toBe(403)
      expect(body).toEqual({
        errors: [{ message: 'You are not allowed to perform this action.' }],
      })
    })

    it('rejects non-client users (managers) with 403', async () => {
      const { status } = await callEndpoint(
        payload,
        meditation.id,
        {},
        { user: { id: adminUserId, collection: 'managers' } },
      )
      expect(status).toBe(403)
    })

    it('rejects inactive clients with 403', async () => {
      const { status } = await callEndpoint(
        payload,
        meditation.id,
        {},
        { user: { id: 999, collection: 'clients', _status: 'draft' } },
      )
      expect(status).toBe(403)
    })
  })

  it('returns 400 when the meditation id is missing', async () => {
    const { status } = await callEndpoint(payload, '')
    expect(status).toBe(400)
  })

  it('returns 404 for an unknown meditation', async () => {
    const { status, body } = await callEndpoint(payload, 999999)
    expect(status).toBe(404)
    expect((body as { errors: Array<{ message: string }> }).errors[0].message).toContain(
      'Meditation not found',
    )
  })
})
