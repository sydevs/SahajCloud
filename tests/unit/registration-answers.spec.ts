import { toWords } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import {
  buildRegistrationAnswers,
  EVENT_REGISTRATION_QUESTIONS,
} from '@/lib/registrations/questions'

const labelOf = (name: (typeof EVENT_REGISTRATION_QUESTIONS)[number]['name']) =>
  EVENT_REGISTRATION_QUESTIONS.find((question) => question.name === name)!.label

describe('buildRegistrationAnswers', () => {
  it('maps a known question key to its configured label', () => {
    expect(buildRegistrationAnswers({ referral: 'A friend' })).toEqual([
      { label: labelOf('referral'), value: 'A friend' },
    ])
  })

  it('orders configured questions first, then any extra keys', () => {
    const answers = buildRegistrationAnswers({
      questions: '2',
      experience: 'No',
      custom: 'extra',
    })
    expect(answers.map((answer) => answer.label)).toEqual([
      labelOf('experience'), // earlier in config
      labelOf('questions'), // later in config
      toWords('custom'), // unconfigured key → labelled from the key, last
    ])
  })

  it('labels an unconfigured question from its key, never as the bare key', () => {
    const [answer] = buildRegistrationAnswers({ priorExperience: 'hi' })
    expect(answer).toEqual({ label: toWords('priorExperience'), value: 'hi' })
    expect(answer.label).not.toBe('priorExperience')
  })

  it('drops blank / whitespace-only answers', () => {
    expect(buildRegistrationAnswers({ referral: '   ', aspirations: '' })).toEqual([])
  })

  it('formats boolean, number, and array answers', () => {
    expect(buildRegistrationAnswers({ questions: true }).map((a) => a.value)).toEqual(['Yes'])
    expect(buildRegistrationAnswers({ questions: false }).map((a) => a.value)).toEqual(['No'])
    expect(buildRegistrationAnswers({ questions: 3 }).map((a) => a.value)).toEqual(['3'])
    expect(
      buildRegistrationAnswers({ referral: ['Meetup', 'A friend'] }).map((a) => a.value),
    ).toEqual(['Meetup, A friend'])
  })

  it('returns an empty array for null / undefined / non-object input', () => {
    expect(buildRegistrationAnswers(null)).toEqual([])
    expect(buildRegistrationAnswers(undefined)).toEqual([])
    expect(buildRegistrationAnswers('nope' as unknown as Record<string, unknown>)).toEqual([])
  })
})
