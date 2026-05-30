import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { authHeaders, loginAsAdmin } from './_helpers/preview'
import { runId } from './_helpers/runId'

type Doc = { id: number | string }
type ListResponse<T> = { docs: T[] }

const audio = readFileSync('tests/files/audio-42s.mp3')

test('create, update, and delete a Song against preview', async ({ request }) => {
  const token = await loginAsAdmin(request)
  const headers = authHeaders(token)

  const albumsRes = await request.get('/api/albums?limit=1', { headers })
  expect(albumsRes.ok()).toBe(true)
  const { docs: albums } = (await albumsRes.json()) as ListResponse<Doc>
  expect(albums[0]?.id, 'preview DB should contain at least one cloned album').toBeTruthy()

  const title = `smoke-${runId()}-song`
  const payload = { title, album: albums[0].id }

  // Payload REST upload convention: `_payload` carries the JSON doc, `file` carries the binary.
  // https://payloadcms.com/docs/rest-api/overview#uploads
  const createRes = await request.post('/api/songs', {
    headers,
    multipart: {
      _payload: JSON.stringify(payload),
      file: { name: `${title}.mp3`, mimeType: 'audio/mpeg', buffer: audio },
    },
  })
  expect(createRes.ok(), `create failed: ${createRes.status()} ${await createRes.text()}`).toBe(
    true,
  )
  const created = (await createRes.json()) as { doc: Doc & { title: string } }
  expect(created.doc.title).toBe(title)
  const id = created.doc.id

  const newTitle = `${title}-updated`
  const updateRes = await request.patch(`/api/songs/${id}`, {
    headers: { ...headers, 'content-type': 'application/json' },
    data: { title: newTitle },
  })
  expect(updateRes.ok()).toBe(true)

  const deleteRes = await request.delete(`/api/songs/${id}`, { headers })
  expect(deleteRes.ok()).toBe(true)

  const after = await request.get(`/api/songs/${id}`, { headers })
  expect(after.status()).toBe(404)
})
