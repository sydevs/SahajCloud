/**
 * The two edits a reviewer makes to a proposed tree (#828): a rename, and a
 * mapping onto a region the Atlas already holds.
 *
 * `buildProposedTree` is pinned by its own spec, so the trees here are written
 * by hand rather than proposed — an edit's whole contract is "this tree in, that
 * tree out", and building the input through the proposal would couple these
 * assertions to the grouping thresholds they say nothing about.
 *
 * ⚠ **The consequences are what matter, not the field that changed.** A rename
 * has to move the slug, a mapping has to free the one it gave up, and a mapping
 * has to take an orphaned state layer with it — each of those is a separate
 * `it`, because a reviewer who only sees the name change would not notice any of
 * them going wrong.
 */
import { describe, expect, it } from 'vitest'

import { applyTreeEdits } from '@/collections/EventImports/propose/edit'
import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import type { ProposedNode, ProposedTree } from '@/collections/EventImports/propose/tree'

const TARGET_NAME = 'India'

function node(overrides: Partial<ProposedNode> & Pick<ProposedNode, 'key' | 'name'>): ProposedNode {
  return {
    level: 'city',
    parentKey: null,
    match: { kind: 'create' },
    // ⚠ **A distinguishable value, never null.** The proposal gives every
    // `create` node a slug, so a fixture starting at null makes "the mapped node
    // gives its slug up" pass whether or not the code clears it — the
    // `read() ?? fallback` trap, in the fixture rather than the assertion.
    slug: 'stale-slug',
    location: { kind: 'mapbox', mapboxId: `mbx.${overrides.key}` },
    lines: [2],
    ...overrides,
  }
}

function tree(nodes: ProposedNode[], rowErrors: ProposedTree['rowErrors'] = []): ProposedTree {
  return { nodes, rowErrors, stateLayer: { proposed: false, reason: 'not under test' } }
}

function existing(overrides: Partial<ExistingRegion> & Pick<ExistingRegion, 'id'>): ExistingRegion {
  return {
    level: 'city',
    name: 'Pune',
    slug: 'pune',
    mapboxId: 'mbx.pune',
    parentId: 1,
    inTarget: true,
    ...overrides,
  }
}

/** The arguments every call shares, so each test states only what it changes. */
function apply(
  input: ProposedTree,
  edits: Parameters<typeof applyTreeEdits>[0]['edits'],
  options: { mappable?: ExistingRegion[]; takenSlugs?: string[] } = {},
) {
  return applyTreeEdits({
    tree: input,
    edits,
    mappable: options.mappable ?? [],
    targetName: TARGET_NAME,
    takenSlugs: options.takenSlugs ?? [],
  })
}

function unwrap(result: ReturnType<typeof applyTreeEdits>): {
  tree: ProposedTree
  pruned: string[]
} {
  if (!result.ok) throw new Error(`expected the edits to apply, got: ${result.error}`)
  return { tree: result.tree, pruned: result.pruned }
}

const nodeNamed = (nodes: readonly ProposedNode[], name: string): ProposedNode => {
  const found = nodes.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`no node named ${name}, got ${nodes.map((n) => n.name).join(', ')}`)
  return found
}

describe('applyTreeEdits', () => {
  describe('renaming a node', () => {
    it('takes the new name and the slug that follows from it', () => {
      const { tree: edited } = unwrap(
        apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
          { kind: 'rename', key: 'city:pune', name: 'Pune City' },
        ]),
      )

      expect(edited.nodes[0].name).toBe('Pune City')
      expect(edited.nodes[0].slug).toBe('pune-city')
    })

    it('trims the name rather than slugging the spaces', () => {
      const { tree: edited } = unwrap(
        apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
          { kind: 'rename', key: 'city:pune', name: '  Pimpri  ' },
        ]),
      )

      expect(edited.nodes[0].name).toBe('Pimpri')
      expect(edited.nodes[0].slug).toBe('pimpri')
    })

    // The slug falls back to the level for a name that slugifies to nothing
    // (`slugs.ts`), so a blank rename would be created as "city" with nothing
    // saying it went wrong.
    it('refuses a name that is only whitespace', () => {
      const result = apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
        { kind: 'rename', key: 'city:pune', name: '   ' },
      ])

      expect(result).toEqual({ ok: false, error: '"Pune" needs a name.' })
    })

    it('disambiguates against a slug the Atlas already holds', () => {
      const { tree: edited } = unwrap(
        apply(
          tree([node({ key: 'city:pune', name: 'Pune' })]),
          [{ kind: 'rename', key: 'city:pune', name: 'Georgia' }],
          { takenSlugs: ['georgia'] },
        ),
      )

      expect(edited.nodes[0].slug).toBe('georgia-india')
    })

    // Assigned in node order, so renaming the first of two same-named nodes has
    // to move the *second* one's slug too — which only a re-slug of the whole
    // tree does. The one it moves to is the target's name, because a node with
    // no proposed parent disambiguates on the target (`tree.ts`).
    it('re-slugs the siblings a rename collides with', () => {
      const { tree: edited } = unwrap(
        apply(
          tree([
            node({ key: 'city:a', name: 'Alpha' }),
            node({ key: 'city:b', name: 'Beta', lines: [3] }),
          ]),
          [{ kind: 'rename', key: 'city:a', name: 'Beta' }],
        ),
      )

      expect(nodeNamed(edited.nodes, 'Beta').slug).toBe('beta')
      expect(edited.nodes[1].slug).toBe('beta-india')
    })
  })

  describe('mapping a node onto an existing region', () => {
    const PUNE = existing({ id: 42, name: 'Pune', slug: 'pune-existing' })

    it('records the region and stops the commit creating one', () => {
      const { tree: edited } = unwrap(
        apply(
          tree([node({ key: 'city:pune', name: 'Poona' })]),
          [{ kind: 'map', key: 'city:pune', regionId: 42 }],
          { mappable: [PUNE] },
        ),
      )

      expect(edited.nodes[0].match).toEqual({
        kind: 'existing',
        regionId: 42,
        name: 'Pune',
        slug: 'pune-existing',
      })
      expect(edited.nodes[0].slug).toBeNull()
      expect(edited.nodes[0].location).toBeNull()
    })

    // The existing region keeps the parent it has — moving one is out of scope
    // — so a proposed state must not read as its new parent.
    it('detaches the node from its proposed parent', () => {
      const { tree: edited } = unwrap(
        apply(
          tree([
            node({ key: 'state:MH', name: 'Maharashtra', level: 'region', lines: [2, 3] }),
            node({ key: 'city:pune', name: 'Poona', parentKey: 'state:MH' }),
            node({ key: 'city:nashik', name: 'Nashik', parentKey: 'state:MH', lines: [3] }),
          ]),
          [{ kind: 'map', key: 'city:pune', regionId: 42 }],
          { mappable: [PUNE] },
        ),
      )

      expect(nodeNamed(edited.nodes, 'Poona').parentKey).toBeNull()
      expect(nodeNamed(edited.nodes, 'Nashik').parentKey).toBe('state:MH')
    })

    it('frees the slug the mapped node was holding', () => {
      const { tree: edited } = unwrap(
        apply(
          tree([
            node({ key: 'city:pune', name: 'Pune' }),
            node({ key: 'city:pune-2', name: 'Pune', lines: [3] }),
          ]),
          [{ kind: 'map', key: 'city:pune', regionId: 42 }],
          { mappable: [PUNE] },
        ),
      )

      expect(nodeNamed(edited.nodes, 'Pune').slug).toBeNull()
      expect(edited.nodes[1].slug).toBe('pune')
    })

    it('refuses a region outside the subtree the batch targets', () => {
      const result = apply(
        tree([node({ key: 'city:pune', name: 'Poona' })]),
        [{ kind: 'map', key: 'city:pune', regionId: 99 }],
        { mappable: [PUNE] },
      )

      expect(result.ok).toBe(false)
      expect(result.ok ? '' : result.error).toContain('inside the one you are importing into')
    })

    // `ALLOWED_PARENT_LEVELS` (`Regions.ts`) forbids a class's region being a
    // country, so a city mapped onto one would commit classes nothing can hold.
    it('refuses a region at a different level', () => {
      const result = apply(
        tree([node({ key: 'city:pune', name: 'Poona' })]),
        [{ kind: 'map', key: 'city:pune', regionId: 42 }],
        { mappable: [existing({ id: 42, level: 'region', name: 'Maharashtra' })] },
      )

      expect(result).toEqual({
        ok: false,
        error: '"Poona" is a city, so it cannot be mapped to a region.',
      })
    })
  })

  describe('the state layer a mapping empties', () => {
    // The same shape `keepPeopledStates` refuses at proposal time, reached by
    // another route: the layer's name, slug, centre and radius were all computed
    // from cities that are no longer being created.
    it('drops a state whose last new city was mapped away', () => {
      const { tree: edited, pruned } = unwrap(
        apply(
          tree([
            node({ key: 'state:MH', name: 'Maharashtra', level: 'region', lines: [2] }),
            node({ key: 'city:pune', name: 'Poona', parentKey: 'state:MH' }),
          ]),
          [{ kind: 'map', key: 'city:pune', regionId: 42 }],
          { mappable: [existing({ id: 42 })] },
        ),
      )

      expect(edited.nodes.map((n) => n.key)).toEqual(['city:pune'])
      expect(pruned).toEqual(['state:MH'])
    })

    it('keeps a state that still has a city to create', () => {
      const { tree: edited, pruned } = unwrap(
        apply(
          tree([
            node({ key: 'state:MH', name: 'Maharashtra', level: 'region', lines: [2, 3] }),
            node({ key: 'city:pune', name: 'Poona', parentKey: 'state:MH' }),
            node({ key: 'city:nashik', name: 'Nashik', parentKey: 'state:MH', lines: [3] }),
          ]),
          [{ kind: 'map', key: 'city:pune', regionId: 42 }],
          { mappable: [existing({ id: 42 })] },
        ),
      )

      expect(edited.nodes.map((n) => n.key)).toContain('state:MH')
      expect(pruned).toEqual([])
    })
  })

  describe('what it refuses outright', () => {
    it('names a key the batch does not propose', () => {
      const result = apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
        { kind: 'rename', key: 'city:nowhere', name: 'Anything' },
      ])

      expect(result).toEqual({
        ok: false,
        error: 'This batch proposes no node called "city:nowhere".',
      })
    })

    it('refuses to rename a node the Atlas already holds', () => {
      const result = apply(
        tree([
          node({
            key: 'city:pune',
            name: 'Pune',
            match: { kind: 'existing', regionId: 7, name: 'Pune', slug: 'pune' },
          }),
        ]),
        [{ kind: 'rename', key: 'city:pune', name: 'Poona' }],
      )

      expect(result.ok).toBe(false)
      expect(result.ok ? '' : result.error).toContain('already a region in the Atlas')
    })

    it('refuses to edit a node held outside the target', () => {
      const result = apply(
        tree([
          node({
            key: 'city:pune',
            name: 'Pune',
            match: { kind: 'elsewhere', regionId: 7, name: 'Pune' },
          }),
        ]),
        [{ kind: 'map', key: 'city:pune', regionId: 42 }],
        { mappable: [existing({ id: 42 })] },
      )

      expect(result.ok).toBe(false)
      expect(result.ok ? '' : result.error).toContain('exists outside this region of the Atlas')
    })

    // Half-applied edits would be stored and rendered back as the reviewer's own
    // tree, so a reviewer who mistyped one node could not tell what survived.
    it('applies none of a batch whose later edit fails', () => {
      const input = tree([node({ key: 'city:pune', name: 'Pune' })])
      const result = apply(input, [
        { kind: 'rename', key: 'city:pune', name: 'Poona' },
        { kind: 'rename', key: 'city:gone', name: 'Anything' },
      ])

      expect(result.ok).toBe(false)
      expect(input.nodes[0].name).toBe('Pune')
    })
  })

  // The stored list is the proposal's `elsewhere` rows PLUS the rows a city
  // target confined away (`endpoints/propose.ts`), and the second half is not
  // derivable from the nodes — so recomputing it here would clear them.
  it('carries the row errors over untouched', () => {
    const errors = [{ line: 9, message: 'This address is not in Pune.' }]
    const { tree: edited } = unwrap(
      apply(tree([node({ key: 'city:pune', name: 'Pune' })], errors), [
        { kind: 'rename', key: 'city:pune', name: 'Poona' },
      ]),
    )

    expect(edited.rowErrors).toEqual(errors)
    expect(edited.stateLayer).toEqual({ proposed: false, reason: 'not under test' })
  })

  it('leaves the tree it was given alone', () => {
    const input = tree([node({ key: 'city:pune', name: 'Pune' })])
    const { tree: edited } = unwrap(
      apply(input, [{ kind: 'rename', key: 'city:pune', name: 'Poona' }]),
    )

    expect(input.nodes[0].name).toBe('Pune')
    expect(edited.nodes[0]).not.toBe(input.nodes[0])
  })
})
