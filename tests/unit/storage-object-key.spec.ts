/**
 * The storage collections carry one schema whether or not the Cloudflare
 * credentials are set.
 *
 * `cloudStoragePlugin` (3.90+) stores an `_objectKey` column on every collection
 * it manages, but only when enabled — and `storagePlugin` disables it wherever
 * the credentials are absent: local dev, the integration suite, and
 * `migrate:create`. PR #865 shipped a migration generated that way, and every
 * upload on its Railway preview failed with `column images._objectkey does not
 * exist`. Nothing local could see it, because nothing local ran the plugin
 * enabled. This does, with the credentials stubbed.
 */
import type { Config, Field } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ serverEnv: {} }))

import { serverEnv } from '@/lib/env'
import { storagePlugin } from '@/plugins/storage'

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
]

const config = (): Config =>
  ({
    collections: [...STORAGE_SLUGS, 'pages'].map((slug) => ({
      slug,
      upload: slug === 'pages' ? undefined : true,
      fields: [],
    })),
  }) as unknown as Config

async function objectKeyFields(
  options?: Parameters<typeof storagePlugin>[0],
): Promise<Map<string, Field[]>> {
  const result = await storagePlugin(options)(config())
  return new Map(
    (result.collections ?? []).map((collection) => [
      collection.slug,
      collection.fields.filter((field) => 'name' in field && field.name === '_objectKey'),
    ]),
  )
}

afterEach(() => {
  for (const key of Object.keys(CREDENTIALS)) delete env[key]
})

describe('storagePlugin _objectKey', () => {
  it.each([
    ['no credentials (local dev, migrate:create)', undefined],
    ['disabled (E2E)', { enabled: false }],
  ])('declares it on every storage collection with %s', async (_label, options) => {
    const fields = await objectKeyFields(options)
    for (const slug of STORAGE_SLUGS) expect(fields.get(slug), slug).toHaveLength(1)
    expect(fields.get('pages')).toHaveLength(0)
  })

  it('declares the same field when the credentials are set', async () => {
    const withoutCredentials = await objectKeyFields()
    Object.assign(env, CREDENTIALS)
    const withCredentials = await objectKeyFields()

    for (const slug of STORAGE_SLUGS) {
      expect(withCredentials.get(slug), slug).toHaveLength(1)
      expect(withCredentials.get(slug), slug).toEqual(withoutCredentials.get(slug))
    }
    expect(withCredentials.get('pages')).toHaveLength(0)
  })
})
