import { describe, expect, it } from 'vitest'

import { isUploadAssigned, refId } from '@/lib/status/helpers'

describe('refId', () => {
  it('returns scalar ids unchanged', () => {
    expect(refId(42)).toBe(42)
    expect(refId('abc')).toBe('abc')
  })

  it('extracts the id from a populated { id } object', () => {
    expect(refId({ id: 7, title: 'x' })).toBe(7)
  })

  it('unwraps a polymorphic { relationTo, value } wrapper with a scalar value', () => {
    // The Lessons `meditation` field is polymorphic (meditations | videos).
    expect(refId({ relationTo: 'meditations', value: 5 })).toBe(5)
    // A video link must also resolve — the meditation-set readiness check
    // must pass for a step whose meditation slot holds a video.
    expect(refId({ relationTo: 'videos', value: 9 })).toBe(9)
  })

  it('unwraps a polymorphic wrapper whose value is a populated doc', () => {
    expect(refId({ relationTo: 'videos', value: { id: 11, title: 'clip' } })).toBe(11)
  })

  it('returns null for unset / unknown values', () => {
    expect(refId(null)).toBeNull()
    expect(refId(undefined)).toBeNull()
    expect(refId({})).toBeNull()
    expect(refId({ relationTo: 'videos' })).toBeNull()
  })
})

describe('isUploadAssigned', () => {
  it('mirrors refId presence', () => {
    expect(isUploadAssigned(3)).toBe(true)
    expect(isUploadAssigned({ relationTo: 'videos', value: 3 })).toBe(true)
    expect(isUploadAssigned(null)).toBe(false)
  })
})
