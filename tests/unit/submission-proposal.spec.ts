import type { FlattenedField } from 'payload'

import { describe, expect, it } from 'vitest'

import { proposableEventFields } from '@/collections/EventSubmissions/hooks/validateProposal'
import {
  mergeProposal,
  newEventDefaults,
} from '@/collections/EventSubmissions/lifecycle/mergeProposal'
import {
  buildProposedChanges,
  formatValue,
  labelForPath,
} from '@/collections/EventSubmissions/lifecycle/proposedChanges'
import type { Event } from '@/payload-types'

/**
 * The three pure pieces the review view is built from. Together they are the
 * whole contract a reviewer relies on: what the event would become, what
 * changed about it, and what a submitter is allowed to propose in the first
 * place.
 */

/** A stand-in for the Events config the hooks read at runtime. */
const EVENT_FIELDS = [
  { name: 'contactPhone', type: 'text', label: 'Contact Phone Number' },
  { name: 'onlineUrl', type: 'text', label: 'Online URL' },
  { name: 'description', type: 'richText' },
  {
    name: 'address',
    type: 'group',
    flattenedFields: [{ name: 'venueName', type: 'text', label: 'Venue Name' }],
  },
  { name: 'verificationStage', type: 'select', admin: { readOnly: true } },
  { name: 'manager', type: 'relationship' },
  { name: 'region', type: 'relationship' },
  {
    name: 'schedule',
    type: 'group',
    flattenedFields: [
      { name: 'firstDate', type: 'date', label: 'First Date & Time' },
      { name: 'endTime', type: 'text', label: 'End Time' },
      { name: 'recurrenceType', type: 'select', label: 'Repeats' },
    ],
  },
] as unknown as FlattenedField[]

describe('mergeProposal', () => {
  it('lays the proposal over the target, field by field', () => {
    const target = { title: 'Morning Meditation', contactPhone: '+44 700' } as Partial<Event>
    const merged = mergeProposal({ proposed: { contactPhone: '+44 900' }, target })
    expect(merged).toEqual({ title: 'Morning Meditation', contactPhone: '+44 900' })
  })

  it('merges into a group the way Payload does, keeping untouched sub-fields', () => {
    // Verified against the running API: `payload.update` with a partial group
    // changes the named sub-field and leaves its siblings alone. The diff and
    // the preview must say the same, or they misrepresent what Accept writes.
    const target = { schedule: { firstDate: 'A', endTime: '20:00' } } as unknown as Partial<Event>
    const merged = mergeProposal({ proposed: { schedule: { firstDate: 'B' } }, target })
    expect(merged.schedule).toEqual({ firstDate: 'B', endTime: '20:00' })
  })

  it('replaces arrays and honours an explicit null', () => {
    // Payload replaces arrays rather than appending, and a null in a patch is
    // how a value gets cleared.
    const target = {
      languages: ['en', 'cs'],
      website: 'https://a.test',
    } as unknown as Partial<Event>
    const merged = mergeProposal({ proposed: { languages: ['de'], website: null }, target })
    expect(merged.languages).toEqual(['de'])
    expect(merged.website).toBeNull()
  })

  it('starts a new-event submission from the accept-time defaults', () => {
    const proposed = { contactPhone: '+1 555' }
    const merged = mergeProposal({ proposed })
    expect(merged).toMatchObject({ ...newEventDefaults(proposed), contactPhone: '+1 555' })
  })

  it('shows a schedule-less proposal as the dormant listing it would create', () => {
    // `inactive` is derived from the patch by `applyReview`. As a constant it
    // was invisible here, so a reviewer accepted a complete-looking diff and
    // got an event that never appears on the map.
    expect(mergeProposal({ proposed: { contactPhone: '+1 555' } }).inactive).toBe(true)
    expect(
      mergeProposal({ proposed: { schedule: { firstDate: '2026-09-01T00:00:00.000Z' } } }).inactive,
    ).toBe(false)
  })

  it('replaces rich text wholesale rather than merging two node trees', () => {
    const target = {
      description: { root: { type: 'root', direction: 'ltr', children: [{ text: 'old' }] } },
    } as unknown as Partial<Event>
    const merged = mergeProposal({
      proposed: { description: { root: { type: 'root', children: [{ text: 'new' }] } } },
      target,
    })
    // No `direction` grafted on from the target's root.
    expect(merged.description).toEqual({
      root: { type: 'root', children: [{ text: 'new' }] },
    })
  })

  it('is a no-op for an absent proposal', () => {
    const target = { title: 'Unchanged' } as Partial<Event>
    expect(mergeProposal({ proposed: null, target })).toEqual({ title: 'Unchanged' })
  })
})

describe('formatValue', () => {
  it('renders rich text as the words a reader would see', () => {
    const lexical = {
      root: {
        children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hello there' }] }],
      },
    }
    expect(formatValue(lexical)).toBe('Hello there')
  })

  it('names a populated relationship instead of printing its row', () => {
    expect(formatValue({ id: 7, title: 'Bay Area' })).toBe('Bay Area')
    expect(formatValue({ id: 7 })).toBe('#7')
  })

  it('treats blank, null and empty-array alike as no value', () => {
    expect(formatValue(null)).toBeNull()
    expect(formatValue('')).toBeNull()
    expect(formatValue([])).toBeNull()
  })

  it('renders booleans and lists readably', () => {
    expect(formatValue(true)).toBe('Yes')
    expect(formatValue(['en', 'cs'])).toBe('en, cs')
  })
})

describe('labelForPath', () => {
  it('uses the Events config wording, not the field name', () => {
    expect(labelForPath(['onlineUrl'], EVENT_FIELDS)).toBe('Online URL')
  })

  it('walks into a group', () => {
    expect(labelForPath(['schedule', 'firstDate'], EVENT_FIELDS)).toBe(
      'Schedule › First Date & Time',
    )
  })

  it('falls back to words when a field has no label of its own', () => {
    expect(labelForPath(['description'], EVENT_FIELDS)).toBe('Description')
  })

  it('numbers array rows', () => {
    expect(labelForPath(['images', 0], EVENT_FIELDS)).toBe('Images › #1')
  })
})

describe('buildProposedChanges', () => {
  it('reports only what changed, labelled and formatted', () => {
    const changes = buildProposedChanges({
      before: { contactPhone: '+44 700', onlineUrl: 'https://a.test' },
      after: { contactPhone: '+44 900', onlineUrl: 'https://a.test' },
      fields: EVENT_FIELDS,
    })
    expect(changes).toEqual([
      {
        path: 'contactPhone',
        label: 'Contact Phone Number',
        kind: 'changed',
        before: '+44 700',
        after: '+44 900',
      },
    ])
  })

  it('marks a field the target never had as an addition', () => {
    const changes = buildProposedChanges({
      before: {},
      after: { contactPhone: '+1 555' },
      fields: EVENT_FIELDS,
    })
    expect(changes).toMatchObject([{ kind: 'added', before: null, after: '+1 555' }])
  })

  it('drops bookkeeping a reviewer cannot act on', () => {
    const changes = buildProposedChanges({
      before: { updatedAt: 'then', id: 1 },
      after: { updatedAt: 'now', id: 1 },
      fields: EVENT_FIELDS,
    })
    expect(changes).toEqual([])
  })

  it('hides a difference that formatting collapses to nothing visible', () => {
    // `null` → `''` is a real diff to microdiff and no change at all to a
    // reader; showing it would claim something changed when nothing did.
    const changes = buildProposedChanges({
      before: { contactPhone: null },
      after: { contactPhone: '' },
      fields: EVENT_FIELDS,
    })
    expect(changes).toEqual([])
  })
})

describe('word-level segments', () => {
  const LONG_BEFORE =
    'Free weekly meditation. We meet in the main hall — enter via the front door on Mainzer Landstrasse.'
  const LONG_AFTER =
    'Free weekly meditation. We now meet in the annexe building — enter via the side door on Hanauer Landstrasse.'

  it('highlights only the edited words in a long value', () => {
    const [change] = buildProposedChanges({
      before: { description: LONG_BEFORE },
      after: { description: LONG_AFTER },
      fields: EVENT_FIELDS,
    })
    const segments = change.segments ?? []
    expect(segments.length).toBeGreaterThan(1)
    // The unchanged opening survives as one run rather than being shredded
    // into characters, which is why this uses a word differ and not a
    // character one.
    expect(segments[0]).toMatchObject({ kind: 'same' })
    expect(segments[0]?.text).toContain('Free weekly meditation.')
    expect(segments.filter((s) => s.kind === 'removed').map((s) => s.text)).toContain('main hall')
    expect(segments.filter((s) => s.kind === 'added').map((s) => s.text)).toContain(
      'annexe building',
    )
    // Reassembling the non-removed runs reproduces the proposed text exactly.
    expect(
      segments
        .filter((s) => s.kind !== 'removed')
        .map((s) => s.text)
        .join(''),
    ).toBe(LONG_AFTER)
  })

  it('leaves short values as a plain two-line diff', () => {
    // A phone number is quicker to compare whole than word by word.
    const [change] = buildProposedChanges({
      before: { contactPhone: '017631587871' },
      after: { contactPhone: '+49 176 3158 9999' },
      fields: EVENT_FIELDS,
    })
    expect(change.segments).toBeUndefined()
  })
})

describe('group blocks', () => {
  it('renders keys in the collection order, not the object order', () => {
    // A proposal's patch and a stored event enumerate their keys differently,
    // so insertion order put the same group's lines in one order on a new
    // submission and another on an update — and the diff called the reshuffle
    // a change.
    const scrambled = {
      schedule: { recurrenceType: 'WEEKLY', endTime: '20:00', firstDate: '2026-09-03T16:30:00.000Z' },
    }
    const [change] = buildProposedChanges({ before: {}, after: scrambled, fields: EVENT_FIELDS })
    const keys = (change.after ?? '').split('\n').map((line) => line.split(':')[0])
    expect(keys).toEqual(['First Date & Time', 'End Time', 'Repeats'])
  })

  it('formats a date so the diff lands on parts a human reads', () => {
    const [change] = buildProposedChanges({
      before: { schedule: { firstDate: '2026-07-18T16:00:00.000Z' } },
      after: { schedule: { firstDate: '2026-09-03T16:30:00.000Z' } },
      fields: EVENT_FIELDS,
    })
    expect(change.before).toContain('18 Jul 2026, 16:00 UTC')
    expect(change.after).toContain('3 Sept 2026, 16:30 UTC')
    // Not `2026-«-07»«+09»-«-18T16»` — whole date parts, not digits.
    expect(change.segments?.some((segment) => segment.text.includes('Jul'))).toBe(true)
  })

  it('segments a wholly-new group too, so its keys can be emphasised', () => {
    const [change] = buildProposedChanges({
      before: {},
      after: { address: { venueName: 'Riverside Hall' } },
      fields: EVENT_FIELDS,
    })
    expect(change.kind).toBe('added')
    expect(change.block).toBe(true)
    expect(change.segments).toEqual([
      { text: 'Venue Name: Riverside Hall', kind: 'added' },
    ])
  })
})

describe('proposableEventFields', () => {
  it('allows ordinary editable event fields', () => {
    const allowed = proposableEventFields(EVENT_FIELDS)
    expect(allowed.has('contactPhone')).toBe(true)
    expect(allowed.has('schedule')).toBe(true)
  })

  it('refuses system-managed and privileged fields', () => {
    const allowed = proposableEventFields(EVENT_FIELDS)
    // Derived from the config: Events declares this read-only.
    expect(allowed.has('verificationStage')).toBe(false)
    // Editable by a manager, but never proposable by an anonymous submitter —
    // together these would mint a verified, adopted listing.
    expect(allowed.has('manager')).toBe(false)
    // Owned by screening, and a column on the submission itself.
    expect(allowed.has('region')).toBe(false)
  })
})
