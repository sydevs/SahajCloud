import type { SmokeDoc } from './_helpers/fixtures'

import { readFileSync } from 'node:fs'

import {
  MEDITATION_IMAGE_TAG,
  createFrame,
  createImage,
  createNarrator,
  expectOk,
} from './_helpers/fixtures'
import { runId } from './_helpers/runId'
import { expect, test } from './_helpers/smokeTest'

const audio = readFileSync('tests/files/audio-42s.mp3')

/**
 * The Meditation fixture is a Narrator, an Image and a Frame: `narrator` and
 * `thumbnail` are required on update, and the `frames` validator demands at
 * least one frame on update (`src/collections/Meditations/Meditations.ts`).
 *
 * The spec used to read those three collections and skip when any came back
 * empty — see `_helpers/fixtures.ts` for why that condition held on every PR.
 */
test('create, update, and delete a Meditation against preview', async ({
  request,
  headers,
  trash,
}, testInfo) => {
  // Retry-aware identifier so Playwright's automatic retries do not trip on
  // meditations_filename_idx (UNIQUE) — a failed first attempt would
  // otherwise leave a row that blocks every retry.
  const label = `smoke-${runId()}-meditation-r${testInfo.retry}`

  // Independent of one another; only the Meditation needs all three.
  const [narrator, thumbnail, frame] = await Promise.all([
    createNarrator(request, headers, label),
    createImage(request, headers, `${label}-thumbnail`, { tags: [MEDITATION_IMAGE_TAG] }),
    createFrame(request, headers, `${label}-frame`),
  ])
  trash.track('narrators', narrator.id)
  trash.track('images', thumbnail.id)
  trash.track('frames', frame.id)

  const createRes = await request.post('/api/meditations', {
    headers,
    multipart: {
      _payload: JSON.stringify({
        label,
        narrator: narrator.id,
        thumbnail: thumbnail.id,
        locale: 'en',
        type: 'daily',
        frames: [{ id: frame.id, timestamp: 0 }],
      }),
      file: { name: `${label}.mp3`, mimeType: 'audio/mpeg', buffer: audio },
    },
  })
  await expectOk(createRes, 'meditation create')
  const created = (await createRes.json()) as { doc: SmokeDoc & { label: string } }
  expect(created.doc.label).toBe(label)
  const id = trash.track('meditations', created.doc.id)

  const newLabel = `${label}-updated`
  const updateRes = await request.patch(`/api/meditations/${id}`, {
    headers,
    data: { label: newLabel },
  })
  await expectOk(updateRes, 'meditation update')
  const updated = (await updateRes.json()) as { doc: { label: string } }
  expect(updated.doc.label).toBe(newLabel)

  const deleteRes = await request.delete(`/api/meditations/${id}`, { headers })
  await expectOk(deleteRes, 'meditation delete')

  const after = await request.get(`/api/meditations/${id}`, { headers })
  expect(after.status()).toBe(404)
})
