/**
 * `handleUpload`, `handleDelete` and `staticHandler` have to address the same
 * R2 object (#907).
 *
 * ⚠ **They did not, and nothing could see it.** `staticHandler` composed
 * `<collection>/<filename>` while its two siblings composed the factory's own
 * `prefix` — and `storagePlugin` passes no prefix, so every object sits flat at
 * the bucket root. Reading the collection-prefixed key fetched something
 * nothing had ever written and answered 404 for every file.
 *
 * It stayed dormant because `disablePayloadAccessControl: true` on every R2
 * collection meant `cloudStoragePlugin` mounted no handler on that route at
 * all. `event-imports` is the first collection to want a gated download — the
 * CSV is PII — so it is the first that this being wrong would break, and the
 * break would send everyone back to the public delivery URL.
 */
import type { S3Client } from '@aws-sdk/client-s3'
import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  serverEnv: { CLOUDFLARE_R2_DELIVERY_URL: 'https://assets.example.test' },
}))

import { r2NativeAdapter } from '@/plugins/storage/r2NativeAdapter'

/** An S3 client that records the `Key` of every command instead of sending it. */
function recordingClient() {
  const keys: string[] = []
  const client = {
    send: vi.fn(async (command: { input?: { Key?: string } }) => {
      if (command.input?.Key) keys.push(command.input.Key)
      // Enough of a `GetObject` answer for `staticHandler` to build a Response.
      return { Body: { transformToWebStream: () => new ReadableStream() }, ContentType: 'text/csv' }
    }),
  }
  return { client: client as unknown as S3Client, keys }
}

const adapterFor = (client: S3Client) =>
  r2NativeAdapter({ client, bucket: 'test-bucket', publicUrl: 'https://assets.example.test' })({
    collection: { slug: 'event-imports' },
    prefix: undefined,
  } as never)

const req = { context: {} } as PayloadRequest

describe('the R2 adapter addresses one key per object', () => {
  it('writes, deletes and serves the same key with no prefix', async () => {
    const { client, keys } = recordingClient()
    const adapter = adapterFor(client)

    const file = {
      filename: 'classes.csv',
      buffer: Buffer.from('a,b\n1,2\n'),
      filesize: 8,
      mimeType: 'text/csv',
      tempFilePath: undefined,
    }
    await adapter.handleUpload!({ data: {}, file, req } as never)
    const written = keys.at(-1)!

    await adapter.handleDelete!({ filename: written, req } as never)
    const deleted = keys.at(-1)!

    await adapter.staticHandler!(req, {
      params: { collection: 'event-imports', filename: written },
    } as never)
    const served = keys.at(-1)!

    // ⚠ Asserted as an agreement between the three, not against a literal: the
    // key shape is the adapter's own business, and `generateR2Key` puts a random
    // suffix in it. What must never differ is which of them reaches the object.
    expect(deleted).toBe(written)
    expect(served).toBe(written)
    expect(served).not.toContain('event-imports/')
  })

  it('keeps them in agreement when the factory does carry a prefix', async () => {
    // The non-production preview namespace arrives this way, so the three must
    // agree under it too — not only in the flat case `storagePlugin` uses today.
    const { client, keys } = recordingClient()
    const adapter = r2NativeAdapter({
      client,
      bucket: 'test-bucket',
      publicUrl: 'https://assets.example.test',
    })({ collection: { slug: 'event-imports' }, prefix: 'preview-pr-1' } as never)

    await adapter.handleUpload!({
      data: {},
      file: { filename: 'classes.csv', buffer: Buffer.from('a\n1\n'), filesize: 4, mimeType: 'text/csv' },
      req,
    } as never)
    const written = keys.at(-1)!
    expect(written.startsWith('preview-pr-1/')).toBe(true)

    await adapter.staticHandler!(req, {
      params: { collection: 'event-imports', filename: written.split('/').pop()! },
    } as never)

    expect(keys.at(-1)).toBe(written)
  })
})
