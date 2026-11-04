import { describe, expect, it } from 'vitest'

import { checkSubmissionData } from '@/collections/UserSubmissions/submissionData'

import { registrationSubmissionData } from '../../seeds/atlas/helpers/registrations'

/**
 * How an Atlas registration becomes `submissionData` pairs. The dump itself
 * is local-only now, so its row-by-row check against the collection's bounds
 * runs in `pnpm atlas:sync check` (seeds/atlas/sync/check.ts); this pins the
 * mapping on fixtures.
 */
describe('atlas registrations → user-submissions', () => {
  it('carries the registrant name, so the upserted user is not named after an address', () => {
    // The pair is what `prepareUserSubmission` reads to name the `users` row.
    const pairs = registrationSubmissionData(
      { questions: { experience: 'Yes' } },
      { name: '  Ada Lovelace ' },
    )
    expect(pairs).toEqual([
      { field: 'name', value: 'Ada Lovelace' },
      { field: 'experience', value: 'Yes' },
    ])
  })

  it('never emits the subscribe opt-in, which would mail a live provider', () => {
    const pairs = registrationSubmissionData(
      { questions: { subscribe: 'true', experience: 'No' } },
      { name: 'Registrant' },
    )
    expect(pairs.map((pair) => pair.field)).not.toContain('subscribe')
  })

  it('drops a blank answer rather than storing an empty pair', () => {
    const pairs = registrationSubmissionData(
      { questions: { experience: '   ', referral: 'A friend' } },
      { name: '  ' },
    )
    expect(pairs).toEqual([{ field: 'referral', value: 'A friend' }])
  })

  it('emits pairs the registration contract accepts', () => {
    const pairs = registrationSubmissionData(
      {
        questions: {
          questions: 'Is it free?',
          experience: 'Some',
          aspirations: 'Calm',
          referral: 'Web',
        },
      },
      { name: 'Registrant' },
    )
    expect(checkSubmissionData(pairs, { type: 'registration' })).toEqual([])
  })
})
