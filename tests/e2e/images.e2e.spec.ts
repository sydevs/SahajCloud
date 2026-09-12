import { createImage, expectOk } from './_helpers/fixtures'
import { runId } from './_helpers/runId'
import { expect, test } from './_helpers/smokeTest'

// Exercises the Cloudflare Images upload path in smoke (issue #432 AC) and
// verifies the preview/non-prod namespace end-to-end: an image uploaded against
// a Railway preview should land with the `preview-` marker so the delete guard
// and scheduled cleanup recognize it, and the preview can delete its own upload.
test('upload + delete an Image against preview, namespaced for isolation', async ({
  request,
  headers,
  trash,
}, testInfo) => {
  const label = `smoke-${runId()}-image-r${testInfo.retry}`
  // PNG rather than the fixtures' default webp: this spec owns the extension
  // assertion below, and the local-storage fallback keeps whatever we sent.
  const created = await createImage(request, headers, label, { format: 'png' })
  const id = trash.track('images', created.id)
  const filename = created.filename ?? ''

  // Cloudflare Images IDs carry no file extension. The local-storage fallback
  // (no Cloudflare credentials) keeps ".png". Only assert the preview namespace
  // when the upload actually went to Cloudflare Images — the path #432 isolates.
  if (!filename.endsWith('.png')) {
    expect(filename, 'Cloudflare Images upload should be preview-namespaced').toMatch(/^preview-/)
  }

  // The preview may delete its OWN (preview-marked) upload. The guard only
  // blocks deletes of unmarked assets — production's. See `docs/rules/storage.md`
  // for how a preview can reach one at all.
  const deleteRes = await request.delete(`/api/images/${id}`, { headers })
  await expectOk(deleteRes, 'image delete')

  const after = await request.get(`/api/images/${id}`, { headers })
  expect(after.status()).toBe(404)
})
