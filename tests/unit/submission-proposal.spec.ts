import type { FlattenedField } from 'payload'

import { describe, expect, it } from 'vitest'

import { proposableEventFields } from '@/collections/EventSubmissions/hooks/validateProposal'
import {
  mergeProposal,
  NEW_EVENT_DEFAULTS,
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
  { name: 'verificationStage', type: 'select', admin: { readOnly: true } },
  { name: 'manager', type: 'relationship' },
  { name: 'region', type: 'relationship' },
  {
    name: 'schedule',
    type: 'group',
    flattenedFields: [{ name: 'firstDate', type: 'date', label: 'First Date & Time' }],
  },
] as unknown as FlattenedField[]

describe('mergeProposal', () => {
  it('lays the proposal over the target, field by field', () => {
    const target = { title: 'Morning Meditation', contactPhone: '+44 700' } as Partial<Event>
    const merged = mergeProposal({ proposed: { contactPhone: '+44 900' }, target })
    expect(merged).toEqual({ title: 'Morning Meditation', contactPhone: '+44 900' })
  })

  it('replaces a group wholesale rather than merging into it', () => {
    // A proposed schedule is a proposed schedule — half of the submitter's and
    // half of the manager's would be a hybrid neither asked for.
    const target = { schedule: { firstDate: 'A', endTime: '20:00' } } as unknown as Partial<Event>
    const merged = mergeProposal({ proposed: { schedule: { firstDate: 'B' } }, target })
    expect(merged.schedule).toEqual({ firstDate: 'B' })
  })

  it('starts a new-event submission from the accept-time defaults', () => {
    const merged = mergeProposal({ proposed: { contactPhone: '+1 555' } })
    expect(merged).toMatchObject({ ...NEW_EVENT_DEFAULTS, contactPhone: '+1 555' })
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
