import type { SmokeDoc } from './_helpers/fixtures'

import { readFileSync } from 'node:fs'

import { expectOk } from './_helpers/fixtures'
import { runId } from './_helpers/runId'
import { expect, test } from './_helpers/smokeTest'
import { ALBUM } from '../../src/fixture/content-ids'

const audio = readFileSync('tests/files/audio-42s.mp3')

/**
 * A Song needs an Album (`songs.album` is `required: true`,
 * `src/collections/Songs/Songs.ts`), which the preview fixture holds at a
 * pinned id (`src/fixture/`).
 */
test('create, update, and delete a Song against preview', async ({
  request,
  headers,
  trash,
}, testInfo) => {
  const title = `smoke-${runId()}-song-r${testInfo.retry}`

  const createRes = await request.post('/api/songs', {
    headers,
    multipart: {
      _payload: JSON.stringify({ title, album: ALBUM.stillness }),
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
