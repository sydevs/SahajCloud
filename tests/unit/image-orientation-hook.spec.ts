import type { CollectionBeforeChangeHook } from 'payload'

import { describe, expect, it } from 'vitest'

import { detectOrientationHook } from '@/collections/Images/hooks/detectOrientationHook'

type HookArgs = Parameters<CollectionBeforeChangeHook>[0]

/**
 * An ICNS header — the `icns` magic plus one `ic07` chunk — declared as a PNG.
 * Every case runs against it, so a tag can only have come from `data`: no
 * dimension parser reads these bytes and returns 1050x700 (#780).
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
  { mimetype = 'image/png', operation = 'create' }: { mimetype?: string; operation?: string } = {},
) {
  return detectOrientationHook({
    data,
    operation,
    req: { file: { data: icnsBuffer(), mimetype } },
  } as unknown as HookArgs) as Promise<Record<string, unknown>>
}

describe('detectOrientationHook', () => {
  it('tags from the dimensions Payload measured, never from the upload buffer', async () => {
    const result = await runHook({ width: 1050, height: 700 })

    expect(result.tags).toEqual(['landscape'])
  })

  it.each([
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

  it('skips SVG, which Payload measures off width/height or viewBox', async () => {
    const result = await runHook(
      { width: 1050, height: 700, mimeType: 'image/svg+xml' },
      { mimetype: 'image/svg+xml' },
    )

    expect(result.tags).toBeUndefined()
  })

  it('skips an SVG posted as image/png, because the sniffed type decides', async () => {
    const result = await runHook({ width: 1050, height: 700, mimeType: 'image/svg+xml' })

    expect(result.tags).toBeUndefined()
  })

  it('tags a png posted as image/svg+xml, for the same reason', async () => {
    const result = await runHook(
      { width: 1050, height: 700, mimeType: 'image/png' },
      { mimetype: 'image/svg+xml' },
    )

    expect(result.tags).toEqual(['landscape'])
  })

  it('preserves existing tags and never duplicates the orientation', async () => {
    const result = await runHook({ width: 1050, height: 700, tags: ['thumbnail', 'landscape'] })

    expect(result.tags).toEqual(['thumbnail', 'landscape'])
  })

  it.each([
    ['Payload declined to measure it', { alt: 'crafted' }],
    ['a dimension came back zero', { width: 1050, height: 0 }],
    ['a dimension is not a number', { width: 1050, height: '700' }],
  ])('leaves the upload untagged when %s', async (_case, data) => {
    const result = await runHook(data)

    expect(result).toEqual(data)
  })

  it('only runs on create', async () => {
    const result = await runHook({ width: 1050, height: 700 }, { operation: 'update' })

    expect(result.tags).toBeUndefined()
  })
})
