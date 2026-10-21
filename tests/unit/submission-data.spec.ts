import { describe, expect, it } from 'vitest'

import type { AuthoredBlock } from '@/collections/UserSubmissions/submissionData'
import {
  authoredBlocks,
  checkSubmissionData,
  DEFAULT_MAX_VALUE_LENGTH,
  MAX_SUBMISSION_DATA_ENTRIES,
  MAX_SUBMISSION_DATA_KEY_LENGTH,
  readSubmissionValue,
  VALUE_MAX_LENGTHS,
} from '@/collections/UserSubmissions/submissionData'
import type { Form } from '@/payload-types'

/**
 * `submissionData` is the one part of a submission a public caller writes as a
 * single blob, so field-level access protects nothing inside it and this schema
 * is the whole bound. It is pure on purpose — the matrix costs nothing to
 * assert here, and would cost a Payload boot per case anywhere else.
 */

/** An authored block, as the live `forms` document carries it. */
const block = (name: string, blockType: 'text' | 'textarea' | 'email') =>
  ({ name, blockType, label: name, required: false }) as AuthoredBlock

const messages = (problems: ReturnType<typeof checkSubmissionData>) =>
  problems.map((problem) => problem.message)

const contact = { type: 'contact' as const, formFields: [block('howDidYouHear', 'text')] }

describe('submissionDataSchema keys', () => {
  it('gives every type the shared context keys', () => {
    for (const type of ['contact', 'subscribe', 'registration', 'proposal'] as const) {
      expect(messages(checkSubmissionData([{ field: 'name', value: 'Ada' }], { type }))).toEqual([])
      expect(
        messages(checkSubmissionData([{ field: 'hostUrl', value: 'https://x.com' }], { type })),
      ).toEqual([])
    }
  })

  it('keeps each type to its own keys', () => {
    // The point of the per-type split: a registration answer is not a thing a
    // contact form can smuggle in, and vice versa.
    const accepts = (type: 'contact' | 'subscribe' | 'registration' | 'proposal', field: string) =>
      checkSubmissionData([{ field, value: 'x' }], { type }).length === 0

    expect(accepts('contact', 'message')).toBe(true)
    expect(accepts('registration', 'message')).toBe(false)

    expect(accepts('registration', 'experience')).toBe(true)
    expect(accepts('contact', 'experience')).toBe(false)

    expect(accepts('proposal', 'note')).toBe(true)
    expect(accepts('subscribe', 'note')).toBe(false)
  })

  it("adds the form's own authored fields", () => {
    // A form author names their fields, so no fixed list can know them — this
    // is why the hook reads the live `forms` document.
    expect(
      messages(checkSubmissionData([{ field: 'howDidYouHear', value: 'A friend' }], contact)),
    ).toEqual([])
    expect(
      checkSubmissionData([{ field: 'howDidYouHear', value: 'A friend' }], { type: 'contact' }),
    ).toHaveLength(1)
  })

  it('reads the authored blocks off a form, names and types together', () => {
    const form = {
      fields: [block('email', 'email'), block('message', 'textarea'), { blockType: 'message' }],
    } as unknown as Form

    expect(authoredBlocks(form).map((field) => [field.name, field.blockType])).toEqual([
      ['email', 'email'],
      ['message', 'textarea'],
    ])
    expect(authoredBlocks(null)).toEqual([])
  })
})

describe('checkSubmissionData', () => {
  it('accepts a well-formed blob', () => {
    expect(
      messages(
        checkSubmissionData(
          [
            { field: 'message', value: 'Hello there, this is a real question.' },
            { field: 'howDidYouHear', value: 'A friend' },
          ],
          contact,
        ),
      ),
    ).toEqual([])
  })

  it('accepts an absent blob', () => {
    expect(checkSubmissionData(undefined, contact)).toEqual([])
    expect(checkSubmissionData(null, contact)).toEqual([])
  })

  it('names the offending key on an unknown field', () => {
    // Naming it is the requirement, not merely refusing: a 400 that says only
    // "invalid submission data" tells an integrator nothing they can act on.
    const problems = checkSubmissionData([{ field: 'isAdmin', value: 'true' }], contact)
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toContain('isAdmin')
    expect(problems[0]!.code).toBe('submission_data_invalid')
  })

  it('refuses a blob that is not a list', () => {
    expect(checkSubmissionData({ message: 'hi' }, contact)).toHaveLength(1)
  })

  it('refuses an entry with no field name', () => {
    expect(checkSubmissionData([{ value: 'orphan' }], contact)).toHaveLength(1)
    expect(checkSubmissionData([{ field: '', value: 'orphan' }], contact)).toHaveLength(1)
  })

  it('refuses a repeated key', () => {
    // A duplicate silently overwrites downstream, so it is malformed rather
    // than harmless.
    const problems = checkSubmissionData(
      [
        { field: 'message', value: 'first' },
        { field: 'message', value: 'second' },
      ],
      contact,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toContain('more than once')
  })

  it('refuses a non-string value', () => {
    const problems = checkSubmissionData([{ field: 'message', value: { nested: true } }], contact)
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toBe('`message` must be text.')
  })

  it('refuses an over-long key', () => {
    const problems = checkSubmissionData(
      [{ field: 'x'.repeat(MAX_SUBMISSION_DATA_KEY_LENGTH + 1), value: 'hi' }],
      contact,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toContain('not a valid field name')
  })

  it('does not throw on a type outside the union', () => {
    // The schema spreads `TYPE_SUBMISSION_KEYS[type]`, so an unrecognised key
    // spreads `undefined` and throws a TypeError — which the hook would
    // surface as a 500 rather than a 400. `prepareUserSubmission` checks the
    // value before it gets here; this pins that the hazard is real so nobody
    // removes that check as redundant.
    expect(() => checkSubmissionData([], { type: 'bogus' as never })).toThrow()
  })

  it('bounds the number of entries', () => {
    const entries = Array.from({ length: MAX_SUBMISSION_DATA_ENTRIES + 1 }, (_, i) => ({
      field: 'name',
      value: `x${i}`,
    }))
    const problems = checkSubmissionData(entries, contact)
    // Exactly one, not one per row: the caller joins every problem into one
    // response, so a huge array must not produce a huge message.
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toContain('at most')
  })

  it('bounds a value at the key-specific length', () => {
    // `message` carries prose, so it gets the wider bound the collection it
    // replaces enforced. An authored field gets the default one.
    expect(
      checkSubmissionData(
        [{ field: 'message', value: 'x'.repeat(VALUE_MAX_LENGTHS.message!) }],
        contact,
      ),
    ).toEqual([])
    // The wording is pinned because one `error` option on the string schema
    // would answer "must be text" for a length failure too.
    const long = checkSubmissionData(
      [{ field: 'message', value: 'x'.repeat(VALUE_MAX_LENGTHS.message! + 1) }],
      contact,
    )
    expect(long).toHaveLength(1)
    expect(long[0]!.message).toBe(
      `\`message\` is longer than the ${VALUE_MAX_LENGTHS.message} characters allowed.`,
    )

    expect(
      checkSubmissionData(
        [{ field: 'howDidYouHear', value: 'x'.repeat(DEFAULT_MAX_VALUE_LENGTH + 1) }],
        contact,
      ),
    ).toHaveLength(1)
  })

  it('reports every shape problem at once', () => {
    // The hook joins them into one response, so a caller fixes a malformed
    // blob's keys in one round rather than one 400 per key.
    expect(
      checkSubmissionData(
        [
          { field: 'isAdmin', value: 'true' },
          { field: 'alsoNot', value: 'x' },
        ],
        contact,
      ),
    ).toHaveLength(2)
  })
})

describe('checkSubmissionData content checks', () => {
  const withEmail = {
    type: 'contact' as const,
    formFields: [block('contactAddress', 'email'), block('howDidYouHear', 'text')],
    checkContent: true,
  }

  it('scans an answer for links, and names the key that carried one', () => {
    const problems = checkSubmissionData(
      [{ field: 'message', value: 'Visit https://spam.example' }],
      { ...withEmail },
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]!.code).toBe('urls_not_allowed')
    expect(problems[0]!.field).toBe('message')
  })

  it('exempts the crash-report context, and nothing else', () => {
    // The exemption `user-messages` got by not scanning its `context` column at
    // all. A bug report legitimately names the page it happened on, so scanning
    // `error` or `hostUrl` would refuse every real one — while the message body
    // beside them still has to be scanned.
    expect(
      checkSubmissionData(
        [
          { field: 'error', value: 'TypeError at https://example.com/events' },
          { field: 'hostUrl', value: 'https://example.com' },
          { field: 'path', value: '/events/london' },
          { field: 'userAgent', value: 'Mozilla/5.0' },
          { field: 'locale', value: 'en' },
        ],
        withEmail,
      ),
    ).toEqual([])
  })

  it('judges an email block as an address, whatever the operator named it', () => {
    // `gmail.com` satisfies `URL_PATTERN`'s bare-domain arm, so the link scan
    // refused most real addresses (#899). Keyed on the block type, so renaming
    // the question does not change how its answer is judged.
    expect(
      checkSubmissionData([{ field: 'contactAddress', value: 'visitor@gmail.com' }], withEmail),
    ).toEqual([])

    const problems = checkSubmissionData(
      [{ field: 'contactAddress', value: 'see example.com' }],
      withEmail,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]!.code).toBe('invalid_email')
    expect(problems[0]!.field).toBe('contactAddress')
  })

  it('judges a disposable address too — the half the write guard never saw', () => {
    // The guard's policy names `senderEmail` and `proposed.contactEmail`, so an
    // address a caller sends only as a pair had no disposable-domain check.
    const problems = checkSubmissionData(
      [{ field: 'contactAddress', value: 'visitor@mailinator.com' }],
      withEmail,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]!.code).toBe('disposable_email')
  })

  it('leaves a blank answer to an optional address question alone', () => {
    expect(checkSubmissionData([{ field: 'contactAddress', value: '  ' }], withEmail)).toEqual([])
  })

  it('still URL-scans an answer authored as a text block', () => {
    // Deliberate: `text`/`textarea` is where the message body lives, so
    // exempting it would disable the scan. The same input the `email` block
    // judges as `invalid_email` above, so the pair is one contrast keyed on
    // block type — an address can no longer carry it, since #922 stopped the
    // URL pattern reading the domain half of one as a link anywhere.
    const problems = checkSubmissionData(
      [{ field: 'howDidYouHear', value: 'see example.com' }],
      withEmail,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]!.code).toBe('urls_not_allowed')
    expect(problems[0]!.field).toBe('howDidYouHear')
  })

  it('runs no content check for a manager write', () => {
    // Nothing a manager writes is screened: a triage note may hold a link.
    expect(
      checkSubmissionData(
        [
          { field: 'message', value: 'Visit https://spam.example' },
          { field: 'contactAddress', value: 'not-an-address' },
        ],
        { ...withEmail, checkContent: false },
      ),
    ).toEqual([])
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
