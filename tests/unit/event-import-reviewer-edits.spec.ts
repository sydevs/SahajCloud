/**
 * What a reviewer may change about a batch waiting for them
 * (`EventImports/hooks/reviewerEdits.ts`).
 *
 * ⚠ **Every refusal here is a write refusal, not a form message.** The uploader
 * holds document-level `update`, so an accepted delta is what a `PATCH` can do
 * to the rows the commit job then trusts — `rows[].committed.eventId` claims a
 * class's exactly-once key, and a node's `lines` decide which region a class is
 * filed under.
 *
 * Each permitted-edit case was checked by making the edit illegal and watching
 * the case go red, and each refusal by permitting the field and watching it pass
 * — a guard spec that only ever asserts "null" passes against a guard that
 * returns null unconditionally.
 */

import { describe, expect, it } from 'vitest'

import {
  refuseRowEdits,
  refuseTreeEdits,
} from '@/collections/EventImports/hooks/reviewerEdits'
import type { EventImportProposedRegions, EventImportRows } from '@/payload-types'

type ImportRow = EventImportRows[number]
type ProposedNode = EventImportProposedRegions['nodes'][number]

const resolved: NonNullable<ImportRow['resolved']> = {
  latitude: 52.5,
  longitude: 13.4,
  timezone: 'Europe/Berlin',
  cityKey: 'berlin',
  placeName: 'Berlin',
  placeId: 'dXJuOm1ieHBsYzpiZXJsaW4',
  mapboxId: 'dXJuOm1ieHBsYzpoYWxs',
  subdivisionCode: 'DE-BE',
  weekdayMask: 0b10,
  startMinutes: 1110,
  languages: ['de'],
  inactive: false,
  anchorDate: '2026-01-05',
}

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return { line: 2, values: { title: 'Tuesday Evening' }, resolved, ...overrides }
}

function node(overrides: Partial<ProposedNode> = {}): ProposedNode {
  return {
    key: 'city:berlin',
    level: 'city',
    name: 'Berlin',
    parentKey: null,
    match: { kind: 'create' },
    slug: 'berlin',
    location: { kind: 'mapbox', mapboxId: 'dXJuOm1ieHBsYzpiZXJsaW4' },
    lines: [2],
    ...overrides
  }
}

function tree(nodes: ProposedNode[]): EventImportProposedRegions {
  return {
    nodes,
    rowErrors: [{ line: 9, message: 'This address is not in Berlin.' }],
    stateLayer: { proposed: false, reason: 'one subdivision' },
  }
}

/** A deep copy, so a case cannot assert against the very object it mutated. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('refuseRowEdits', () => {
  it('accepts an unchanged set of rows', () => {
    const stored = [row(), row({ line: 3 })]
    expect(refuseRowEdits(stored, copy(stored))).toBeNull()
  })

  it('accepts a duplicate decision on a matched row', () => {
    const stored = [row({ duplicate: { reason: 'city-and-time', strength: 'weak', eventId: 7 } })]
    const submitted = copy(stored)
    submitted[0]!.duplicate!.action = 'import'

    expect(refuseRowEdits(stored, submitted)).toBeNull()
  })

  it('accepts clearing a decision back to the default', () => {
    const stored = [
      row({ duplicate: { reason: 'city-and-time', eventId: 7, action: 'import' } }),
    ]
    const submitted = copy(stored)
    delete submitted[0]!.duplicate!.action

    expect(refuseRowEdits(stored, submitted)).toBeNull()
  })

  it('refuses a decision that is neither skip nor import', () => {
    const stored = [row({ duplicate: { reason: 'nearby-address', eventId: 7 } })]
    const submitted = copy(stored)
    // Within the Ajv enum nothing else parses, so the refusal matters for the
    // job that reads it rather than for the column.
    ;(submitted[0]!.duplicate as Record<string, unknown>).action = 'overwrite'

    expect(refuseRowEdits(stored, submitted)).toMatch(/skipped or imported/)
  })

  it('refuses a claimed class, which would take another import’s exactly-once key', () => {
    const stored = [row()]
    const submitted = copy(stored)
    submitted[0]!.committed = { eventId: 4242 }

    expect(refuseRowEdits(stored, submitted)).toMatch(/only the skip-or-import choice/)
  })

  it('refuses a rewritten geocode, which would place a class anywhere', () => {
    const stored = [row()]
    const submitted = copy(stored)
    submitted[0]!.resolved!.latitude = 0

    expect(refuseRowEdits(stored, submitted)).toMatch(/only the skip-or-import choice/)
  })

  it('refuses a cleared error, which would commit a row the parse refused', () => {
    const stored = [row({ errors: ['no event type'] })]
    const submitted = copy(stored)
    delete submitted[0]!.errors

    expect(refuseRowEdits(stored, submitted)).toMatch(/only the skip-or-import choice/)
  })

  it('refuses an added or removed row', () => {
    expect(refuseRowEdits([row()], [row(), row({ line: 3 })])).toMatch(/upload a corrected file/)
    expect(refuseRowEdits([row(), row({ line: 3 })], [row()])).toMatch(/upload a corrected file/)
  })

  it('refuses a renumbered line, which no reordering can explain', () => {
    expect(refuseRowEdits([row()], [row({ line: 99 })])).toMatch(/no line 99/)
  })

  it('matches rows by line, not by position', () => {
    const stored = [row(), row({ line: 3 })]
    const submitted = [copy(stored[1]!), copy(stored[0]!)]

    expect(refuseRowEdits(stored, submitted)).toBeNull()
  })
})

describe('refuseTreeEdits', () => {
  it('accepts an unchanged tree', () => {
    const stored = tree([node()])
    expect(refuseTreeEdits(stored, copy(stored))).toBeNull()
  })

  it('accepts a rename and the re-slug that comes with it', () => {
    const stored = tree([node()])
    const submitted = copy(stored)
    submitted.nodes[0]!.name = 'Berlin Mitte'
    submitted.nodes[0]!.slug = 'berlin-mitte'

    expect(refuseTreeEdits(stored, submitted)).toBeNull()
  })

  it('accepts a map edit, which nulls three fields and records them in `before`', () => {
    const stored = tree([node()])
    const submitted = copy(stored)
    const mapped = submitted.nodes[0]!
    mapped.before = { name: mapped.name, parentKey: mapped.parentKey, location: mapped.location }
    mapped.match = { kind: 'existing', regionId: 12, name: 'Berlin', slug: 'berlin' }
    mapped.parentKey = null
    mapped.slug = null
    mapped.location = null

    expect(refuseTreeEdits(stored, submitted)).toBeNull()
  })

  it('accepts the prune a map edit sets off', () => {
    // A state whose last new child was mapped away is dropped by
    // `prunedOfEmptyStates`, so a node legitimately disappears.
    const state = node({ key: 'region:be', level: 'region', name: 'Berlin State', slug: 'berlin-state' })
    const stored = tree([state, node({ parentKey: state.key })])
    const submitted = copy(stored)
    submitted.nodes = [{ ...submitted.nodes[1]!, parentKey: null }]

    expect(refuseTreeEdits(stored, submitted)).toBeNull()
  })

  it('refuses a node the proposal never made', () => {
    const stored = tree([node()])
    const submitted = copy(stored)
    submitted.nodes.push(node({ key: 'city:invented', name: 'Invented', slug: 'invented' }))

    expect(refuseTreeEdits(stored, submitted)).toMatch(/proposes no region called "Invented"/)
  })

  it('refuses moved lines, which decide the region a class is filed under', () => {
    const stored = tree([node(), node({ key: 'city:munich', name: 'Munich', slug: 'munich', lines: [3] })])
    const submitted = copy(stored)
    submitted.nodes[1]!.lines = [2, 3]

    expect(refuseTreeEdits(stored, submitted)).toMatch(/only renaming it/)
  })

  it('refuses a changed level, which is what an adopted region is checked against', () => {
    const stored = tree([node()])
    const submitted = copy(stored)
    submitted.nodes[0]!.level = 'venue'

    expect(refuseTreeEdits(stored, submitted)).toMatch(/only renaming it/)
  })

  it('refuses clearing the proposal’s own row errors', () => {
    const stored = tree([node()])
    const submitted = copy(stored)
    submitted.rowErrors = []

    expect(refuseTreeEdits(stored, submitted)).toMatch(/rowErrors cannot be edited/)
  })

  it('refuses rewriting the state layer’s verdict', () => {
    const stored = tree([node()])
    const submitted = copy(stored)
    submitted.stateLayer = { proposed: true, states: [], unplacedCityKeys: [] }

    expect(refuseTreeEdits(stored, submitted)).toMatch(/stateLayer cannot be edited/)
  })
})
