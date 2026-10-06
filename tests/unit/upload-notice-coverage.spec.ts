import type { CollectionConfig, Config } from 'payload'

import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'
import { UPLOAD_NOTICE, uploadNoticePlugin } from '@/plugins/uploadNotice'

import { sourceOf, SRC } from '../utils/importGraph'

/**
 * Every upload collection gets the uploading notice, with no per-collection
 * wiring (#888).
 *
 * It runs over the **real** collection array, not a fixture: a fixture would
 * assume the very thing under test — which collections declare `upload`. The
 * import boots no Payload instance, and 23 other unit specs already pay for
 * that module graph, so the marginal lane cost is nil. A synthetic collection
 * still earns its place for the cases the real array cannot show: a brand-new
 * upload collection, and one already using the slot.
 *
 * `payload.config.ts` is read as text because the alternative is `buildConfig`,
 * which boots Payload and belongs to no unit lane. What that read cannot see —
 * whether Payload resolves the string path — the generated
 * `src/app/(payload)/admin/importMap.js` can, so it is asserted too: the entry
 * exists only because `pnpm generate:importmap` found the component on the
 * sanitized config.
 */

const apply = (input: CollectionConfig[]): CollectionConfig[] =>
  uploadNoticePlugin({ collections: input } as Config).collections ?? []

const noticesOf = (collection: CollectionConfig) =>
  collection.admin?.components?.edit?.beforeDocumentControls ?? []

describe('uploadNoticePlugin', () => {
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
})

describe('uploadNoticePlugin registration', () => {
  /**
   * Sliced from `plugins: [` so the import above cannot stand in for the
   * registration, and `>= 0` so a `-1` miss cannot pass as an ordering.
   */
  const config = sourceOf(`${SRC}/payload.config.ts`)
  const pluginsBlock = config.slice(config.indexOf('plugins: ['))
  const registration = pluginsBlock.indexOf('uploadNoticePlugin')

  it('runs before accessPlugin, which processes plugin-created collections last', () => {
    const accessPlugin = pluginsBlock.indexOf('accessPlugin({')

    expect(accessPlugin).toBeGreaterThanOrEqual(0)
    expect(registration).toBeGreaterThanOrEqual(0)
    expect(registration).toBeLessThan(accessPlugin)
  })

  it('has its component in the generated import map', () => {
    expect(sourceOf(`${SRC}/app/(payload)/admin/importMap.js`)).toContain(
      `"${UPLOAD_NOTICE}#default"`,
    )
  })
})
