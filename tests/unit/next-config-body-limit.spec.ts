import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'
import {
  FILE_SIZE_LIMITS,
  UPLOAD_FILE_SIZE_LIMIT,
  UPLOAD_REQUEST_SIZE_LIMIT,
  UPLOAD_SIZE_LIMIT_MESSAGE,
} from '../../src/plugins/storage/uploadValidation'
import { SRC, sourceOf } from '../utils/importGraph'

/**
 * Lowering or removing `experimental.proxyClientMaxBodySize` is invisible: every
 * upload under Next's 10 MB default keeps working, and a larger one fails inside
 * Payload instead (#938). `next.config.mjs` carries the mechanism.
 *
 * What is pinned is the ORDERING, not `cap >= each limit`. The latter holds even
 * for a limit above the request ceiling, which can never fire: that is how
 * `fileSize` sat at 100 MB inside a 50 MB request with this spec green.
 *
 * Payload's two ceilings are read from the module that declares them, not from
 * `payload.config.ts`, because importing that config builds the whole app. The
 * `set upload.<option>` cases keep the config honest about using them — a
 * literal typed back in would otherwise pass every comparison above it.
 */
describe('the upload size limits', () => {
  const cap = nextConfig.experimental?.proxyClientMaxBodySize

  it('give Next a numeric cap, so it compares without a unit parse', () => {
    // The option is typed `number | string`.
    expect(typeof cap).toBe('number')
  })

  it('leave Payload room to refuse a request before Next truncates it', () => {
    // Strictly above, not equal. Payload refuses only ABOVE its own limit, so
    // an equal cap truncates at the same byte and the body ends instead —
    // "Unexpected end of form", a 500 (#939).
    expect(cap).toBeGreaterThan(UPLOAD_REQUEST_SIZE_LIMIT)
  })

  it('keep one file inside the request that has to carry it', () => {
    // Strictly under: the boundary, the part headers and `_payload` ride along
    // in the same body.
    expect(UPLOAD_FILE_SIZE_LIMIT).toBeLessThan(UPLOAD_REQUEST_SIZE_LIMIT)
  })

  // These are checked in `afterChange`, so a category above `fileSize` is
  // refused by the request limit first and never fires.
  it.each(Object.entries(FILE_SIZE_LIMITS))(
    'keep the %s category under the per-file limit',
    (_category, limit) => {
      expect(limit).toBeLessThanOrEqual(UPLOAD_FILE_SIZE_LIMIT)
    },
  )

  it('name both ceilings in the sentence a refused upload gets back', () => {
    expect(UPLOAD_SIZE_LIMIT_MESSAGE).toContain(`${UPLOAD_FILE_SIZE_LIMIT / 1024 / 1024} MB`)
    expect(UPLOAD_SIZE_LIMIT_MESSAGE).toContain(`${UPLOAD_REQUEST_SIZE_LIMIT / 1024 / 1024} MB`)
  })

  it.each([
    ['requestSizeLimit', 'UPLOAD_REQUEST_SIZE_LIMIT'],
    ['fileSize', 'UPLOAD_FILE_SIZE_LIMIT'],
    ['responseOnLimit', 'UPLOAD_SIZE_LIMIT_MESSAGE'],
  ])('set upload.%s from %s', (option, constant) => {
    const source = sourceOf(join(SRC, 'payload.config.ts'))
    expect(source).toContain(`${option}: ${constant}`)
  })
})
