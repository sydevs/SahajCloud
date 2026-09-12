import type { APIRequestContext, APIResponse } from '@playwright/test'

import { readFileSync } from 'node:fs'

import type { Frame, Image, Narrator } from '@/payload-types'

/**
 * The dependencies a smoke spec creates for itself, and the bin that removes
 * them again.
 *
 * **A per-PR preview carries no content.** Railway forks service configuration
 * and variables, not volume data, so a PR environment boots with migrations
 * applied and exactly one row anywhere: the admin `src/plugins/previewAdmin`
 * reconciles on every boot. Every content table is empty on every PR (#704).
 *
 * That is why a spec must not read a list and skip when it comes back empty —
 * the condition holds on every run, so the spec never asserts anything while
 * the job stays green. Each spec creates its own dependencies instead, and
 * `smokeTest.ts` empties the bin in a fixture teardown.
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
 * POST a JSON document to a collection.
 *
 * `data` needs no `content-type` header of its own: an object goes over the
 * wire as `jsonData`, and Playwright then sets `content-type: application/json`
 * unless the caller already named one
 * (`playwright-core/lib/server/fetch.js`, `serializePostData`).
 */
async function postJson(
  request: APIRequestContext,
  headers: Record<string, string>,
  collection: string,
  data: unknown,
): Promise<SmokeDoc> {
  const res = await request.post(`/api/${collection}`, { headers, data })
  return createdDoc(res, collection)
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

/**
 * The tag a Meditation thumbnail must carry: `mediaField` turns `tagName` into
 * `filterOptions: { tags: { contains: tagName } }` (`src/fields/mediaField.ts`).
 */
export const MEDITATION_IMAGE_TAG: NonNullable<Image['tags']>[number] = 'meditation'

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

/** Create an Album. `artwork`, `title` and `artist` are all required. */
export function createAlbum(
  request: APIRequestContext,
  headers: Record<string, string>,
  { title, artist, artwork }: { title: string; artist: string; artwork: Id },
): Promise<SmokeDoc> {
  return postJson(request, headers, 'albums', { title, artist, artwork })
}

/** Create a Narrator. `name` and `gender` are the whole collection. */
export function createNarrator(
  request: APIRequestContext,
  headers: Record<string, string>,
  name: string,
): Promise<SmokeDoc> {
  const data: Pick<Narrator, 'name' | 'gender'> = { name, gender: 'female' }
  return postJson(request, headers, 'narrators', data)
}

/**
 * Upload a Frame. `imageSet` is required, and so is `label` — the admin shows
 * the latter only for a frame with no `subtleSystemNode`, but the field is
 * required either way.
 */
export function createFrame(
  request: APIRequestContext,
  headers: Record<string, string>,
  label: string,
): Promise<SmokeDoc> {
  const data: Pick<Frame, 'imageSet' | 'label'> = { imageSet: 'female', label }
  return postUpload(request, headers, 'frames', data, {
    name: `${label}.webp`,
    mimeType: SAMPLE_IMAGES.webp.mimeType,
    buffer: sampleImage('webp'),
  })
}
