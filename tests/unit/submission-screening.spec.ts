/**
 * The pure halves of screening: the machine-verdict rule everything else keys
 * on, the body digest, and the proposal content check.
 *
 * All three are pure, so the whole matrix runs in the unit lane without booting
 * Payload. The job's own behaviour — what it writes, and what it queues next —
 * is `tests/int/screen-submissions.int.spec.ts`.
 */
import type { FlattenedField } from 'payload'

import { describe, expect, it } from 'vitest'

// The factory itself, not the `@/fields` barrel: the barrel pulls the schedule
// and translations fields into a lane that boots nothing.
import { urlField } from '@/fields/urlField'
import { screenProposalContent } from '@/jobs/ScreenSubmissions/contentScreening'
import { hashSubmissionBody } from '@/jobs/ScreenSubmissions/senderHistory'
import { isMachineSpam, isScreeningResult } from '@/jobs/ScreenSubmissions/verdicts'

describe('isMachineSpam', () => {
  /**
   * ⚠ The rule this file exists for. `spam` and `rejected` are two statuses so
   * abuse counting never has to guess whose refusal it read — counting a
   * manager's decline would make their judgement a spam strike against the
   * person who wrote in, and enough of those would refuse that person's next
   * genuine submission.
   */
  it('counts a machine refusal', () => {
    expect(isMachineSpam({ status: 'spam' })).toBe(true)
  })

  it('does not count a human decline', () => {
    // A manager-declined proposal: screening passed, and a person said no
    // afterwards. Its verdict is `ok` and its status is `rejected`.
    expect(isMachineSpam({ status: 'rejected' })).toBe(false)
  })

  it('does not count a row nobody has refused', () => {
    for (const status of ['pending', 'accepted', 'failed'] as const) {
      expect(isMachineSpam({ status })).toBe(false)
    }
    expect(isMachineSpam({})).toBe(false)
    expect(isMachineSpam({ status: null })).toBe(false)
  })

  it('does not count a row this build did not write', () => {
    // The column is JSON, so anything could be in there. A verdict outside the
    // union means the row was written by something else, and guessing is worse
    // than not counting it.
    expect(isScreeningResult({ verdict: 'something_else' })).toBe(false)
    expect(isScreeningResult('ok')).toBe(false)
  })

  /**
   * The column's `jsonSchema` validates writes and generates the type; nothing
   * re-validates on read, so the guard is what stands between a JSON column and
   * a narrowed type. It must refuse everything that is not an object carrying a
   * known verdict — a bare array included, since `typeof [] === 'object'`.
   */
  it('refuses anything that is not an object carrying a known verdict', () => {
    expect(isScreeningResult(null)).toBe(false)
    expect(isScreeningResult(undefined)).toBe(false)
    expect(isScreeningResult([{ verdict: 'ok' }])).toBe(false)
    expect(isScreeningResult({ screenedAt: '2026-09-15T00:00:00.000Z' })).toBe(false)
    expect(isScreeningResult({ verdict: 'ok', screenedAt: '2026-09-15T00:00:00.000Z' })).toBe(true)
  })
})

describe('hashSubmissionBody', () => {
  const pairs = (entries: Record<string, string>) =>
    Object.entries(entries).map(([field, value]) => ({ field, value }))

  it('gives two identical bodies the same digest whatever order they arrive in', () => {
    const a = hashSubmissionBody(pairs({ subject: 'Hello', message: 'Same text' }))
    const b = hashSubmissionBody(pairs({ message: 'Same text', subject: 'Hello' }))
    expect(a).not.toBeNull()
    expect(a).toBe(b)
  })

  it('gives two different bodies different digests', () => {
    expect(hashSubmissionBody(pairs({ message: 'One' }))).not.toBe(
      hashSubmissionBody(pairs({ message: 'Two' })),
    )
  })

  /**
   * `name` and `locale` are the same on every submission one person sends, so
   * hashing them would make two unrelated submissions from one visitor read as
   * duplicates of each other.
   */
  it('ignores the keys that repeat across a person’s submissions', () => {
    expect(hashSubmissionBody(pairs({ message: 'Body', name: 'Ada', locale: 'en' }))).toBe(
      hashSubmissionBody(pairs({ message: 'Body', name: 'Grace', locale: 'de' })),
    )
  })

  /**
   * A submission with no prose is not "the same message" as another one.
   * Hashing the empty string would make every such row a duplicate of every
   * other, and refuse a whole class of legitimate submissions.
   */
  it('returns null when there is no body to compare', () => {
    expect(hashSubmissionBody(pairs({ name: 'Ada', locale: 'en' }))).toBeNull()
    expect(hashSubmissionBody(pairs({ message: '   ' }))).toBeNull()
    expect(hashSubmissionBody([])).toBeNull()
    expect(hashSubmissionBody(undefined)).toBeNull()
  })
})

/**
 * A stand-in for the Events config the job hands the scan. `urlField` is called
 * rather than its marker restated, so the fixture cannot claim a marker the
 * factory stopped writing; the int spec runs these assertions over the live
 * config, where the shape this one assumes is checked.
 */
const EVENT_FIELDS = [
  { name: 'title', type: 'text' },
  { name: 'contactEmail', type: 'email' },
  urlField({ name: 'website' }),
  urlField({ name: 'onlineUrl' }),
  { name: 'description', type: 'richText' },
  {
    name: 'address',
    type: 'group',
    flattenedFields: [{ name: 'street', type: 'text' }, urlField({ name: 'directionsUrl' })],
  },
] as unknown as FlattenedField[]

describe('screenProposalContent', () => {
  const screen = (proposed: unknown) => screenProposalContent(proposed, EVENT_FIELDS)

  it('accepts an ordinary proposal', () => {
    expect(screen({ title: 'Thursday class', address: { city: 'Amsterdam' } })).toBeNull()
    expect(screen(null)).toBeNull()
    expect(screen({})).toBeNull()
  })

  /**
   * ⚠ The columns this scan used to bin a legitimate proposal over (#920). Each
   * exists to hold exactly what the URL pattern matches.
   */
  it('accepts a contact address and a real link in the columns that hold them', () => {
    expect(screen({ website: 'https://example.org/classes' })).toBeNull()
    expect(screen({ onlineUrl: 'https://zoom.example.com/j/123' })).toBeNull()
    expect(screen({ address: { directionsUrl: 'https://maps.example.org/x' } })).toBeNull()
    // A dotted local part: #922 stopped an ordinary address tripping the scan,
    // so this is the only `contactEmail` form the exemption still shows up in.
    expect(screen({ contactEmail: 'www.venue@gmail.com' })).toBeNull()
  })

  /** An absent config can only reach the destructive verdict, so it reaches none. */
  it('scans nothing when there is no Events config to read the exemption off', () => {
    expect(screenProposalContent({ title: 'See https://spam.example.test' }, [])).toBeNull()
  })

  /**
   * The gap this closes: `prepareUserSubmission` URL-scans `submissionData`,
   * and `proposed` is a separate column it never sees. So a submitter refused a
   * link in their note could put one in the event's title or description, which
   * is the text a manager reads in the review email.
   */
  it('refuses a link anywhere in the proposed patch, and names where', () => {
    const refusal = screen({
      title: 'Free class',
      description: 'Visit https://spam.example.test for details',
    })
    expect(refusal).not.toBeNull()
    expect(refusal).toContain('description')
  })

  /** An exempt column buys its own path no cover for its neighbours. */
  it('still refuses a link in a free-text field beside an exempt one', () => {
    const refusal = screen({
      website: 'https://example.org',
      title: 'Free class, see https://spam.example.test',
    })
    expect(refusal).toContain('title')
  })

  /**
   * ⚠ The case the flattening walker exists for. `checkNoUrls` tests only
   * top-level string values, so handing it `proposed` raw returns `ok` here —
   * a different verdict on the same input. A proposal is an Events field patch,
   * and Events nests (`address`, `schedule`).
   */
  it('finds a link nested inside a group, and names the nested path', () => {
    // A bare domain on one of the TLDs the scan recognises — `.test` is
    // deliberately not one of them, so a spec using it would pass vacuously.
    const refusal = screen({ address: { street: 'see buy-now.example.com' } })
    expect(refusal).not.toBeNull()
    expect(refusal).toContain('address.street')
  })

  /**
   * Public input with no depth bound is a stack overflow waiting for somebody
   * to post a deeply nested object. Reaching the bound must return an answer,
   * not throw.
   */
  it('survives a pathologically nested patch', () => {
    let deep: Record<string, unknown> = { title: 'bottom' }
    for (let i = 0; i < 400; i += 1) deep = { nested: deep }
    expect(() => screen(deep)).not.toThrow()
  })
})
