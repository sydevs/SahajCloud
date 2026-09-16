import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  allowedSubmissionKeys,
  checkSubmissionData,
  SUBSCRIBE_OPT_IN,
} from '@/collections/UserSubmissions/submissionData'

import { registrationSubmissionData } from '../../seeds/atlas/import'

/**
 * The Atlas registration dump against the contract the collection that now
 * stores it enforces (#799). `user-submissions` bounds `submissionData` with a
 * per-type key allow-list and length limits, so a dump row carrying a key the
 * type does not accept, or an oversized answer, is refused at create — 2004
 * rows into a seed run, with the rest of the import already committed.
 *
 * A data assertion, like its `atlas-events-data` sibling: a re-extraction, or a
 * change to `EVENT_REGISTRATION_QUESTIONS`, fails here rather than mid-seed.
 */

interface AtlasRegistrationRow {
  legacyId: number
  uuid: string
  questions: Record<string, unknown> | null
  mailingListSubscribedAt: string | null
}

interface AtlasUserRow {
  legacyId: number
  name: string
}

const registrations: AtlasRegistrationRow[] = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'seeds/atlas/data/registrations.json'), 'utf-8'),
)
const users: AtlasUserRow[] = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'seeds/atlas/data/users.json'), 'utf-8'),
)
const allowed = allowedSubmissionKeys('registration')

describe('atlas registrations → user-submissions', () => {
  it('maps every row within the submissionData bounds', () => {
    const rejected: string[] = []
    for (const reg of registrations) {
      const pairs = registrationSubmissionData(reg, { name: 'Registrant' })
      const problems = checkSubmissionData(pairs, allowed)
      if (problems.length > 0) rejected.push(`${reg.uuid}: ${problems.join(' ')}`)
    }
    expect(rejected).toEqual([])
  })

  it('carries the registrant name, so the upserted user is not named after an address', () => {
    // The pair is what `prepareUserSubmission` reads to name the `users` row.
    const named = users.find((user) => user.name?.trim())
    expect(named).toBeDefined()
    const pairs = registrationSubmissionData({ questions: { experience: 'Yes' } }, named!)
    expect(pairs).toEqual([
      { field: 'name', value: named!.name.trim() },
      { field: 'experience', value: 'Yes' },
    ])
  })

  it('never emits the subscribe opt-in', () => {
    // A `subscribe` pair spawns a real subscribe row, which screens and then
    // delivers to a live provider — a seed run must mail nobody. The consent on
    // the one row that carries a timestamp is reported as a warning instead.
    const optIns = registrations.flatMap((reg) =>
      registrationSubmissionData(reg, { name: 'Registrant' }).filter(
        (pair) => pair.field === SUBSCRIBE_OPT_IN,
      ),
    )
    expect(optIns).toEqual([])
    expect(registrations.filter((reg) => reg.mailingListSubscribedAt).length).toBe(1)
  })

  it('drops a blank answer rather than storing an empty pair', () => {
    const pairs = registrationSubmissionData(
      { questions: { experience: '   ', referral: 'A friend' } },
      { name: '  ' },
    )
    expect(pairs).toEqual([{ field: 'referral', value: 'A friend' }])
  })
})
