import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'
import { FILE_SIZE_LIMITS } from '../../src/plugins/storage/uploadValidation'
import { SRC, sourceOf } from '../utils/importGraph'

/**
 * Lowering or removing `experimental.proxyClientMaxBodySize` is invisible: every
 * upload under Next's 10 MB default keeps working, and a larger one fails inside
 * Payload instead (#938). `next.config.mjs` carries the mechanism.
 *
 * Payload's half is read as source text, because importing `payload.config.ts`
 * builds the whole config — and a literal copied to here would pin only Next's
 * side, leaving a raised Payload limit green.
 *
 * What is pinned is the ORDERING, not `cap >= each limit`. The latter holds even
 * for a limit above the request ceiling, which can never fire: that is how
 * `fileSize` sat at 100 MB inside a 50 MB request with this spec green.
 */

/** One upload byte-limit `src/payload.config.ts` declares, by option name. */
function payloadUploadLimit(option: string): number {
  const source = sourceOf(join(SRC, 'payload.config.ts'))
  const matches = [...source.matchAll(new RegExp(`${option}:\\s*(\\d+)`, 'g'))]

  // Without exactly one match the comparisons below would read the wrong
  // declaration, or pass against nothing.
  expect(matches, `one upload.${option} expected in src/payload.config.ts`).toHaveLength(1)
  return Number(matches[0][1])
}

describe('the upload size limits', () => {
  const cap = nextConfig.experimental?.proxyClientMaxBodySize
  const requestSizeLimit = payloadUploadLimit('requestSizeLimit')
  const fileSize = payloadUploadLimit('fileSize')

  it('give Next a numeric cap, so it compares without a unit parse', () => {
    // The option is typed `number | string`.
    expect(typeof cap).toBe('number')
  })

  it('let Next admit every request Payload would accept', () => {
    expect(cap).toBeGreaterThanOrEqual(requestSizeLimit)
  })

  it('keep one file inside the request that has to carry it', () => {
    expect(fileSize).toBeLessThanOrEqual(requestSizeLimit)
  })

  // These are checked in `afterChange`, so a category above `fileSize` is
  // refused by the request limit first and never fires.
  it.each(Object.entries(FILE_SIZE_LIMITS))(
    'keep the %s category under the per-file limit',
    (_category, limit) => {
      expect(limit).toBeLessThanOrEqual(fileSize)
    },
  )
})
