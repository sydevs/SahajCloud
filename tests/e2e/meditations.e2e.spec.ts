import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { authHeaders, loginAsAdmin } from './_helpers/preview'
import { runId } from './_helpers/runId'

type Doc = { id: number | string }
type ListResponse<T> = { docs: T[] }

const audio = readFileSync('tests/files/audio-42s.mp3')

test('create, update, and delete a Meditation against preview', async ({ request }, testInfo) => {
  const token = await loginAsAdmin(request)
  const headers = authHeaders(token)

  const narratorsRes = await request.get('/api/narrators?limit=1', { headers })
  expect(narratorsRes.ok()).toBe(true)
  const { docs: narrators } = (await narratorsRes.json()) as ListResponse<Doc>
  expect(narrators[0]?.id, 'preview DB should contain at least one cloned narrator').toBeTruthy()

  const imagesRes = await request.get('/api/images?limit=1', { headers })
  expect(imagesRes.ok()).toBe(true)
  const { docs: images } = (await imagesRes.json()) as ListResponse<Doc>
  expect(images[0]?.id, 'preview DB should contain at least one cloned image').toBeTruthy()

  // Meditations require at least one frame on UPDATE (collection-level
  // validation in .claude/rules/collections.md); fetch any frame to include.
  const framesRes = await request.get('/api/frames?limit=1', { headers })
  expect(framesRes.ok()).toBe(true)
  const { docs: frames } = (await framesRes.json()) as ListResponse<Doc>
  expect(frames[0]?.id, 'preview DB should contain at least one cloned frame').toBeTruthy()

  // Retry-aware identifier so Playwright's automatic retries don't trip on
  // meditations_slug_idx / meditations_filename_idx (both UNIQUE) — a
  // failed first attempt would otherwise leave a row that blocks every retry.
  const label = `smoke-${runId()}-meditation-r${testInfo.retry}`
  const payload = {
    label,
    title: label,
    narrator: narrators[0].id,
    thumbnail: images[0].id,
    locale: 'en',
    type: 'quick',
    frames: [{ id: frames[0].id, timestamp: 0 }],
  }

  // Payload REST upload convention: `_payload` carries the JSON doc, `file` carries the binary.
  // https://payloadcms.com/docs/rest-api/overview#uploads
  const createRes = await request.post('/api/meditations', {
    headers,
    multipart: {
      _payload: JSON.stringify(payload),
      file: { name: `${label}.mp3`, mimeType: 'audio/mpeg', buffer: audio },
    },
  })
  expect(createRes.ok(), `create failed: ${createRes.status()} ${await createRes.text()}`).toBe(
    true,
  )
  const created = (await createRes.json()) as { doc: Doc & { label: string } }
  expect(created.doc.label).toBe(label)
  const id = created.doc.id

  const newTitle = `${label}-updated`
  const updateRes = await request.patch(`/api/meditations/${id}`, {
    headers: { ...headers, 'content-type': 'application/json' },
    data: { title: newTitle },
  })
  expect(updateRes.ok()).toBe(true)
  const updated = (await updateRes.json()) as { doc: { title: string } }
  expect(updated.doc.title).toBe(newTitle)

  const deleteRes = await request.delete(`/api/meditations/${id}`, { headers })
  expect(deleteRes.ok()).toBe(true)

  const after = await request.get(`/api/meditations/${id}`, { headers })
  expect(after.status()).toBe(404)
})
