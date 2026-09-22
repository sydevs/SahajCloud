/**
 * `buildFormAnswers` — the contact email's body, read from the authored form
 * rather than from the one key delivery used to assume (#832).
 *
 * Pure, so the whole matrix runs without booting Payload. The block shapes here
 * are `Form['fields']` members, checked against `src/payload-types.ts`: a
 * `message` block carries no `name` at all, a `select` carries
 * `options: [{ label, value }]`, and every stored answer is a string, because
 * `checkSubmissionData` refuses a non-string `value`.
 */
import { describe, expect, it } from 'vitest'

import { buildFormAnswers } from '@/jobs/DeliverSubmissions/formAnswers'
import type { Form } from '@/payload-types'

type Fields = NonNullable<Form['fields']>

const pairs = (data: Record<string, string>) =>
  Object.entries(data).map(([field, value]) => ({ field, value }))

describe('buildFormAnswers', () => {
  it('labels each answer by its authored label, in authoring order', () => {
    const fields = [
      { blockType: 'email', name: 'email', label: 'Your email' },
      { blockType: 'textarea', name: 'details', label: 'What went wrong?' },
      { blockType: 'text', name: 'venue', label: 'Which venue?' },
    ] as Fields

    expect(
      buildFormAnswers(
        fields,
        pairs({ venue: 'Berlin Mitte', details: 'The map is wrong.', email: 'a@example.com' }),
      ),
    ).toEqual([
      { label: 'Your email', value: 'a@example.com' },
      { label: 'What went wrong?', value: 'The map is wrong.' },
      { label: 'Which venue?', value: 'Berlin Mitte' },
    ])
  })

  it('falls back to the field name where no label was authored', () => {
    const fields = [
      { blockType: 'textarea', name: 'details' },
      { blockType: 'text', name: 'venue', label: '   ' },
    ] as Fields

    expect(buildFormAnswers(fields, pairs({ details: 'a', venue: 'b' }))).toEqual([
      { label: 'details', value: 'a' },
      { label: 'venue', value: 'b' },
    ])
  })

  it('renders a field named `message` like any other question', () => {
    // The name carries no special meaning any more — that assumption is the
    // defect this module exists for. A textarea called anything delivers, and
    // one called `message` delivers under its own label rather than a heading.
    const fields = [{ blockType: 'textarea', name: 'message', label: 'Your message' }] as Fields

    expect(buildFormAnswers(fields, pairs({ message: 'Hello.' }))).toEqual([
      { label: 'Your message', value: 'Hello.' },
    ])
  })

  it('contributes no row for a static `message` block', () => {
    // It is Lexical prose the author wrote, with no `name`, so no stored pair
    // can match it. Both the nameless filter and the absent-answer check drop
    // it — deleting either leaves this green, which is the point: a form
    // carrying one must not grow an empty row by any route.
    const fields = [
      { blockType: 'message', message: { root: { children: [] } } },
      { blockType: 'textarea', name: 'details', label: 'Details' },
    ] as unknown as Fields

    expect(buildFormAnswers(fields, pairs({ details: 'a' }))).toEqual([
      { label: 'Details', value: 'a' },
    ])
  })

  it("renders a select answer as the chosen option's label", () => {
    const fields = [
      {
        blockType: 'select',
        name: 'topic',
        label: 'Topic',
        options: [
          { label: 'Wrong address', value: 'address' },
          { label: 'Class has moved', value: 'moved' },
        ],
      },
    ] as Fields

    expect(buildFormAnswers(fields, pairs({ topic: 'moved' }))).toEqual([
      { label: 'Topic', value: 'Class has moved' },
    ])
  })

  it('falls back to the raw stored value where no option matches', () => {
    // An option deleted after the answer was stored. The value is still the
    // best account of what the visitor clicked.
    const fields = [
      {
        blockType: 'select',
        name: 'topic',
        label: 'Topic',
        options: [{ label: 'Wrong address', value: 'address' }],
      },
    ] as Fields

    expect(buildFormAnswers(fields, pairs({ topic: 'retired-option' }))).toEqual([
      { label: 'Topic', value: 'retired-option' },
    ])
  })

  it("renders a checkbox's stored string as Yes or No", () => {
    // It arrives as text, never a boolean — `checkSubmissionData` refuses a
    // non-string value — so `formatAnswer`'s boolean branch can never fire.
    const fields = [{ blockType: 'checkbox', name: 'consent', label: 'Contact me' }] as Fields

    expect(buildFormAnswers(fields, pairs({ consent: 'true' }))).toEqual([
      { label: 'Contact me', value: 'Yes' },
    ])
    expect(buildFormAnswers(fields, pairs({ consent: 'false' }))).toEqual([
      { label: 'Contact me', value: 'No' },
    ])
  })

  it('keeps an unticked checkbox as a row', () => {
    // The widget sends `'false'` deliberately: an unticked consent box is an
    // answer, and dropping it would read as never having been asked.
    const fields = [
      { blockType: 'checkbox', name: 'consent', label: 'Contact me' },
      { blockType: 'textarea', name: 'details', label: 'Details' },
    ] as Fields

    expect(buildFormAnswers(fields, pairs({ consent: '0', details: 'a' }))).toEqual([
      { label: 'Contact me', value: 'No' },
      { label: 'Details', value: 'a' },
    ])
  })

  it('drops a blank answer and an absent one', () => {
    const fields = [
      { blockType: 'text', name: 'blank', label: 'Blank' },
      { blockType: 'text', name: 'whitespace', label: 'Whitespace' },
      { blockType: 'text', name: 'absent', label: 'Absent' },
      { blockType: 'text', name: 'kept', label: 'Kept' },
    ] as Fields

    expect(
      buildFormAnswers(fields, pairs({ blank: '', whitespace: '   ', kept: 'yes' })),
    ).toEqual([{ label: 'Kept', value: 'yes' }])
  })

  it('returns nothing for a form with no fields, and for a blob that is not a list', () => {
    expect(buildFormAnswers(null, pairs({ message: 'a' }))).toEqual([])
    expect(buildFormAnswers([], pairs({ message: 'a' }))).toEqual([])
    expect(
      buildFormAnswers([{ blockType: 'textarea', name: 'message' }] as Fields, undefined),
    ).toEqual([])
  })
})
