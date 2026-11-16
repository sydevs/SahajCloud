/**
 * The storage collections carry one schema whether or not the Cloudflare
 * credentials are set.
 *
 * `cloudStoragePlugin` inserts its own columns — `_objectKey`, and `prefix`
 * under `alwaysInsertFields` — for exactly the slugs its `collections` option
 * names, so the enabled branch and the two credential-less ones have to name
 * the same eight. PR #865 shipped a migration generated without that
 * agreement, and every upload on its Railway preview failed with `column
 * images._objectkey does not exist`. Nothing local could see it, because
 * nothing local ran the plugin enabled. These cases do, with the credentials
 * stubbed.
 *
 * Fixture pre-mortem: the cases assume the eight are `upload` collections that
 * declare no `imageSizes`, since upstream builds a `sizes` group of stored
 * `url` columns when one is present — schema these cases would not compare.
 * Verified against the real configs: `Images.ts:26` and `Frames.ts:45` each
 * record that `imageSizes` was removed, and no file under `src/` declares one.
 */
import type { CollectionSlug, Config, Field } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ serverEnv: {} }))

import { serverEnv } from '@/lib/env'
import { storagePlugin } from '@/plugins/storage'
import {
  hlsUrlField,
  mp4UrlField,
  previewUrlField,
  virtualUrlField,
} from '@/plugins/storage/urlFields'

const env = serverEnv as unknown as Record<string, string | undefined>

const CREDENTIALS = {
  CLOUDFLARE_ACCOUNT_ID: 'test-account',
  CLOUDFLARE_API_KEY: 'test-key',
  CLOUDFLARE_IMAGES_DELIVERY_URL: 'https://imagedelivery.net/test-hash',
  CLOUDFLARE_STREAM_DELIVERY_URL: 'https://customer-test.cloudflarestream.com',
  R2_BUCKET: 'test-bucket',
  R2_ACCESS_KEY_ID: 'test-id',
  R2_SECRET_ACCESS_KEY: 'test-secret',
}

const STORAGE_SLUGS = [
  'images',
  'frames',
  'videos',
  'user-choices',
  'song-tags',
  'meditations',
  'songs',
  'files',
] as const satisfies readonly CollectionSlug[]

/** The computed fields the upload collections mount, by the factories they use. */
const VIRTUAL_FIELDS = ['url', 'previewUrl', 'hlsUrl', 'mp4Url']

const uploadFields = (collection: CollectionSlug): Field[] => [
  { name: 'filename', type: 'text' },
  { name: 'mimeType', type: 'text' },
  virtualUrlField({ collection, adapter: 'r2' }),
  previewUrlField({ collection }),
  hlsUrlField({ collection }),
  mp4UrlField({ collection }),
]

const config = (): Config =>
  ({
    collections: [
      ...STORAGE_SLUGS.map((slug) => ({ slug, upload: true, fields: uploadFields(slug) })),
      { slug: 'pages', fields: [] },
    ],
  }) as unknown as Config

const build = async (
  options?: Parameters<typeof storagePlugin>[0],
): Promise<Map<string, Field[]>> => {
  const result = await storagePlugin(options)(config())
  return new Map(
    (result.collections ?? []).map((collection) => [collection.slug, collection.fields]),
  )
}

const named = (fields: Field[] | undefined, name: string): Field | undefined =>
  fields?.find((field) => 'name' in field && field.name === name)

/** The columns a collection's fields produce — a virtual field creates none. */
const storedNames = (fields: Field[] = []): string[] =>
  fields
    .filter((field) => 'name' in field && !('virtual' in field && field.virtual))
    .map((field) => (field as { name: string }).name)
    .sort()

afterEach(() => {
  for (const key of Object.keys(CREDENTIALS)) delete env[key]
})

describe('storagePlugin schema', () => {
  it.each([
    ['no credentials (local dev, migrate:create)', undefined],
    ['disabled (E2E)', { enabled: false }],
  ])("inserts upstream's columns on every storage collection with %s", async (_label, options) => {
    const fields = await build(options)

    for (const slug of STORAGE_SLUGS) {
      expect(named(fields.get(slug), '_objectKey'), slug).toBeDefined()
      expect(named(fields.get(slug), 'prefix'), slug).toBeDefined()
    }
    expect(named(fields.get('pages'), '_objectKey')).toBeUndefined()
    expect(named(fields.get('pages'), 'prefix')).toBeUndefined()
  })

  it('declares the same `_objectKey` field whether or not the credentials are set', async () => {
    const withoutCredentials = await build()
    Object.assign(env, CREDENTIALS)
    const withCredentials = await build()

    // One producer makes a whole-field comparison safe: both sides are now
    // upstream's own literal, so nothing has to be excluded to compare them.
    for (const slug of STORAGE_SLUGS) {
      expect(named(withCredentials.get(slug), '_objectKey'), slug).toEqual(
        named(withoutCredentials.get(slug), '_objectKey'),
      )
    }
  })

  it('stores the same columns whether or not the credentials are set', async () => {
    const withoutCredentials = await build()
    Object.assign(env, CREDENTIALS)
    const withCredentials = await build()

    // The names, not the definitions: an enabled plugin hangs adapter hooks on
    // `url` and `prefix` that a disabled one has no adapter to build. A column
    // on one side only is what #865 cost, whichever column it is.
    for (const slug of STORAGE_SLUGS) {
      expect(storedNames(withCredentials.get(slug)), slug).toEqual(
        storedNames(withoutCredentials.get(slug)),
      )
    }
  })

  it.each([
    ['no credentials (local dev, migrate:create)', false],
    ['the credentials set (production)', true],
  ])('leaves every computed field selectable on its own with %s', async (_label, credentialed) => {
    if (credentialed) Object.assign(env, CREDENTIALS)
    const fields = await build()

    // Upstream splices `url` out and re-pushes its own, so the declaration
    // `virtualFieldsPlugin` reads rides on that spread. Losing it puts back the
    // `url`→`filename` co-select every caller owed before #1084.
    for (const slug of STORAGE_SLUGS) {
      for (const name of VIRTUAL_FIELDS) {
        const field = named(fields.get(slug), name)
        const declared = named(uploadFields(slug), name)

        expect(field, `${slug}.${name}`).toMatchObject({
          virtual: true,
          custom: (declared as { custom: unknown }).custom,
        })
      }
    }
  })
})
