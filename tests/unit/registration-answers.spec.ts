import { describe, expect, it } from 'vitest'

import { buildRegistrationAnswers } from '@/lib/registrations/questions'

describe('buildRegistrationAnswers', () => {
  it('maps a known question key to its configured label', () => {
    expect(buildRegistrationAnswers({ referral: 'A friend' })).toEqual([
      { label: 'How did you hear about this event?', value: 'A friend' },
    ])
  })

  it('orders configured questions first, then any extra keys', () => {
    const answers = buildRegistrationAnswers({
      questions: '2',
      experience: 'No',
      custom: 'extra',
    })
    expect(answers.map((answer) => answer.label)).toEqual([
      'Have you practised Sahaja Yoga meditation before?', // experience — earlier in config
      'Do you have any questions for us?', // questions — later in config
      'custom', // unconfigured key → raw key, last
    ])
  })

  it('falls back to the raw key for an unconfigured question', () => {
    expect(buildRegistrationAnswers({ mystery: 'hi' })).toEqual([{ label: 'mystery', value: 'hi' }])
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
