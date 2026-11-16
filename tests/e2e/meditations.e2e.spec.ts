import type { SmokeDoc } from './_helpers/fixtures'

import { readFileSync } from 'node:fs'

import { expectOk } from './_helpers/fixtures'
import { runId } from './_helpers/runId'
import { expect, test } from './_helpers/smokeTest'
import { FRAME } from '../../src/fixture/content-ids'
import { ID } from '../../src/fixture/ids'

const audio = readFileSync('tests/files/audio-42s.mp3')

/**
 * A Meditation needs a Narrator, an Image and a Frame: `narrator` and
 * `thumbnail` are required on update, and the `frames` validator demands at
 * least one frame on update (`src/collections/Meditations/Meditations.ts`).
 * The preview fixture holds all three at pinned ids (`src/fixture/`): a female
 * narrator, an image tagged `meditation` — the thumbnail's `filterOptions` —
 * and a frame from the female image set.
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

  const createRes = await request.post('/api/meditations', {
    headers,
    multipart: {
      _payload: JSON.stringify({
        label,
        narrator: ID.narrators.female,
        thumbnail: ID.images.landscape,
        locale: 'en',
        type: 'daily',
        frames: [{ id: FRAME.swadhistan, timestamp: 0 }],
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
