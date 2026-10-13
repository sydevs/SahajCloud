import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'
import { SRC, sourceOf } from '../utils/importGraph'

/**
 * Lowering or removing `experimental.proxyClientMaxBodySize` is invisible: every
 * upload under Next's 10 MB default keeps working, and a larger one fails inside
 * Payload instead (#938). `next.config.mjs` carries the mechanism.
 *
 * Payload's half is read as source text, because importing `payload.config.ts`
 * builds the whole config — and a literal copied to here would pin only Next's
 * side, leaving a raised Payload limit green.
 */

/** Every upload byte-limit `src/payload.config.ts` declares, keyed by option. */
function payloadUploadLimits(): Record<string, number> {
  const source = sourceOf(join(SRC, 'payload.config.ts'))
  const limits: Record<string, number> = {}

  for (const option of ['requestSizeLimit', 'fileSize']) {
    const match = new RegExp(`${option}:\\s*(\\d+)`).exec(source)

    // Without a match the comparison below would pass against nothing.
    expect(match, `upload.${option} not found in src/payload.config.ts`).not.toBeNull()
    limits[option] = Number(match![1])
  }

  return limits
}

describe('the Next request-body cap', () => {
  const limit = nextConfig.experimental?.proxyClientMaxBodySize

  it('is a number, so it compares without a unit parse', () => {
    // The option is typed `number | string`.
    expect(typeof limit).toBe('number')
  })

  // `requestSizeLimit` is the one Next must clear: it is what Payload enforces
  // on a whole request, so anything Payload would accept has to pass Next
  // whole. `fileSize` only bounds one file inside that request.
  it.each(Object.entries(payloadUploadLimits()))(
    'admits a body as large as Payload’s %s',
    (_option, payloadLimit) => {
      expect(limit).toBeGreaterThanOrEqual(payloadLimit)
    },
  )
})
