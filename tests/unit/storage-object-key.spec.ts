/**
 * The storage collections carry one schema whether or not the Cloudflare
 * credentials are set.
 *
 * `cloudStoragePlugin` inserts its own columns — `_objectKey`, and `prefix`
 * under `alwaysInsertFields` — for exactly the slugs its `collections` option
 * names. `storagePlugin` derives that one map from `STORAGE_BACKENDS`, so the
 * eight agree by construction; these cases are what proves it, on each of the
 * three paths. PR #865 shipped a migration generated without that agreement, and
 * every upload on its Railway preview failed with `column images._objectkey
 * does not exist`. Nothing local could see it, because nothing local ran the
 * plugin enabled. These cases do, with the credentials stubbed.
 *
 * They run over the **real** collection array, the way `upload-notice-coverage`
 * does. A fixture would have to restate which URL factory each collection
 * mounts — and the last case is there to prove what upstream does to those
 * fields, so a fixture would be assuming half of what it checks.
 */
import type { CollectionConfig, Config, Field } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ serverEnv: {} }))

import { collections } from '@/collections'
import { serverEnv } from '@/lib/env'
import { STORAGE_BACKENDS, storagePlugin } from '@/plugins/storage'

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

const STORAGE_SLUGS: string[] = Object.keys(STORAGE_BACKENDS)

const build = async (
  options?: Parameters<typeof storagePlugin>[0],
): Promise<Map<string, Field[]>> => {
  const result = await storagePlugin(options)({ collections } as unknown as Config)
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

/** The computed fields a collection declares, as its own factories built them. */
const declaredVirtuals = (slug: string): Array<{ custom: unknown; name: string }> => {
  const collection = (collections as CollectionConfig[]).find((c) => c.slug === slug)
  return (collection?.fields ?? []).filter(
    (field) => 'virtual' in field && field.virtual && 'custom' in field && field.custom,
  ) as unknown as Array<{ custom: unknown; name: string }>
}

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

    const untouched = [...fields.keys()].filter((slug) => !STORAGE_SLUGS.includes(slug))
    expect(untouched.length).toBeGreaterThan(0)
    for (const slug of untouched) {
      expect(named(fields.get(slug), '_objectKey'), slug).toBeUndefined()
      expect(named(fields.get(slug), 'prefix'), slug).toBeUndefined()
    }
  })

  it('declares the same stored schema whether or not the credentials are set', async () => {
    const withoutCredentials = await build()
    Object.assign(env, CREDENTIALS)
    const withCredentials = await build()

    for (const slug of STORAGE_SLUGS) {
      // One producer makes a whole-field comparison safe: both sides are
      // upstream's own literal, so nothing has to be excluded to compare them.
      expect(named(withCredentials.get(slug), '_objectKey'), slug).toEqual(
        named(withoutCredentials.get(slug), '_objectKey'),
      )

      // The names, not the definitions: an enabled plugin hangs adapter hooks
      // on `url` and `prefix` that a disabled one has no adapter to build. A
      // column on one side only is what #865 cost, whichever column it is.
      expect(storedNames(withCredentials.get(slug)), slug).toEqual(
        storedNames(withoutCredentials.get(slug)),
      )
    }
  })

  it.each([
    ['no credentials (local dev, migrate:create)', {}],
    ['the credentials set (production)', CREDENTIALS],
  ])('leaves every computed field selectable on its own with %s', async (_label, credentials) => {
    Object.assign(env, credentials)
    const fields = await build()

    // Upstream splices `url` out and re-pushes its own, so the declaration
    // `virtualFieldsPlugin` reads rides on that spread. Losing it puts back the
    // `url`→`filename` co-select every caller owed before #1084.
    for (const slug of STORAGE_SLUGS) {
      const declared = declaredVirtuals(slug)
      expect(declared.length, slug).toBeGreaterThan(0)

      for (const field of declared) {
        expect(named(fields.get(slug), field.name), `${slug}.${field.name}`).toMatchObject({
          custom: field.custom,
          virtual: true,
        })
      }
    }
  })
})
