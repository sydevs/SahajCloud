import type { CollectionConfig, Config } from 'payload'

import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'
import { UPLOAD_NOTICE, withUploadNotice } from '@/plugins/storage/uploadNotice'

import { sourceOf, SRC } from '../utils/importGraph'

/**
 * Every upload collection gets the uploading notice, with no per-collection
 * wiring (#888). That `storagePlugin` applies this on all three of its paths
 * is `upload-notice-storage.spec.ts`.
 *
 * It runs over the **real** collection array, not a fixture: a fixture would
 * assume the very thing under test — which collections declare `upload`. The
 * import boots no Payload instance, and 23 other unit specs already pay for
 * that module graph, so the marginal lane cost is nil. A synthetic collection
 * still earns its place for the cases the real array cannot show: a brand-new
 * upload collection, and one already using the slot.
 *
 * The generated `src/app/(payload)/admin/importMap.js` is asserted because
 * nothing else here proves Payload resolves the string path: that entry exists
 * only because `pnpm generate:importmap` found the component on the sanitized
 * config.
 */

const apply = (input: CollectionConfig[]): CollectionConfig[] =>
  withUploadNotice({ collections: input } as Config).collections ?? []

const noticesOf = (collection: CollectionConfig) =>
  collection.admin?.components?.edit?.beforeDocumentControls ?? []

describe('withUploadNotice', () => {
  it('leaves every upload collection in the repo carrying the notice', () => {
    const uploads = apply(collections as CollectionConfig[]).filter((c) => c.upload)

    expect(uploads.length).toBeGreaterThan(0)
    expect(uploads.filter((c) => !noticesOf(c).includes(UPLOAD_NOTICE)).map((c) => c.slug)).toEqual(
      [],
    )
  })

  it('returns the same object for a collection it does not change', () => {
    const before = collections as CollectionConfig[]
    const after = apply(before)

    expect(after.filter((c, i) => c !== before[i]).every((c) => c.upload)).toBe(true)
  })

  it('wires a new upload collection that asked for nothing', () => {
    const [covered] = apply([{ slug: 'new-media', upload: true, fields: [] }])

    expect(noticesOf(covered!)).toEqual([UPLOAD_NOTICE])
  })

  /**
   * The reason for this slot over `edit.Upload`: an additive array has nothing
   * to collide with, so no collection is skipped and none is overridden.
   */
  it('appends beside a component the collection already put in the slot', () => {
    const own = '@/components/admin/SomeBanner'
    const [kept] = apply([
      {
        slug: 'podcasts',
        upload: true,
        fields: [],
        admin: { components: { edit: { beforeDocumentControls: [own] } } },
      },
    ])

    expect(noticesOf(kept!)).toEqual([own, UPLOAD_NOTICE])
  })

  it('keeps a collection’s own Upload component and still adds the notice', () => {
    const audio = '@/components/admin/AudioUpload'
    const [kept] = apply([
      {
        slug: 'podcasts',
        upload: true,
        fields: [],
        admin: { components: { edit: { Upload: audio } } },
      },
    ])

    expect(kept!.admin?.components?.edit?.Upload).toBe(audio)
    expect(noticesOf(kept!)).toEqual([UPLOAD_NOTICE])
  })

  it('has its component in the generated import map', () => {
    expect(sourceOf(`${SRC}/app/(payload)/admin/importMap.js`)).toContain(
      `"${UPLOAD_NOTICE}#default"`,
    )
  })
})
