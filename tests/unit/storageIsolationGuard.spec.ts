/**
 * Safety test for the preview/non-production storage delete guard (issue #432,
 * acceptance criterion: "from preview, attempt to delete a cloned asset that
 * exists in prod; confirm it is intact afterwards").
 *
 * We prove the guard deterministically rather than by deleting a real prod asset:
 * a non-production deployment's `handleDelete` must NOT issue the underlying
 * delete API/SDK call for an asset that lacks the preview marker (a cloned prod
 * asset), while production deletes anything and preview deletes its own marked
 * assets. The network/SDK layer is mocked, so "did we call delete?" is the
 * assertion.
 */
import type { S3Client } from '@aws-sdk/client-s3'
import type { Adapter, GeneratedAdapter } from '@payloadcms/plugin-cloud-storage/types'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cloudflareImagesAdapter } from '@/plugins/storage/cloudflareImagesAdapter'
import { cloudflareStreamAdapter } from '@/plugins/storage/cloudflareStreamAdapter'
import { PREVIEW_ASSET_PREFIX, PRODUCTION_ORIGIN_HOST } from '@/plugins/storage/previewIsolation'
import { r2NativeAdapter } from '@/plugins/storage/r2NativeAdapter'

const PROD_URL = `https://${PRODUCTION_ORIGIN_HOST}`
const PREVIEW_URL = 'https://sahajcloud-pr-432.up.railway.app'

// A cloned-from-prod id/key carries no preview marker; a preview-created one does.
const PROD_ASSET_ID = 'real-prod-photo-ab12cd'
const PREVIEW_ASSET_ID = `${PREVIEW_ASSET_PREFIX}smoke-photo-ef34gh`

type AdapterArg = Parameters<Adapter>[0]
type DeleteArg = Parameters<GeneratedAdapter['handleDelete']>[0]
const adapterArg = (prefix?: string): AdapterArg => ({ prefix }) as unknown as AdapterArg
const deleteArg = (filename: string): DeleteArg => ({ filename }) as unknown as DeleteArg

const ORIGINAL_SAHAJCLOUD_URL = process.env.SAHAJCLOUD_URL
const setOrigin = (url: string | undefined): void => {
  if (url === undefined) delete process.env.SAHAJCLOUD_URL
  else process.env.SAHAJCLOUD_URL = url
}

/** Minimal Response stub for the adapters' `await fetch(...).json()` calls. */
const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

const imagesConfig = {
  accountId: 'acct',
  apiKey: 'key',
  deliveryUrl: 'https://imagedelivery.net/hash',
}
const streamConfig = {
  accountId: 'acct',
  apiKey: 'key',
  deliveryUrl: 'https://customer-x.cloudflarestream.com',
}

afterEach(() => {
  setOrigin(ORIGINAL_SAHAJCLOUD_URL)
  vi.restoreAllMocks()
})

describe('Cloudflare Images delete guard', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true, errors: [] }))
  })

  const handleDelete = (filename: string) =>
    cloudflareImagesAdapter(imagesConfig)(adapterArg()).handleDelete(deleteArg(filename))

  it('refuses to delete a cloned prod image from a preview deployment', async () => {
    setOrigin(PREVIEW_URL)
    await handleDelete(PROD_ASSET_ID)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('deletes a preview-owned image from a preview deployment', async () => {
    setOrigin(PREVIEW_URL)
    await handleDelete(PREVIEW_ASSET_ID)
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain(PREVIEW_ASSET_ID)
    expect(init?.method).toBe('DELETE')
  })

  it('deletes any image from production (guard disabled)', async () => {
    setOrigin(PROD_URL)
    await handleDelete(PROD_ASSET_ID)
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy.mock.calls[0][1]?.method).toBe('DELETE')
  })
})

describe('R2 delete guard', () => {
  const buildAdapter = () => {
    const send = vi.fn().mockResolvedValue({})
    const client = { send } as unknown as S3Client
    const generated = r2NativeAdapter({ client, bucket: 'bucket', publicUrl: '' })(
      adapterArg('meditations'),
    )
    return { send, handleDelete: (filename: string) => generated.handleDelete(deleteArg(filename)) }
  }

  it('refuses to delete a cloned prod object from a preview deployment', async () => {
    setOrigin(PREVIEW_URL)
    const { send, handleDelete } = buildAdapter()
    await handleDelete(`${PROD_ASSET_ID}.mp3`)
    expect(send).not.toHaveBeenCalled()
  })

  it('deletes a preview-owned object from a preview deployment', async () => {
    setOrigin(PREVIEW_URL)
    const { send, handleDelete } = buildAdapter()
    await handleDelete(`${PREVIEW_ASSET_ID}.mp3`)
    expect(send).toHaveBeenCalledOnce()
  })

  it('deletes any object from production (guard disabled)', async () => {
    setOrigin(PROD_URL)
    const { send, handleDelete } = buildAdapter()
    await handleDelete(`${PROD_ASSET_ID}.mp3`)
    expect(send).toHaveBeenCalledOnce()
  })
})

describe('Cloudflare Stream delete guard', () => {
  /**
   * Stream's guard reads the video's `meta` via GET, then deletes only if the
   * marker is present. The mock answers GET with the given meta and DELETE with
   * a generic success, so we can assert whether a DELETE was ever issued.
   */
  const mockFetchWithMeta = (meta: Record<string, string>) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'GET') {
        return jsonResponse({ success: true, errors: [], result: { uid: 'uid', meta } })
      }
      return jsonResponse({ success: true, errors: [] })
    })

  const deleteCalls = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.filter(([, init]) => (init?.method ?? 'GET').toUpperCase() === 'DELETE')

  const handleDelete = (uid: string) =>
    cloudflareStreamAdapter(streamConfig)(adapterArg()).handleDelete(deleteArg(uid))

  it('refuses to delete a cloned prod video (no preview meta) from a preview deployment', async () => {
    setOrigin(PREVIEW_URL)
    const spy = mockFetchWithMeta({ name: 'prod video' })
    await handleDelete('prod-uid')
    expect(deleteCalls(spy)).toHaveLength(0)
  })

  it('deletes a preview-owned video (preview meta) from a preview deployment', async () => {
    setOrigin(PREVIEW_URL)
    const spy = mockFetchWithMeta({ env: 'preview' })
    await handleDelete('preview-uid')
    expect(deleteCalls(spy)).toHaveLength(1)
  })

  it('deletes any video from production without a guard GET', async () => {
    setOrigin(PROD_URL)
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true, errors: [] }))
    await handleDelete('prod-uid')
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][1]?.method).toBe('DELETE')
  })
})
