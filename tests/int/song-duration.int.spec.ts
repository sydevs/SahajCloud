/**
 * A song's stored `duration`, read from the uploaded audio (#1195). The music
 * library on wemeditate.com reads it through a client `select`, which is why
 * the client read is here rather than left to the local API.
 */
import type { Payload } from 'payload'

import fs from 'fs'
import path from 'path'

import { handleEndpoints } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Album, Manager, Song } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const API_KEY = 'app-client-key-for-song-duration-spec'
/** The preview fixture's corrupt track: real MPEG header, no duration in it. */
const UNREADABLE = 'fixture-audio-unreadable.mp3'

describe('Song duration extraction', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let config: Awaited<ReturnType<typeof createTestEnvironment>>['config']
  let album: Album
  let admin: Manager

  /** A song created with bytes of the caller's choosing, as a trusted system call. */
  const createSongWith = (data: Buffer, title: string): Promise<Song> =>
    payload.create({
      collection: 'songs',
      data: { title, album: album.id },
      file: { data, mimetype: 'audio/mpeg', name: `${title}.mp3`, size: data.length },
    }) as Promise<Song>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    config = testEnv.config

    album = await testData.createAlbum(payload, { title: 'Duration Test Album' })
    admin = await testData.createManager(payload, { type: 'admin' })
    await testData.createClient(payload, admin.id, {
      label: 'We Meditate App',
      roles: ['wemeditate-app-client'],
      apiKey: API_KEY,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('stores the uploaded audio length in whole seconds', async () => {
    const song = await testData.createSong(payload, { album: album.id })

    // tests/files/audio-42s.mp3 is approximately 42 seconds.
    expect(song.duration).toBe(42)
  })

  it('keeps the duration on a save that uploads no file', async () => {
    const song = await testData.createSong(payload, { album: album.id })

    const updated = await payload.update({
      collection: 'songs',
      id: song.id,
      data: { title: 'Renamed' },
      overrideAccess: true,
    })

    expect(updated.duration).toBe(42)
  })

  it('saves a song whose audio states no duration, with none stored', async () => {
    const song = await createSongWith(
      fs.readFileSync(path.join(process.cwd(), 'src', 'fixture', 'files', UNREADABLE)),
      'Unreadable',
    )

    expect(song.id).toBeDefined()
    expect(song.duration).toBeNull()
  })

  it('returns the duration to an API client that selects it', async () => {
    const song = await testData.createSong(payload, { album: album.id, title: 'Client Readable' })

    const response = await handleEndpoints({
      config,
      request: new Request(
        'http://localhost:3000/api/songs?select[title]=true&select[duration]=true&depth=0&limit=100',
        { headers: { Authorization: `clients API-Key ${API_KEY}` } },
      ),
    })
    const body = (await response.json()) as { docs: Pick<Song, 'id' | 'duration'>[] }

    expect(response.status).toBe(200)
    expect(body.docs.find((doc) => doc.id === song.id)?.duration).toBe(42)
  })
})
