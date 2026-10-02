/**
 * What the review surface shows, and what its commit loop decides (#828, phase
 * 7c-iii-b).
 *
 * Every fixture is typed against the server's own exported shapes — `ProposedNode`,
 * `ReviewRow`, `FinishOutcome`, `CommitTally` — so `pnpm typecheck` is what pins
 * them to the endpoints that answer them, rather than a comment claiming they
 * match. The real configuration checked for this file is
 * `src/collections/EventImports/EventImports.ts`'s `proposedRegions` schema, which
 * is where a node's closed shape is declared.
 */

import { describe, expect, it } from 'vitest'

import type { FinishOutcome } from '@/collections/EventImports/commit/finish'
import type { CommitTally } from '@/collections/EventImports/commit/summary'
import type { ProposedNode, ProposedTree } from '@/collections/EventImports/propose/tree'
import {
  childrenByParent,
  commitDoneNote,
  commitProgressNote,
  commitVerdict,
  coordinatorNote,
  isEditableNode,
  mappableFor,
  mergedNote,
  nodeCountNote,
  nodeMatchNote,
  stateLayerNote,
  treeNote,
  type CommitChunk,
  type MappableRegion,
} from '@/components/admin/RegionImport/reviewModel'

function node(overrides: Partial<ProposedNode> = {}): ProposedNode {
  return {
    key: 'city:id:place.berlin',
    level: 'city',
    name: 'Berlin',
    parentKey: null,
    match: { kind: 'create' },
    slug: 'berlin',
    location: null,
    lines: [2, 3],
    ...overrides,
  }
}

function tree(overrides: Partial<ProposedTree> = {}): ProposedTree {
  return {
    nodes: [node()],
    rowErrors: [],
    stateLayer: { proposed: false, reason: 'the batch spans one subdivision' },
    ...overrides,
  }
}

function chunk(overrides: Partial<CommitChunk> = {}): CommitChunk {
  return {
    regions: { created: 1, adopted: 0, failed: 0 },
    coordinators: { matched: 0, created: 0, refused: 0 },
    rows: tally(),
    committedNow: 20,
    pending: 30,
    done: false,
    ...overrides,
  }
}

function tally(overrides: Partial<CommitTally> = {}): CommitTally {
  return {
    total: 50,
    committed: 20,
    verified: 12,
    unverified: 8,
    duplicates: 0,
    errors: 0,
    ...overrides,
  }
}

describe('commitVerdict', () => {
  it('asks for another chunk while the work left is falling', () => {
    expect(commitVerdict(40, chunk({ pending: 30 }))).toBe('commit')
  })

  it('has nothing to compare the first chunk to', () => {
    expect(commitVerdict(null, chunk({ pending: 30 }))).toBe('commit')
  })

  // The bound the endpoint is not trusted to honour: a chunk that writes neither
  // a class nor a reason onto a row leaves `pending` where it was.
  it('gives up once a chunk settles nothing', () => {
    expect(commitVerdict(30, chunk({ pending: 30 }))).toBe('stalled')
  })

  it('gives up on a chunk that went backwards', () => {
    expect(commitVerdict(30, chunk({ pending: 31 }))).toBe('stalled')
  })

  // `done` outranks the stall check, or the call that finishes a batch whose last
  // chunk committed nothing would be read as a stall — and the batch is gone.
  it('stops on a finished commit even where nothing moved', () => {
    expect(commitVerdict(0, chunk({ done: true, pending: 0 }))).toBe('done')
  })
})

describe('childrenByParent', () => {
  it('groups each node under the node above it', () => {
    const state = node({ key: 'state:DE-BE', level: 'region', name: 'Berlin', parentKey: null })
    const city = node({ key: 'city:id:place.berlin', parentKey: 'state:DE-BE' })

    const byParent = childrenByParent([state, city])

    expect(byParent.get(null)).toEqual([state])
    expect(byParent.get('state:DE-BE')).toEqual([city])
  })

  it('keeps two children of one parent in the order they were proposed', () => {
    const first = node({ key: 'a', parentKey: 'state:DE-BE' })
    const second = node({ key: 'b', parentKey: 'state:DE-BE' })

    expect(childrenByParent([first, second]).get('state:DE-BE')).toEqual([first, second])
  })
})

describe('isEditableNode', () => {
  it('offers the edits on a node the commit would create', () => {
    expect(isEditableNode(node())).toBe(true)
  })

  // The same refusals `applyTreeEdits` makes. A control offered here is a 422 the
  // reviewer was invited to trigger.
  it('offers none on a region the Atlas already holds', () => {
    const match = { kind: 'existing' as const, regionId: 7, name: 'Berlin', slug: 'berlin' }
    expect(isEditableNode(node({ match }))).toBe(false)
  })

  it('offers none on a node managed outside the target', () => {
    const match = { kind: 'elsewhere' as const, regionId: 9, name: 'Berlin' }
    expect(isEditableNode(node({ match }))).toBe(false)
  })
})

describe('nodeMatchNote', () => {
  it('names the region a matched node already is', () => {
    const match = { kind: 'existing' as const, regionId: 7, name: 'Berlin-Mitte', slug: 'mitte' }
    expect(nodeMatchNote(node({ match }))).toBe('already in the Atlas — Berlin-Mitte')
  })

  it('says a node managed elsewhere is, rather than that it is new', () => {
    const match = { kind: 'elsewhere' as const, regionId: 9, name: 'Berlin' }
    expect(nodeMatchNote(node({ match }))).toBe('managed elsewhere — Berlin')
  })

  it('says a created node is new', () => {
    expect(nodeMatchNote(node())).toBe('new')
  })
})

describe('nodeCountNote', () => {
  it('counts the lines the node holds', () => {
    expect(nodeCountNote(node({ lines: [2, 3, 4] }))).toBe('3 lines')
  })

  it('reads singular for one line', () => {
    expect(nodeCountNote(node({ lines: [2] }))).toBe('1 line')
  })
})

describe('mergedNote', () => {
  it('names the places the metro rule folded in', () => {
    const merged = [
      { key: 'potsdam', name: 'Potsdam', lines: [4], subdivisionCode: 'BB' },
      { key: 'teltow', name: 'Teltow', lines: [5], subdivisionCode: 'BB' },
    ]
    expect(mergedNote(node({ merged }))).toBe('includes Potsdam, Teltow')
  })

  it('says nothing where nothing merged', () => {
    expect(mergedNote(node())).toBeNull()
  })

  it('says nothing where the merge list is empty rather than absent', () => {
    expect(mergedNote(node({ merged: [] }))).toBeNull()
  })
})

describe('mappableFor', () => {
  const candidates: MappableRegion[] = [
    { id: 1, level: 'country', name: 'Germany' },
    { id: 2, level: 'region', name: 'Berlin' },
    { id: 3, level: 'city', name: 'Berlin-Mitte' },
  ]

  // `applyTreeEdits` requires a candidate at the node's own level, so a city
  // offered the state above it is a refusal the control invited.
  it('offers only the regions at the node’s own level', () => {
    expect(mappableFor(candidates, node({ level: 'city' }))).toEqual([
      { id: 3, level: 'city', name: 'Berlin-Mitte' },
    ])
  })

  it('offers nothing where the subtree holds no region at that level', () => {
    expect(mappableFor(candidates, node({ level: 'venue' }))).toEqual([])
  })
})

describe('stateLayerNote', () => {
  // A country batch under either threshold proposes its cities directly, which is
  // correct and reads as the grouping having failed.
  it('explains a layer the thresholds refused', () => {
    const stateLayer = { proposed: false as const, reason: 'only 3 cities were found' }
    expect(stateLayerNote(tree({ stateLayer }))).toBe('No state layer: only 3 cities were found')
  })

  it('counts the cities a proposed layer could not place', () => {
    const stateLayer = { proposed: true as const, states: [], unplacedCityKeys: ['a', 'b'] }
    expect(stateLayerNote(tree({ stateLayer }))).toContain('2 cities could not be placed')
  })

  it('says nothing about a layer that placed every city', () => {
    const stateLayer = { proposed: true as const, states: [], unplacedCityKeys: [] }
    expect(stateLayerNote(tree({ stateLayer }))).toBeNull()
  })
})

describe('coordinatorNote', () => {
  // The endpoint answers two numbers and no identity, so the wording may not
  // acquire one: nothing here names, counts by region, or describes an account
  // the Atlas already holds.
  it('counts the accounts the commit opens, and says only that the rest exist', () => {
    expect(coordinatorNote({ created: 2, existing: 3 })).toBe(
      '2 new coordinators will be created; 3 addresses already has an account.',
    )
  })

  it('leaves the existing clause out where every address is new', () => {
    expect(coordinatorNote({ created: 1, existing: 0 })).toBe(
      '1 new coordinator will be created.',
    )
  })

  it('says so where no row names a coordinator at all', () => {
    expect(coordinatorNote({ created: 0, existing: 0 })).toBe('No row names a coordinator.')
  })
})

describe('treeNote', () => {
  it('leads with what the commit creates', () => {
    expect(treeNote({ creating: 4, existing: 2, rowErrors: 1 })).toBe(
      '4 new regions, 2 already in the Atlas, 1 lines the regions cannot hold.',
    )
  })

  it('says only the creations where there is nothing else to say', () => {
    expect(treeNote({ creating: 1, existing: 0, rowErrors: 0 })).toBe('1 new region.')
  })
})

describe('commitProgressNote', () => {
  it('counts the lines settled, not the chunk just written', () => {
    const latest = chunk({ committedNow: 20, pending: 30, rows: tally({ total: 50 }) })
    expect(commitProgressNote(latest)).toBe('Creating classes — 20 of 50.')
  })
})

describe('commitDoneNote', () => {
  const finished = (overrides: Partial<FinishOutcome> = {}): FinishOutcome => ({
    committed: [
      { line: 2, eventId: 11 },
      { line: 3, eventId: 12 },
    ],
    skipped: [{ line: 4, reasons: ['this address is already in the Atlas'] }],
    summaryEmailed: true,
    deleted: true,
    ...overrides,
  })

  it('reports the classes created, split by whether anyone vouches for them', () => {
    const note = commitDoneNote(finished(), tally({ verified: 1, unverified: 1 }))
    expect(note).toBe('2 classes created, 1 with a coordinator, 1 unverified, 1 lines skipped.')
  })

  it('leaves the skipped clause out where nothing was skipped', () => {
    const note = commitDoneNote(finished({ skipped: [] }), tally({ verified: 2, unverified: 0 }))
    expect(note).toBe('2 classes created, 2 with a coordinator, 0 unverified.')
  })
})
