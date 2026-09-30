import type { CollectionBeforeChangeHook } from 'payload'

import { describe, expect, it } from 'vitest'

import { detectOrientationHook } from '@/collections/Images/hooks/detectOrientationHook'

type HookArgs = Parameters<CollectionBeforeChangeHook>[0]

/**
 * ICNS header: the `icns` magic plus one `ic07` chunk. `image-size` routed this
 * to the parser GHSA-w3rx-r6r6-pgpr reports an infinite loop in, which is the
 * shape #780 exists to keep off the upload path.
 */
function icnsBuffer(): Buffer {
  const buffer = Buffer.alloc(64)
  buffer.write('icns', 0, 'ascii')
  buffer.writeUInt32BE(64, 4)
  buffer.write('ic07', 8, 'ascii')
  return buffer
}

function runHook(
  data: Record<string, unknown>,
  file: { data: Buffer; mimetype: string } | null = { data: icnsBuffer(), mimetype: 'image/png' },
  operation: 'create' | 'update' = 'create',
) {
  return detectOrientationHook({
    collection: { slug: 'images' },
    context: {},
    data,
    operation,
    req: { file, payload: { logger: { warn: () => {} } } },
  } as unknown as HookArgs) as Promise<Record<string, unknown>>
}

describe('detectOrientationHook', () => {
  it('tags from the dimensions Payload measured, never from the upload buffer', async () => {
    const result = await runHook({ width: 1050, height: 700 })

    expect(result.tags).toEqual(['landscape'])
  })

  it('returns an ICNS payload declared as image/png untouched, and promptly', async () => {
    const started = Date.now()
    const result = await runHook({ alt: 'crafted' })

    expect(result).toEqual({ alt: 'crafted' })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it.each([
    [1050, 700, 'landscape'],
    [700, 1050, 'portrait'],
    [1000, 1000, 'square'],
    [1050, 1000, 'square'],
    [1000, 1050, 'square'],
    [1150, 1000, 'landscape'],
    [1000, 1150, 'portrait'],
  ])('tags %ix%i as %s', async (width, height, expected) => {
    const result = await runHook({ width, height })

    expect(result.tags).toEqual([expected])
  })

  it('skips SVG uploads, which Payload measures off width/height or viewBox', async () => {
    const result = await runHook(
      { width: 1050, height: 700 },
      { data: Buffer.from('<svg width="1050" height="700"/>'), mimetype: 'image/svg+xml' },
    )

    expect(result.tags).toBeUndefined()
  })

  it('preserves existing tags and never duplicates the orientation', async () => {
    const result = await runHook({ width: 1050, height: 700, tags: ['thumbnail', 'landscape'] })

    expect(result.tags).toEqual(['thumbnail', 'landscape'])
  })

  it('leaves an unmeasured upload untagged', async () => {
    const result = await runHook({ width: 1050, height: 0 })

    expect(result.tags).toBeUndefined()
  })

  it('only runs on create', async () => {
    const result = await runHook({ width: 1050, height: 700 }, undefined, 'update')

    expect(result.tags).toBeUndefined()
  })
})
