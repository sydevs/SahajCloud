import type { CollectionConfig, Config, GlobalConfig } from 'payload'

import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'
import { globals } from '@/globals'
import { LIVE_PREVIEW_NOTICE, previewNoticePlugin } from '@/plugins/previewNotice'

/**
 * Every entity declaring `admin.livePreview` gets the notice, with no
 * per-surface wiring (#1204).
 *
 * It runs over the **real** collection and global arrays, not a fixture: a
 * fixture would assume the very thing under test — which entities declare a
 * live preview. Synthetic entities still earn their place for what the real
 * arrays cannot show: a brand-new surface, and one already using the slot.
 *
 * ⚠ `user-submissions` declares its preview inside `formsPlugin`, so it is
 * absent from the plain `collections` array here and covered by the ordering
 * in `payload.config.ts` instead.
 */

/** An entity whose consumer mounts no subscriber, declared as such. */
const silent = (admin: Record<string, unknown>) => ({
  ...admin,
  custom: { livePreviewSubscribes: false },
})

const apply = (config: Partial<Config>): Config =>
  previewNoticePlugin({
    collections: [],
    globals: [],
    ...config,
  } as Config) as Config

const onCollection = (collection: CollectionConfig) =>
  collection.admin?.components?.edit?.beforeDocumentControls ?? []

const onGlobal = (global: GlobalConfig) =>
  global.admin?.components?.elements?.beforeDocumentControls ?? []

describe('previewNoticePlugin', () => {
  it('leaves every previewing collection in the repo carrying the notice, bar the silent one', () => {
    const previewing = (
      apply({ collections: collections as CollectionConfig[] }).collections ?? []
    ).filter((c) => c.admin?.livePreview)

    expect(previewing.length).toBeGreaterThan(0)
    expect(
      previewing.filter((c) => !onCollection(c).includes(LIVE_PREVIEW_NOTICE)).map((c) => c.slug),
    ).toEqual(['lectures'])
  })

  it('watches no global in the repo — every previewing one is a scoped session', () => {
    const previewing = (apply({ globals: globals as GlobalConfig[] }).globals ?? []).filter(
      (g) => g.admin?.livePreview,
    )

    expect(previewing.length).toBeGreaterThan(0)
    expect(previewing.filter((g) => onGlobal(g).includes(LIVE_PREVIEW_NOTICE))).toEqual([])
  })

  it('adds nothing to an entity that says its consumer answers no handshake', () => {
    const declared = { livePreview: { url: () => '' } }
    const config = apply({
      collections: [{ slug: 'quiet', fields: [], admin: silent(declared) }],
      globals: [{ slug: 'quiet-global', fields: [], admin: silent(declared) }],
    })

    expect(onCollection(config.collections![0]!)).toEqual([])
    expect(onGlobal(config.globals![0]!)).toEqual([])
  })

  it('returns the same object for an entity it does not change', () => {
    const before = collections as CollectionConfig[]
    const after = apply({ collections: before }).collections ?? []

    expect(after.filter((c, i) => c !== before[i]).every((c) => c.admin?.livePreview)).toBe(true)
  })

  it('wires a new previewing surface that asked for nothing', () => {
    const declared = { livePreview: { url: () => '' } }
    const config = apply({
      collections: [{ slug: 'new-pages', fields: [], admin: declared }],
      globals: [{ slug: 'new-settings', fields: [], admin: declared }],
    })

    expect(onCollection(config.collections![0]!)).toEqual([LIVE_PREVIEW_NOTICE])
    expect(onGlobal(config.globals![0]!)).toEqual([LIVE_PREVIEW_NOTICE])
  })

  it('appends beside a component the entity already put in the slot', () => {
    const own = '@/components/admin/SomeBanner'
    const config = apply({
      collections: [
        {
          slug: 'new-pages',
          fields: [],
          admin: {
            livePreview: { url: () => '' },
            components: { edit: { beforeDocumentControls: [own] } },
          },
        },
      ],
    })

    expect(onCollection(config.collections![0]!)).toEqual([own, LIVE_PREVIEW_NOTICE])
  })

  it('adds nothing to an entity with no live preview', () => {
    const config = apply({
      collections: [{ slug: 'plain', fields: [] }],
      globals: [{ slug: 'plain-global', fields: [] }],
    })

    expect(onCollection(config.collections![0]!)).toEqual([])
    expect(onGlobal(config.globals![0]!)).toEqual([])
  })
})
