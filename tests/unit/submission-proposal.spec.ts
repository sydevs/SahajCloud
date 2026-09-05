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
    // The real address group reveals its fields once a Mapbox place is picked.
    flattenedFields: [
      {
        name: 'venueName',
        type: 'text',
        label: 'Venue Name',
        admin: {
          condition: (_data: unknown, sibling: Record<string, unknown>) =>
            Boolean(sibling?.mapboxId),
        },
      },
    ],
  },
  { name: 'verificationStage', type: 'select', admin: { readOnly: true } },
  { name: 'manager', type: 'relationship' },
  { name: 'region', type: 'relationship' },
  { name: 'languages', type: 'select', hasMany: true, options: ['en', 'cs', 'de'] },
  {
    name: 'schedule',
    type: 'group',
    flattenedFields: [
      { name: 'firstDate', type: 'date', label: 'First Date & Time' },
      { name: 'endTime', type: 'text', label: 'End Time' },
      {
        name: 'recurrenceType',
        type: 'select',
        label: 'Repeats',
        options: [
          { label: 'Weekly', value: 'WEEKLY' },
          { label: 'Monthly', value: 'MONTHLY' },
        ],
      },
      // Mirrors the real schedule: the monthly controls stay in the row and
      // keep whatever was last typed into them, hidden by a condition.
      {
        name: 'monthlyMode',
        type: 'select',
        label: 'Monthly Mode',
        options: [{ label: 'By date', value: 'date' }],
        admin: {
          condition: (_data: unknown, sibling: Record<string, unknown>) =>
            sibling?.recurrenceType === 'MONTHLY',
        },
      },
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

  it('creates an unadopted listing unverified, and an adopted one verified', () => {
    // Assigning a manager on the submission is adoption: the created event has
    // someone responsible for it from the first moment, which is exactly the
    // condition Events treats as verified. Without one it goes on the map
    // unverified until somebody takes it on.
    expect(mergeProposal({ proposed: {} })).toMatchObject({
      manager: null,
      verificationStage: 'unverified',
    })
    expect(mergeProposal({ proposed: {}, manager: 7 })).toMatchObject({
      manager: 7,
      verificationStage: 'verified',
    })
  })

  it('ignores an assigned manager when the proposal targets an event', () => {
    // An update proposal inherits its target's manager. Reassigning one is the
    // Event's own business, and the field is hidden for exactly that reason.
    const target = { manager: 3, verificationStage: 'verified' } as unknown as Partial<Event>
    const merged = mergeProposal({ proposed: {}, target, manager: 7 })
    expect(merged.manager).toBe(3)
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
    // reader. Showing it would claim something changed when nothing did.
    const changes = buildProposedChanges({
      before: { contactPhone: null },
      after: { contactPhone: '' },
      fields: EVENT_FIELDS,
    })
    expect(changes).toEqual([])
  })
})

describe('entry order', () => {
  const PATCH = {
    description: 'Free weekly meditation.',
    contactPhone: '+44 700',
    languages: ['en'],
    address: { venueName: 'Riverside Hall' },
  }

  it('lists entries in the order the collection declares them', () => {
    // Not the order microdiff walked the patch, and not blocks-before-scalars:
    // the same event's diff read Languages, Address, Schedule, then the contact
    // row — an order matching neither the form nor anything else a reviewer
    // knows.
    const changes = buildProposedChanges({ before: {}, after: PATCH, fields: EVENT_FIELDS })
    expect(changes.map((change) => change.label)).toEqual([
      'Contact Phone Number',
      'Description',
      'Address',
      'Languages',
    ])
  })

  it('follows the collection when its field order changes', () => {
    // The ordering is read off the live config rather than restated here, so
    // moving a field in Events.ts moves it in the diff. Deliberately a
    // permutation that interleaves a group and a list with the scalars: the
    // unsorted output groups them (blocks first, then scalars in the order
    // microdiff walked the patch), so it cannot pass by coincidence.
    const order = ['address', 'contactPhone', 'languages', 'description']
    const reordered = order.map(
      (name) => EVENT_FIELDS.find((entry) => 'name' in entry && entry.name === name)!,
    )
    const changes = buildProposedChanges({ before: {}, after: PATCH, fields: reordered })
    expect(changes.map((change) => change.label)).toEqual([
      'Address',
      'Contact Phone Number',
      'Languages',
      'Description',
    ])
  })

  it('puts a field the collection does not declare last', () => {
    const changes = buildProposedChanges({
      before: {},
      after: { mysteryField: 'x', contactPhone: '+44 700' },
      fields: EVENT_FIELDS,
    })
    expect(changes.map((change) => change.path)).toEqual(['contactPhone', 'mysteryField'])
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

  it('leaves a wholly-new group as one plain `+` side', () => {
    // It was briefly segmented so the renderer could bold its keys off the
    // segments — which made a pure addition look like a partial edit. The
    // renderer bolds off `block` instead, and this side stays whole.
    const [change] = buildProposedChanges({
      before: {},
      after: { address: { venueName: 'Riverside Hall' } },
      fields: EVENT_FIELDS,
    })
    expect(change).toMatchObject({
      kind: 'added',
      block: true,
      before: null,
      after: 'Venue Name: Riverside Hall',
    })
    expect(change.segments).toBeUndefined()
  })

  it('drops sub-fields the schedule\u2019s own conditions rule out', () => {
    // A weekly schedule still carries whatever was last typed into the monthly
    // controls. Rendering them read as unrelated keys describing state with no
    // effect on the event, so the diff asks `admin.condition` the same question
    // the admin form does.
    const [change] = buildProposedChanges({
      before: {},
      after: { schedule: { recurrenceType: 'WEEKLY', monthlyMode: 'date' } },
      fields: EVENT_FIELDS,
    })
    expect(change.after).toBe('Repeats: Weekly')
  })

  it('shows an unfiltered block rather than an empty one', () => {
    // The address group's conditions mean "do not reveal these until a place is
    // picked", not "these do not apply". Honouring them literally filtered away
    // every line of a hand-typed address and the reviewer saw no address at
    // all — so a block emptied by its own conditions falls back to unfiltered.
    const [change] = buildProposedChanges({
      before: {},
      after: { address: { venueName: 'Riverside Hall' } }, // no mapboxId
      fields: EVENT_FIELDS,
    })
    expect(change.after).toBe('Venue Name: Riverside Hall')
  })

  it('names a select by its option label, not its stored value', () => {
    const [change] = buildProposedChanges({
      before: { schedule: { recurrenceType: 'WEEKLY' } },
      after: { schedule: { recurrenceType: 'MONTHLY' } },
      fields: EVENT_FIELDS,
    })
    expect(change.before).toBe('Repeats: Weekly')
    expect(change.after).toBe('Repeats: Monthly')
  })
})

describe('reference fields', () => {
  it('names a populated relationship instead of expanding its row', () => {
    // A populated relationship is a plain object like any group, so it was
    // block-rendered: a proposed manager came out as their entire row — id,
    // roles, email, every notification preference — instead of one name.
    const [change] = buildProposedChanges({
      before: {},
      after: {
        manager: {
          id: 496,
          name: 'French Test',
          email: 'french@example.com',
          roles: ['meditations-editor'],
        },
      },
      fields: EVENT_FIELDS,
    })
    expect(change).toMatchObject({ label: 'Manager', kind: 'added', after: 'French Test' })
    expect(change.block).toBeUndefined()
  })
})

describe('list fields', () => {
  it('diffs a hasMany list whole rather than by row number', () => {
    // microdiff reports a list per index, so adding one language surfaced as
    // `Languages \u203a #2` \u2014 a row number a reviewer cannot relate to anything.
    const [change] = buildProposedChanges({
      before: { languages: ['en', 'cs'] },
      after: { languages: ['en', 'cs', 'de'] },
      fields: EVENT_FIELDS,
    })
    expect(change).toMatchObject({
      path: 'languages',
      label: 'Languages',
      kind: 'changed',
      before: 'en, cs',
      after: 'en, cs, de',
    })
  })

  it('reports a list cleared to empty as a removal', () => {
    const [change] = buildProposedChanges({
      before: { languages: ['en'] },
      after: { languages: [] },
      fields: EVENT_FIELDS,
    })
    expect(change).toMatchObject({ path: 'languages', kind: 'removed', after: null })
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
