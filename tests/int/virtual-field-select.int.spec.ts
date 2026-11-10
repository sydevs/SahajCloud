/**
 * A computed field is selectable on its own because its own declaration
 * installs the repair (#1084), wherever that field is mounted.
 *
 * `images` is the case no collection could have fixed for itself: `url` is
 * declared by a shared factory, so the `url`→`filename` co-select was owed by
 * every caller on all eight upload collections (`docs/rules/endpoints.md`).
 * Nothing but the factory knows `filename` is what the hook reads.
 *
 * The per-collection declarations are pinned where each collection's own reads
 * are — `events`, `pages`, `meditations` and `meditation-transcripts` each have
 * a case of their own. What `virtualFieldsPlugin` collects and mounts is
 * `tests/unit/virtual-field-declarations.spec.ts`.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Image } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('a declared computed field survives a select', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it('resolves an upload `url` for a select that never names `filename`', async () => {
    const image = await testData.createMediaImage(payload, { alt: 'A selected image' })

    const [selected, whole] = await Promise.all([
      payload.findByID({ collection: 'images', id: image.id, select: { url: true } }),
      payload.findByID({ collection: 'images', id: image.id }),
    ])

    // Pinned against the unselected read and against a non-null literal: the
    // comparison alone would hold if both came back null, which is the defect.
    expect(selected.url).toBe(whole.url)
    expect(selected.url).toContain(image.filename)
    // The input is in the response, because nothing can select a field for a
    // hook alone — a scalar here, unlike a transcript's cues. Absent from the
    // declared select, so the narrowed type needs widening to name it.
    expect((selected as typeof selected & Pick<Image, 'filename'>).filename).toBe(image.filename)
  })

  it('resolves `previewUrl` on a collection that mounts it', async () => {
    // A second factory, and a second reason the declaration cannot live on the
    // collection: `previewUrl` reads `mimeType` as well, and `frames` mounts
    // four of these fields without restating what any of them reads.
    const frame = await testData.createFrame(payload)

    const selected = await payload.findByID({
      collection: 'frames',
      id: frame.id,
      select: { previewUrl: true },
    })

    expect(selected.previewUrl).toContain(frame.filename)
  })
})
