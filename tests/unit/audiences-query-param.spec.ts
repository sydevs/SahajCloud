import { describe, expect, it } from 'vitest'

import { audiencesQueryParamSchema } from '@/lib/audiences/audiencesQueryParam'

describe('audiencesQueryParamSchema', () => {
  it('parses a comma-separated list', () => {
    const result = audiencesQueryParamSchema.parse('1,2,3')
    expect(result).toEqual([1, 2, 3])
  })

  it('deduplicates and sorts ascending', () => {
    const result = audiencesQueryParamSchema.parse('3,1,2,1')
    expect(result).toEqual([1, 2, 3])
  })

  it('rejects an empty string', () => {
    const result = audiencesQueryParamSchema.safeParse('')
    expect(result.success).toBe(false)
  })

  it('rejects a non-numeric token', () => {
    const result = audiencesQueryParamSchema.safeParse('1,abc,3')
    expect(result.success).toBe(false)
  })

  it('rejects undefined', () => {
    const result = audiencesQueryParamSchema.safeParse(undefined)
    expect(result.success).toBe(false)
  })

  it('coerces a string array (qs-esm output for repeated query params) to the canonical form', () => {
    const result = audiencesQueryParamSchema.parse(['3', '1', '2'])
    expect(result).toEqual([1, 2, 3])
  })

  it('coerces an empty array to a 400-rejecting empty input', () => {
    const result = audiencesQueryParamSchema.safeParse([])
    expect(result.success).toBe(false)
  })
})
