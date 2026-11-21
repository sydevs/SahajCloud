import type { Condition, Field, NumberField, UIField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Meditations } from '@/collections/Meditations/Meditations'
import { Songs } from '@/collections/Songs/Songs'
import { audioDurationField } from '@/fields'

const isNotice = (field: Field): field is UIField =>
  field.type === 'ui' && field.name === 'durationNotice'

const isValue = (field: Field): field is NumberField =>
  field.type === 'number' && field.name === 'duration'

/** The Meditations pair sits in the unnamed Details tab, which holds no data of its own. */
const meditationDetailFields = (): Field[] => {
  const tabs = Meditations.fields.find((field) => field.type === 'tabs')
  if (tabs?.type !== 'tabs') throw new Error('Meditations declares no tabs')
  return tabs.tabs[0].fields
}

const conditionOf = (fields: Field[]): Condition => {
  const condition = fields.find(isNotice)?.admin?.condition
  if (!condition) throw new Error('the duration notice carries no condition')
  return condition
}

describe('audioDurationField', () => {
  const condition = conditionOf(audioDurationField({ noun: 'track', consequence: 'nothing shows' }))

  it('shows the notice on a saved recording whose audio stated no length', () => {
    expect(condition({ id: 7, duration: null }, {}, {} as never)).toBe(true)
    expect(condition({ id: 7 }, {}, {} as never)).toBe(true)
  })

  it('hides it once a duration was read from the audio', () => {
    expect(condition({ id: 7, duration: 212 }, {}, {} as never)).toBe(false)
  })

  // A zero is a length that was read, not one that is missing, so the editor
  // is told nothing — the read-only field already shows it.
  it('hides it on a duration of zero', () => {
    expect(condition({ id: 7, duration: 0 }, {}, {} as never)).toBe(false)
  })

  // `extractAudioDuration` runs on the save that carries the file, so before
  // the first save there is nothing to report either way.
  it('hides it before the first save', () => {
    expect(condition({ duration: null }, {}, {} as never)).toBe(false)
  })

  it('names the recording and what else the missing length costs', () => {
    const notice = audioDurationField({
      noun: 'meditation',
      consequence: 'the frames carry none',
    }).filter(isNotice)[0]
    const custom = notice.admin?.custom as { title: string; text: string; type: string }

    expect(custom.type).toBe('warning')
    expect(custom.title).toBe('This meditation has no duration')
    expect(custom.text).toContain('the frames carry none')
  })

  // A `ui` field has no `hidden` of its own, so the warning renders wherever it
  // is mounted. Only the seconds beside it can be taken out of the editor's way.
  it('hides the seconds only where the caller asks', () => {
    const hidden = audioDurationField({
      noun: 'meditation',
      consequence: 'nothing shows',
      hideValue: true,
    })
    const shown = audioDurationField({ noun: 'track', consequence: 'nothing shows' })

    expect(hidden.find(isValue)?.admin?.hidden).toBe(true)
    expect(shown.find(isValue)?.admin?.hidden).toBeUndefined()
    expect(shown.find(isValue)?.admin?.description).toBeDefined()
  })
})

// Both collections mount `extractAudioDuration`, which clears a duration the
// audio no longer states, so both owe their editor the notice.
describe('the collections that extract an audio duration', () => {
  it('tells a song editor, beside a visible count of seconds', () => {
    expect(Songs.fields.filter(isNotice)).toHaveLength(1)
    expect(Songs.fields.find(isValue)?.admin?.hidden).toBeUndefined()
  })

  it('tells a meditation editor, whose seconds stay hidden', () => {
    const fields = meditationDetailFields()
    expect(fields.filter(isNotice)).toHaveLength(1)
    expect(fields.find(isValue)?.admin?.hidden).toBe(true)
  })
})
