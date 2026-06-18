import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { authHeaders, ensureAdmin } from './_helpers/preview'
import { runId } from './_helpers/runId'

type Doc = { id: number | string; filename?: string }

const image = readFileSync('tests/files/image-1050x700.png')

// Exercises the Cloudflare Images upload path in smoke (issue #432 AC) and
// verifies the preview/non-prod namespace end-to-end: an image uploaded against
// a Railway preview should land with the `preview-` marker so the delete guard
// and scheduled cleanup recognize it, and the preview can delete its own upload.
test('upload + delete an Image against preview, namespaced for isolation', async ({
  request,
}, testInfo) => {
  const token = await ensureAdmin(request)
  const headers = authHeaders(token)

  const label = `smoke-${runId()}-image-r${testInfo.retry}`
  const createRes = await request.post('/api/images', {
    headers,
    multipart: {
      _payload: JSON.stringify({ alt: label }),
      file: { name: `${label}.png`, mimeType: 'image/png', buffer: image },
    },
  })
  expect(createRes.ok(), `create failed: ${createRes.status()} ${await createRes.text()}`).toBe(
    true,
  )
  const created = (await createRes.json()) as { doc: Doc }
  const id = created.doc.id
  const filename = created.doc.filename ?? ''

  // Cloudflare Images IDs carry no file extension; the local-storage fallback
  // (no Cloudflare credentials) keeps ".png". Only assert the preview namespace
  // when the upload actually went to Cloudflare Images — the path #432 isolates.
  if (!filename.endsWith('.png')) {
    expect(filename, 'Cloudflare Images upload should be preview-namespaced').toMatch(/^preview-/)
  }

  // The preview may delete its OWN (preview-marked) upload; the guard only
  // blocks deletes of unmarked, cloned-from-prod assets.
  const deleteRes = await request.delete(`/api/images/${id}`, { headers })
  expect(deleteRes.ok()).toBe(true)

  const after = await request.get(`/api/images/${id}`, { headers })
  expect(after.status()).toBe(404)
})
