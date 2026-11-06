import { describe, expect, it } from 'vitest'

import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'

describe('mergeFieldStyles', () => {
  it('carries a declared width into the --field-width property Payload reads', () => {
    expect(mergeFieldStyles({ width: '50%' })).toEqual({ '--field-width': '50%' })
  })

  it('flexes a field that declares no width, so it fills its slot', () => {
    expect(mergeFieldStyles(undefined)).toEqual({ flex: '1 1 auto' })
  })

  it('keeps the rest of a declared style beside the width', () => {
    expect(mergeFieldStyles({ style: { marginTop: 8 }, width: '20rem' })).toEqual({
      '--field-width': '20rem',
      marginTop: 8,
    })
  })

  it('lets a declared flex outrank the no-width fallback', () => {
    expect(mergeFieldStyles({ style: { flex: '0 0 12rem' } })).toEqual({ flex: '0 0 12rem' })
  })
})
