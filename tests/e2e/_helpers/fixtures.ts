import type { APIRequestContext, APIResponse } from '@playwright/test'

import { readFileSync } from 'node:fs'

import type { Image } from '@/payload-types'

/**
 * What a smoke spec uploads for itself, and the bin that removes it again.
 *
 * A spec that only needs a row to exist reads the preview fixture's pinned ids
 * (`src/fixture/`), which CI waits for before this lane runs. A spec testing a
 * create or an upload makes its own row here, and `smokeTest.ts` empties the
 * bin in a fixture teardown.
 *
 * Field values are typed against `@/payload-types` rather than written as bare
 * literals, so `pnpm typecheck:tests` catches a renamed field or a dropped enum
 * value in seconds, instead of five minutes into a preview run.
 */

export type Id = number | string

/** What a create returns. `filename` exists only on the upload collections. */
export type SmokeDoc = { id: Id; filename?: string }

/**
 * Sample uploads, read on first use. `webp` is the default because three
 * fixtures upload one per run, through Cloudflare Images, and CI retries twice:
 * it is 50 KB against the PNG's 512 KB, at the same dimensions.
 */
const SAMPLE_IMAGES = {
  webp: { path: 'tests/files/image-1050x700.webp', mimeType: 'image/webp' },
  png: { path: 'tests/files/image-1050x700.png', mimeType: 'image/png' },
} as const

export type ImageFormat = keyof typeof SAMPLE_IMAGES

const buffers = new Map<ImageFormat, Buffer>()

function sampleImage(format: ImageFormat): Buffer {
  const cached = buffers.get(format)
  if (cached) return cached
  const buffer = readFileSync(SAMPLE_IMAGES[format].path)
  buffers.set(format, buffer)
  return buffer
}

/**
 * Throw with the status and body when a request failed.
 *
 * The body is read only on the failure path. `expect(res.ok(), message)` builds
 * its message first, so it fetches the body on every passing assertion too.
 */
export async function expectOk(res: APIResponse, what: string): Promise<void> {
  if (!res.ok()) {
    throw new Error(`${what} failed: ${res.status()} ${await res.text()}`)
  }
}

async function createdDoc(res: APIResponse, collection: string): Promise<SmokeDoc> {
  await expectOk(res, `smoke fixture: creating the ${collection} record`)
  const body = (await res.json()) as { doc?: SmokeDoc }
  if (body.doc?.id === undefined) {
    throw new Error(`smoke fixture: ${collection} create returned no id: ${JSON.stringify(body)}`)
  }
  return body.doc
}

/**
 * POST a file to an upload collection. Payload's REST convention puts the JSON
 * document in `_payload` and the binary in `file`.
 * https://payloadcms.com/docs/rest-api/overview#uploads
 */
async function postUpload(
  request: APIRequestContext,
  headers: Record<string, string>,
  collection: string,
  data: unknown,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<SmokeDoc> {
  const res = await request.post(`/api/${collection}`, {
    headers,
    multipart: { _payload: JSON.stringify(data), file },
  })
  return createdDoc(res, collection)
}

export type Trash = ReturnType<typeof createTrash>

/**
 * A bin of records to delete, emptied newest-first.
 *
 * Deletes are best-effort: a record the spec already removed answers 404, and a
 * cascade (Albums deletes its Songs) may have taken one out from under us.
 * Neither is a failure — the assertions live in the spec, not here.
 */
export function createTrash(request: APIRequestContext, headers: Record<string, string>) {
  const refs: Array<{ collection: string; id: Id }> = []
  return {
    /** Track a record for deletion, and return its id for the call site. */
    track(collection: string, id: Id): Id {
      refs.push({ collection, id })
      return id
    },
    async empty(): Promise<void> {
      for (const ref of [...refs].reverse()) {
        try {
          await request.delete(`/api/${ref.collection}/${ref.id}`, { headers })
        } catch {
          // Teardown never fails a spec — the deployment already answered the
          // assertions, and a leaked record is namespaced by SMOKE_RUN_ID.
        }
      }
      refs.length = 0
    },
  }
}

/** Upload an Image. */
export function createImage(
  request: APIRequestContext,
  headers: Record<string, string>,
  name: string,
  { tags = [], format = 'webp' }: { tags?: Image['tags']; format?: ImageFormat } = {},
): Promise<SmokeDoc> {
  const data: Pick<Image, 'alt' | 'tags'> = { alt: name, tags }
  return postUpload(request, headers, 'images', data, {
    name: `${name}.${format}`,
    mimeType: SAMPLE_IMAGES[format].mimeType,
    buffer: sampleImage(format),
  })
}
