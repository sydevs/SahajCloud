import type { Condition, Field, UIField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Songs } from '@/collections/Songs/Songs'

const noticeCondition = (): Condition => {
  const isNotice = (field: Field): field is UIField =>
    field.type === 'ui' && field.name === 'durationNotice'
  const condition = Songs.fields.find(isNotice)?.admin?.condition

  if (!condition) throw new Error('the Songs duration notice carries no condition')
  return condition
}

describe('the Songs duration notice', () => {
  const condition = noticeCondition()

  it('shows on a saved song whose audio stated no length', () => {
    expect(condition({ id: 7, duration: null }, {}, {} as never)).toBe(true)
    expect(condition({ id: 7 }, {}, {} as never)).toBe(true)
  })

  it('hides once a duration was read from the audio', () => {
    expect(condition({ id: 7, duration: 212 }, {}, {} as never)).toBe(false)
  })

  // A zero is a length that was read, not one that is missing, so the editor
  // is told nothing — the read-only field already shows it.
  it('hides on a duration of zero', () => {
    expect(condition({ id: 7, duration: 0 }, {}, {} as never)).toBe(false)
  })

  // `extractAudioDuration` runs on the save that carries the file, so before
  // the first save there is nothing to report either way.
  it('hides before the first save', () => {
    expect(condition({ duration: null }, {}, {} as never)).toBe(false)
  })
})
