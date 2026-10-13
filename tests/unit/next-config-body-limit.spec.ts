import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'

/**
 * `src/middleware.ts` matches `/api/:path*`, so Next buffers a copy of every
 * API request body and truncates it past `experimental.proxyClientMaxBodySize`
 * — without an error, and without failing the request. Payload then reads a
 * cut-off multipart upload and throws "Unexpected end of form" (#938).
 *
 * So the cap must stay at or above what Payload itself accepts
 * (`upload.limits.fileSize`, `src/payload.config.ts`). Lowering or removing it
 * is invisible: every upload under 10 MB keeps working.
 */

const PAYLOAD_FILE_SIZE_LIMIT = 104857600

describe('the Next request-body cap', () => {
  it('admits a body as large as Payload itself accepts', () => {
    const limit = nextConfig.experimental?.proxyClientMaxBodySize

    // The option is typed `number | string` ('100mb' is equally valid), and
    // only the number form is comparable without parsing a unit.
    expect(typeof limit).toBe('number')
    expect(limit).toBeGreaterThanOrEqual(PAYLOAD_FILE_SIZE_LIMIT)
  })
})
