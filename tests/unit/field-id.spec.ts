import { describe, expect, it } from 'vitest'

import { fieldId } from '@/components/admin/helpers/fieldId'

describe('fieldId', () => {
  it('spells a top-level path as Payload does', () => {
    expect(fieldId('startTime')).toBe('field-startTime')
  })

  it('doubles each separator, so a nested path yields one id token', () => {
    // No collection nests either field this landed for, so the components
    // cannot exercise this. Payload's own fields substitute the same way.
    expect(fieldId('schedule.startTime')).toBe('field-schedule__startTime')
  })
})
