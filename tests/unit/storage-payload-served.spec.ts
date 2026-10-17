/**
 * Which collections' files are served through Payload's own gated route, and
 * which are published straight from the backend's delivery URL (#907).
 *
 * ⚠ **This is an access-control assertion wearing a configuration flag's
 * clothes.** `disablePayloadAccessControl: true` points `url` at
 * `assets.sydevelopers.com`, cached a year, so the only thing in front of the
 * object is the random suffix in its filename. That is right for an image and
 * wrong for an `event-imports` CSV, which holds contact names, phone numbers
 * and email addresses — naming the collection in `RESTRICTED_COLLECTIONS` stops
 * a published API key reading the row, and this stops the same key reading the
 * file.
 *
 * ⚠ **Nothing else can catch a flip.** The flag changes no type, fails no
 * build, and the admin panel renders a working link either way: the URL simply
 * stops being the one Payload gates. So the two sets are asserted as sets, and
 * a new storage-backed collection has to be classified here deliberately.
 */
import type { Config } from 'payload'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ serverEnv: {} }))

import { storagePlugin } from '@/plugins/storage'

/** Every slug `STORAGE_BACKENDS` claims, plus one it does not. */
const SLUGS = [
  'images',
  'frames',
  'videos',
  'user-choices',
  'song-tags',
  'meditations',
  'songs',
  'files',
  'event-imports',
  'pages',
] as const

const config = (): Config =>
  ({
    collections: SLUGS.map((slug) => ({ slug, upload: slug !== 'pages', fields: [] })),
  }) as unknown as Config

const pluginSource = () =>
  import('node:fs').then(({ readFileSync }) =>
    readFileSync('src/plugins/storage/storagePlugin.ts', 'utf8'),
  )

describe('which uploads Payload serves itself', () => {
  it('routes the import CSV through Payload and media through the CDN', async () => {
    // Asserted against the module's own table rather than the built config: with
    // no Cloudflare credentials `storagePlugin` returns before
    // `cloudStoragePlugin` runs, which is every local run and every CI run.
    const source = await pluginSource()

    const served = /const PAYLOAD_SERVED_COLLECTIONS[^[]*\[([^\]]*)\]/.exec(source)?.[1]
    expect(served).toBeDefined()
    const slugs = [...served!.matchAll(/'([^']+)'/g)].map(([, slug]) => slug)

    expect(slugs).toEqual(['event-imports'])
  })

  it('passes the flag per collection, not as one constant', async () => {
    // Comments stripped first: this file's own prose names the literal it
    // forbids, so a raw substring check would fail on the explanation.
    const code = (await pluginSource())
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')

    // `disablePayloadAccessControl: true` written as a literal would publish
    // every future collection's file whatever this set says.
    expect(code).toContain('disablePayloadAccessControl: !PAYLOAD_SERVED_COLLECTIONS.has(slug)')
    expect(code).not.toContain('disablePayloadAccessControl: true')
  })

  it('leaves a non-upload collection alone', async () => {
    const result = await storagePlugin()(config())
    const pages = (result.collections ?? []).find((collection) => collection.slug === 'pages')

    expect(pages?.upload).toBeFalsy()
  })
})
