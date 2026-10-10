/**
 * The uploading notice mounts whatever `storagePlugin` does with the
 * credentials (#888).
 *
 * It lives in that plugin because the notice is about an upload, and the
 * reviewer asked for one plugin rather than two. But the plugin returns early
 * when disabled and again when any Cloudflare credential is missing — local
 * dev, the test suite, `migrate:create` — and a save still posts a file on all
 * three paths. So the notice is applied above every return, and this is what
 * says so: fold it in below one and a whole class of environment loses the
 * feedback with nothing failing.
 */
import type { Config } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ serverEnv: {} }))

import { serverEnv } from '@/lib/env'
import { storagePlugin } from '@/plugins/storage'
import { UPLOAD_NOTICE } from '@/plugins/storage/uploadNotice'

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

/**
 * `podcasts` is deliberately not a `STORAGE_BACKENDS` slug: the notice keys off
 * `upload`, so a collection no backend claims yet is still covered.
 */
const config = (): Config =>
  ({
    collections: [
      { slug: 'images', upload: true, fields: [] },
      { slug: 'podcasts', upload: true, fields: [] },
      { slug: 'pages', fields: [] },
    ],
  }) as unknown as Config

async function noticesBySlug(
  options?: Parameters<typeof storagePlugin>[0],
): Promise<Map<string, unknown[]>> {
  const result = await storagePlugin(options)(config())
  return new Map(
    (result.collections ?? []).map((collection) => [
      collection.slug,
      collection.admin?.components?.edit?.beforeDocumentControls ?? [],
    ]),
  )
}

afterEach(() => {
  for (const key of Object.keys(CREDENTIALS)) delete env[key]
})

describe('storagePlugin uploading notice', () => {
  it.each([
    ['no credentials (local dev, migrate:create)', undefined],
    ['disabled (E2E)', { enabled: false }],
  ])('mounts it on every upload collection with %s', async (_label, options) => {
    const notices = await noticesBySlug(options)

    expect(notices.get('images')).toEqual([UPLOAD_NOTICE])
    expect(notices.get('podcasts')).toEqual([UPLOAD_NOTICE])
    expect(notices.get('pages')).toEqual([])
  })

  it('mounts the same notice when the credentials are set', async () => {
    Object.assign(env, CREDENTIALS)
    const notices = await noticesBySlug()

    expect(notices.get('images')).toEqual([UPLOAD_NOTICE])
    expect(notices.get('podcasts')).toEqual([UPLOAD_NOTICE])
    expect(notices.get('pages')).toEqual([])
  })
})
