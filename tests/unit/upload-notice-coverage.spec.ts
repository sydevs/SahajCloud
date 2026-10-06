import type { CollectionConfig, Config } from 'payload'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'
import { UPLOAD_WITH_NOTICE, uploadNoticePlugin } from '@/plugins/uploadNotice'

/**
 * Every upload collection gets the uploading notice, with no per-collection
 * wiring (#888). That criterion is about what someone forgets to do, so the
 * subject is the plugin's coverage, not any one collection's config.
 *
 * It runs over the **real** collection array rather than a synthetic config:
 * `src/collections/index.ts` is a plain module of field definitions, so
 * importing it costs nothing, and a fixture here would assume the very thing
 * under test — which collections declare `upload`. A synthetic collection still
 * earns its place for the two cases the real array cannot show: a brand-new
 * upload collection, and one carrying its own Upload component.
 *
 * `payload.config.ts` is read as text because the alternative is `buildConfig`,
 * which boots Payload and belongs to no unit lane. What that read cannot see —
 * whether Payload resolves the string path — the generated
 * `src/app/(payload)/admin/importMap.js` can, so it is asserted too: the
 * entry exists only because `pnpm generate:importmap` found the plugin's
 * component on the sanitized config.
 */

const SRC = join(process.cwd(), 'src')

const apply = (input: CollectionConfig[]): CollectionConfig[] =>
  uploadNoticePlugin({ collections: input } as Config).collections ?? []

const uploadComponentOf = (collection: CollectionConfig) =>
  collection.admin?.components?.edit?.Upload

describe('uploadNoticePlugin', () => {
  it('leaves every upload collection in the repo with an Upload component', () => {
    const uploads = apply(collections as CollectionConfig[]).filter((c) => c.upload)

    expect(uploads.length).toBeGreaterThan(0)
    expect(uploads.filter((c) => !uploadComponentOf(c)).map((c) => c.slug)).toEqual([])
  })

  it('touches no collection without an upload', () => {
    const before = collections as CollectionConfig[]
    const after = apply(before)

    const changed = after
      .filter((c, i) => uploadComponentOf(c) !== uploadComponentOf(before[i]!))
      .map((c) => c.slug)

    expect(changed.every((slug) => before.find((c) => c.slug === slug)?.upload)).toBe(true)
  })

  it('wires a new upload collection that asked for nothing', () => {
    const [covered] = apply([{ slug: 'new-media', upload: true, fields: [] }])

    expect(uploadComponentOf(covered!)).toBe(UPLOAD_WITH_NOTICE)
  })

  it('leaves a collection that names its own Upload component alone', () => {
    const own = '@/components/admin/AudioUpload'
    const [kept] = apply([
      {
        slug: 'podcasts',
        upload: true,
        fields: [],
        admin: { components: { edit: { Upload: own } } },
      },
    ])

    expect(uploadComponentOf(kept!)).toBe(own)
  })

  it('keeps the other edit components a collection declared', () => {
    const [kept] = apply([
      {
        slug: 'podcasts',
        upload: true,
        fields: [],
        admin: { components: { edit: { PublishButton: '@/components/admin/buttons/Publish' } } },
      },
    ])

    expect(kept!.admin?.components?.edit?.PublishButton).toBe('@/components/admin/buttons/Publish')
    expect(uploadComponentOf(kept!)).toBe(UPLOAD_WITH_NOTICE)
  })
})

describe('uploadNoticePlugin registration', () => {
  /**
   * Searched from `plugins: [` on, so the import above it cannot stand in for
   * the registration — and both assertions refuse a miss outright. An earlier
   * version did neither: it matched the whole file and compared raw `indexOf`
   * results, so deleting the registration left it green twice over, the import
   * satisfying the first and `-1 < n` the second.
   */
  const config = readFileSync(join(SRC, 'payload.config.ts'), 'utf8')
  const pluginsBlock = config.slice(config.indexOf('plugins: ['))
  const registration = pluginsBlock.indexOf('uploadNoticePlugin')

  it('is registered in the plugins array', () => {
    expect(registration).toBeGreaterThanOrEqual(0)
  })

  it('runs before accessPlugin, which processes plugin-created collections last', () => {
    const accessPlugin = pluginsBlock.indexOf('accessPlugin({')

    expect(accessPlugin).toBeGreaterThanOrEqual(0)
    expect(registration).toBeGreaterThanOrEqual(0)
    expect(registration).toBeLessThan(accessPlugin)
  })

  it('has its component in the generated import map', () => {
    const importMap = readFileSync(join(SRC, 'app/(payload)/admin/importMap.js'), 'utf8')

    expect(importMap).toContain(`"${UPLOAD_WITH_NOTICE}#default"`)
  })
})
