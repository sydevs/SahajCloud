import type { PayloadRequest } from 'payload'

import { headersWithCors } from 'payload'
import { describe, expect, it } from 'vitest'

import { PREVIEW_SECRET_HEADER } from '@/lib/utilities/previewSecret'
import configPromise from '@/payload.config'

/**
 * #575 — the Atlas live-preview widget fetches drafts client-side, so the
 * `x-sahajcloud-preview-secret` header rides cross-origin browser requests
 * and must clear CORS preflight. Runs Payload's own `headersWithCors` against
 * the real app config (not the test-helper config), so it breaks if the
 * `cors` shape stops allowing the header — or starts allowing credentials,
 * which #509 requires stays off.
 */
describe('CORS preflight config', () => {
  it('allows the live-preview secret header without enabling credentials', async () => {
    const config = await configPromise
    const req = {
      payload: { config },
      headers: new Headers({ Origin: 'https://atlas-widget.example.org' }),
    } as unknown as PayloadRequest

    const headers = headersWithCors({ headers: new Headers(), req })

    const allowed = (headers.get('Access-Control-Allow-Headers') ?? '').toLowerCase()
    expect(allowed).toContain(PREVIEW_SECRET_HEADER)
    // The object-form `cors.headers` must APPEND to Payload's default
    // allow-list, not replace it — clients still send Authorization.
    expect(allowed).toContain('authorization')
    // origins '*' → wildcard origin, and credentials stay OFF (#509).
    expect(headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })
})
