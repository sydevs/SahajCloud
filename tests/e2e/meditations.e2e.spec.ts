import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { authHeaders, ensureAdmin } from './_helpers/preview'
import { runId } from './_helpers/runId'

type Doc = { id: number | string }
type ListResponse<T> = { docs: T[] }

const audio = readFileSync('tests/files/audio-42s.mp3')

test('create, update, and delete a Meditation against preview', async ({ request }, testInfo) => {
  const token = await ensureAdmin(request)
  const headers = authHeaders(token)

  const narratorsRes = await request.get('/api/narrators?limit=1', { headers })
  expect(narratorsRes.ok()).toBe(true)
  const { docs: narrators } = (await narratorsRes.json()) as ListResponse<Doc>

  const imagesRes = await request.get('/api/images?limit=1', { headers })
  expect(imagesRes.ok()).toBe(true)
  const { docs: images } = (await imagesRes.json()) as ListResponse<Doc>

  // Meditations require at least one frame on UPDATE (collection-level
  // validation in src/collections/AGENTS.md). Fetch any frame to include.
  const framesRes = await request.get('/api/frames?limit=1', { headers })
  expect(framesRes.ok()).toBe(true)
  const { docs: frames } = (await framesRes.json()) as ListResponse<Doc>

  // A fresh per-PR preview DB has no seeded content — skip the CRUD flow rather
  // than fail. Runs fully against a preview that has data seeded.
  test.skip(
    !narrators[0]?.id || !images[0]?.id || !frames[0]?.id,
    'preview DB has no seeded narrator/image/frame',
  )

  // Retry-aware identifier so Playwright's automatic retries do not trip on
  // meditations_filename_idx (UNIQUE) — a failed first attempt would
  // otherwise leave a row that blocks every retry.
  const label = `smoke-${runId()}-meditation-r${testInfo.retry}`
  const payload = {
    label,
    narrator: narrators[0].id,
    thumbnail: images[0].id,
    locale: 'en',
    type: 'daily',
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

  const newLabel = `${label}-updated`
  const updateRes = await request.patch(`/api/meditations/${id}`, {
    headers: { ...headers, 'content-type': 'application/json' },
    data: { label: newLabel },
  })
  expect(updateRes.ok()).toBe(true)
  const updated = (await updateRes.json()) as { doc: { label: string } }
  expect(updated.doc.label).toBe(newLabel)

  const deleteRes = await request.delete(`/api/meditations/${id}`, { headers })
  expect(deleteRes.ok()).toBe(true)

  const after = await request.get(`/api/meditations/${id}`, { headers })
  expect(after.status()).toBe(404)
})
