import type { SmokeDoc } from './_helpers/fixtures'

import { readFileSync } from 'node:fs'

import { createAlbum, createImage, expectOk } from './_helpers/fixtures'
import { runId } from './_helpers/runId'
import { expect, test } from './_helpers/smokeTest'

const audio = readFileSync('tests/files/audio-42s.mp3')

/**
 * The Song fixture is an Image plus an Album: `songs.album` is `required: true`
 * and `albums.artwork` is an upload relation to `images`
 * (`src/collections/Songs/Songs.ts`, `src/collections/Albums/Albums.ts`).
 *
 * The spec used to read `/api/albums` and skip when it came back empty — see
 * `_helpers/fixtures.ts` for why that condition held on every PR.
 */
test('create, update, and delete a Song against preview', async ({
  request,
  headers,
  trash,
}, testInfo) => {
  const title = `smoke-${runId()}-song-r${testInfo.retry}`

  const artwork = await createImage(request, headers, `${title}-artwork`)
  trash.track('images', artwork.id)
  const album = await createAlbum(request, headers, {
    title: `${title}-album`,
    artist: `${title}-artist`,
    artwork: artwork.id,
  })
  trash.track('albums', album.id)

  const createRes = await request.post('/api/songs', {
    headers,
    multipart: {
      _payload: JSON.stringify({ title, album: album.id }),
      file: { name: `${title}.mp3`, mimeType: 'audio/mpeg', buffer: audio },
    },
  })
  await expectOk(createRes, 'song create')
  const created = (await createRes.json()) as { doc: SmokeDoc & { title: string } }
  expect(created.doc.title).toBe(title)
  const id = trash.track('songs', created.doc.id)

  const newTitle = `${title}-updated`
  const updateRes = await request.patch(`/api/songs/${id}`, {
    headers,
    data: { title: newTitle },
  })
  await expectOk(updateRes, 'song update')

  const deleteRes = await request.delete(`/api/songs/${id}`, { headers })
  await expectOk(deleteRes, 'song delete')

  const after = await request.get(`/api/songs/${id}`, { headers })
  expect(after.status()).toBe(404)
})
