import { expect, test } from '@playwright/test'

import { authHeaders, loginAsAdmin } from './_helpers/preview'
import { runId } from './_helpers/runId'

type LectureDoc = { id: number | string; type: 'full' | 'clip' }
type ListResponse<T> = { docs: T[] }

test('create, update, and delete a Lecture clip against preview', async ({ request }) => {
  const token = await loginAsAdmin(request)
  const headers = authHeaders(token)
  const jsonHeaders = { ...headers, 'content-type': 'application/json' }

  // Find a cloned full lecture to attach a clip to. We don't create full
  // lectures here because the populateFromNirmalaVidya hook would call the
  // real NV API — that's an integration-test responsibility, not smoke.
  const lecturesRes = await request.get('/api/lectures?where[type][equals]=full&limit=1', {
    headers,
  })
  expect(lecturesRes.ok()).toBe(true)
  const { docs: lectures } = (await lecturesRes.json()) as ListResponse<LectureDoc>
  expect(lectures[0]?.id, 'preview DB should contain at least one cloned full lecture').toBeTruthy()

  const clipTitle = `smoke-${runId()}-lecture-clip`
  const createRes = await request.post('/api/lectures', {
    headers: jsonHeaders,
    data: {
      type: 'clip',
      fullLecture: lectures[0].id,
      title: clipTitle,
      startTime: 0,
      stopTime: 30,
    },
  })
  expect(createRes.ok(), `create failed: ${createRes.status()} ${await createRes.text()}`).toBe(
    true,
  )
  const created = (await createRes.json()) as { doc: LectureDoc }
  expect(created.doc.type).toBe('clip')
  const id = created.doc.id

  const updateRes = await request.patch(`/api/lectures/${id}`, {
    headers: jsonHeaders,
    data: { startTime: 5 },
  })
  expect(updateRes.ok()).toBe(true)

  const deleteRes = await request.delete(`/api/lectures/${id}`, { headers })
  expect(deleteRes.ok()).toBe(true)

  const after = await request.get(`/api/lectures/${id}`, { headers })
  expect(after.status()).toBe(404)
})
