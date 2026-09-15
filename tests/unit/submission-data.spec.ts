import { describe, expect, it } from 'vitest'

import {
  allowedSubmissionKeys,
  checkSubmissionData,
  DEFAULT_MAX_VALUE_LENGTH,
  MAX_SUBMISSION_DATA_ENTRIES,
  MAX_SUBMISSION_DATA_KEY_LENGTH,
  readSubmissionValue,
  urlScannablePairs,
  VALUE_MAX_LENGTHS,
} from '@/collections/UserSubmissions/submissionData'

/**
 * `submissionData` is the one part of a submission a public caller writes as a
 * single blob, so field-level access protects nothing inside it and this check
 * is the whole bound. It is pure on purpose — the matrix costs nothing to
 * assert here, and would cost a Payload boot per case anywhere else.
 */
describe('allowedSubmissionKeys', () => {
  it('gives every type the shared context keys', () => {
    for (const type of ['contact', 'subscribe', 'registration', 'proposal'] as const) {
      const allowed = allowedSubmissionKeys(type)
      expect(allowed.has('name'), `${type} should accept name`).toBe(true)
      expect(allowed.has('hostUrl'), `${type} should accept hostUrl`).toBe(true)
    }
  })

  it('keeps each type to its own keys', () => {
    // The point of the per-type split: a registration answer is not a thing a
    // contact form can smuggle in, and vice versa.
    expect(allowedSubmissionKeys('contact').has('message')).toBe(true)
    expect(allowedSubmissionKeys('registration').has('message')).toBe(false)

    expect(allowedSubmissionKeys('registration').has('experience')).toBe(true)
    expect(allowedSubmissionKeys('contact').has('experience')).toBe(false)

    expect(allowedSubmissionKeys('proposal').has('note')).toBe(true)
    expect(allowedSubmissionKeys('subscribe').has('note')).toBe(false)
  })

  it("adds the form's own authored fields", () => {
    // A form author names their fields, so no fixed list can know them — this
    // is why the hook reads the live `forms` document.
    const allowed = allowedSubmissionKeys('contact', ['howDidYouHear'])
    expect(allowed.has('howDidYouHear')).toBe(true)
    expect(allowedSubmissionKeys('contact').has('howDidYouHear')).toBe(false)
  })
})

describe('checkSubmissionData', () => {
  const allowed = allowedSubmissionKeys('contact', ['howDidYouHear'])

  it('accepts a well-formed blob', () => {
    expect(
      checkSubmissionData(
        [
          { field: 'message', value: 'Hello there, this is a real question.' },
          { field: 'howDidYouHear', value: 'A friend' },
        ],
        allowed,
      ),
    ).toEqual([])
  })

  it('accepts an absent blob', () => {
    expect(checkSubmissionData(undefined, allowed)).toEqual([])
    expect(checkSubmissionData(null, allowed)).toEqual([])
  })

  it('names the offending key on an unknown field', () => {
    // Naming it is the requirement, not merely refusing: a 400 that says only
    // "invalid submission data" tells an integrator nothing they can act on.
    const problems = checkSubmissionData([{ field: 'isAdmin', value: 'true' }], allowed)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('isAdmin')
  })

  it('refuses a blob that is not a list', () => {
    expect(checkSubmissionData({ message: 'hi' }, allowed)).toHaveLength(1)
  })

  it('refuses an entry with no field name', () => {
    expect(checkSubmissionData([{ value: 'orphan' }], allowed)).toHaveLength(1)
    expect(checkSubmissionData([{ field: '', value: 'orphan' }], allowed)).toHaveLength(1)
  })

  it('refuses a repeated key', () => {
    // A duplicate silently overwrites downstream, so it is malformed rather
    // than harmless.
    const problems = checkSubmissionData(
      [
        { field: 'message', value: 'first' },
        { field: 'message', value: 'second' },
      ],
      allowed,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('more than once')
  })

  it('refuses a non-string value', () => {
    const problems = checkSubmissionData([{ field: 'message', value: { nested: true } }], allowed)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('message')
  })

  it('refuses an over-long key', () => {
    const problems = checkSubmissionData(
      [{ field: 'x'.repeat(MAX_SUBMISSION_DATA_KEY_LENGTH + 1), value: 'hi' }],
      allowed,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('not a valid field name')
  })

  it('does not throw on a type outside the union', () => {
    // `allowedSubmissionKeys` spreads `TYPE_SUBMISSION_KEYS[type]`, so an
    // unrecognised key spreads `undefined` and throws a TypeError — which the
    // hook would surface as a 500 rather than a 400. `prepareUserSubmission`
    // checks the value before it gets here; this pins that the hazard is real
    // so nobody removes that check as redundant.
    expect(() => allowedSubmissionKeys('bogus' as never)).toThrow()
  })

  it('bounds the number of entries', () => {
    const entries = Array.from({ length: MAX_SUBMISSION_DATA_ENTRIES + 1 }, (_, i) => ({
      field: 'name',
      value: `x${i}`,
    }))
    const problems = checkSubmissionData(entries, allowed)
    // Exactly one, not one per row: the caller joins every problem into one
    // response, so a huge array must not produce a huge message.
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('at most')
  })

  it('bounds a value at the key-specific length', () => {
    // `message` carries prose, so it gets the wider bound the collection it
    // replaces enforced. An authored field gets the default one.
    expect(
      checkSubmissionData(
        [{ field: 'message', value: 'x'.repeat(VALUE_MAX_LENGTHS.message!) }],
        allowed,
      ),
    ).toEqual([])
    expect(
      checkSubmissionData(
        [{ field: 'message', value: 'x'.repeat(VALUE_MAX_LENGTHS.message! + 1) }],
        allowed,
      ),
    ).toHaveLength(1)

    expect(
      checkSubmissionData(
        [{ field: 'howDidYouHear', value: 'x'.repeat(DEFAULT_MAX_VALUE_LENGTH + 1) }],
        allowed,
      ),
    ).toHaveLength(1)
  })
})

describe('urlScannablePairs', () => {
  it('exempts the crash-report context, and nothing else', () => {
    // The exemption `user-messages` got by not scanning its `context` column at
    // all. A bug report legitimately names the page it happened on, so scanning
    // `error` or `hostUrl` would refuse every real one — while the message body
    // beside them still has to be scanned.
    const pairs = urlScannablePairs([
      { field: 'error', value: 'TypeError at https://example.com/events' },
      { field: 'hostUrl', value: 'https://example.com' },
      { field: 'path', value: '/events/london' },
      { field: 'userAgent', value: 'Mozilla/5.0' },
      { field: 'locale', value: 'en' },
      { field: 'message', value: 'Visit https://spam.example' },
    ])

    expect(Object.keys(pairs)).toEqual(['message'])
    expect(pairs.message).toContain('spam.example')
  })

  it('skips non-string values rather than coercing them', () => {
    expect(urlScannablePairs([{ field: 'message', value: 42 }])).toEqual({})
  })

  it('returns nothing for a non-list', () => {
    expect(urlScannablePairs('nope')).toEqual({})
  })
})

describe('readSubmissionValue', () => {
  it('reads a pair by key, and only a string one', () => {
    const entries = [
      { field: 'name', value: 'Ada' },
      { field: 'message', value: 12 },
    ]
    expect(readSubmissionValue(entries, 'name')).toBe('Ada')
    expect(readSubmissionValue(entries, 'message')).toBeUndefined()
    expect(readSubmissionValue(entries, 'absent')).toBeUndefined()
  })
})
