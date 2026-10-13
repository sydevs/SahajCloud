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
 * side, leaving a raised `fileSize` green.
 */

function payloadFileSizeLimit(): number {
  const match = /fileSize:\s*(\d+)/.exec(sourceOf(join(SRC, 'payload.config.ts')))

  // Without a match the comparison below would pass against nothing.
  expect(match, 'upload.limits.fileSize not found in src/payload.config.ts').not.toBeNull()

  return Number(match![1])
}

describe('the Next request-body cap', () => {
  it('admits a body as large as Payload itself accepts', () => {
    const limit = nextConfig.experimental?.proxyClientMaxBodySize

    // Typed `number | string`; only the number form compares without a unit parse.
    expect(typeof limit).toBe('number')
    expect(limit).toBeGreaterThanOrEqual(payloadFileSizeLimit())
  })
})
