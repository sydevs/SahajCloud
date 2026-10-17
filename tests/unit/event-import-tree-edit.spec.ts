/**
 * The edits a reviewer makes to a proposed tree (#828): a rename, a mapping
 * onto a region the Atlas already holds, and undoing that mapping.
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

import { applyTreeEdits, MAX_RENAMED_LENGTH } from '@/collections/EventImports/propose/edit'
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

  describe('what a rename refuses or tidies', () => {
    // ⚠ A zero-width space survives `trim`, so it reached the slug rule as a
    // real name and the Atlas as a blank label.
    it('refuses a name made only of invisible characters', () => {
      const result = apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
        { kind: 'rename', key: 'city:pune', name: '\u200B\u2060\uFEFF \u00A0' },
      ])

      expect(result).toEqual({ ok: false, error: '"Pune" needs a name.' })
    })

    it('strips invisible characters and collapses odd spaces from a real name', () => {
      const { tree: edited } = unwrap(
        apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
          { kind: 'rename', key: 'city:pune', name: '\u202EPim\u200Bpri\u00A0\u00A0Chinchwad\u200B' },
        ]),
      )

      expect(edited.nodes[0].name).toBe('Pimpri Chinchwad')
    })

    // A joiner is how Persian and Devanagari spell some words, so only the
    // ones at the edges are dropped.
    it('keeps a joiner inside a word', () => {
      const { tree: edited } = unwrap(
        apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
          { kind: 'rename', key: 'city:pune', name: '\u200Cمی\u200Cخانه\u200C' },
        ]),
      )

      expect(edited.nodes[0].name).toBe('می\u200Cخانه')
    })

    it('refuses a name longer than a place name', () => {
      const result = apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
        { kind: 'rename', key: 'city:pune', name: 'a'.repeat(MAX_RENAMED_LENGTH + 1) },
      ])

      expect(result.ok).toBe(false)
      expect(result.ok ? '' : result.error).toContain(`at most ${MAX_RENAMED_LENGTH}`)
    })

    // ⚠ Renaming a new node onto a region the target already holds commits a
    // duplicate under a disambiguated slug — the mistake `map` exists for.
    it('refuses a name a region at its level in the target already has, and says to map', () => {
      const result = apply(
        tree([node({ key: 'city:poona', name: 'Poona' })]),
        [{ kind: 'rename', key: 'city:poona', name: ' pune ' }],
        { mappable: [existing({ id: 42, name: 'Pune', parentId: 7 })] },
      )

      expect(result).toEqual({
        ok: false,
        error:
          '"Pune" is already a city in this region of the Atlas. Map "Poona" onto it instead of renaming it.',
      })
    })

    it('allows a name a region at another level has', () => {
      const { tree: edited } = unwrap(
        apply(
          tree([node({ key: 'city:poona', name: 'Poona' })]),
          [{ kind: 'rename', key: 'city:poona', name: 'Maharashtra' }],
          { mappable: [existing({ id: 3, level: 'region', name: 'Maharashtra' })] },
        ),
      )

      expect(edited.nodes[0].name).toBe('Maharashtra')
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

    // ⚠ `Regions.name` is optional and some hand-seeded regions have none, so
    // an empty label would leave the review unable to say which region the node
    // was mapped onto. `asExisting` (`match.ts`) falls back to the id; so does
    // this, or the two writers of `match.name` disagree.
    it('falls back to the id when the region it maps onto has no name', () => {
      const { tree: edited } = unwrap(
        apply(
          tree([node({ key: 'city:pune', name: 'Poona' })]),
          [{ kind: 'map', key: 'city:pune', regionId: 50 }],
          { mappable: [existing({ id: 50, name: null, slug: null })] },
        ),
      )

      expect(edited.nodes[0].match).toMatchObject({ name: '50', slug: null })
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

    // ⚠ The propose step builds an `existing` list that deliberately carries
    // out-of-subtree regions, for the refusal `match.ts` makes on them. Handing
    // that list here must not permit the mapping the subtree read prevents, so
    // the flag is checked rather than assumed from how the caller queried.
    it('refuses a region the caller marked as outside the target', () => {
      const result = apply(
        tree([node({ key: 'city:pune', name: 'Poona' })]),
        [{ kind: 'map', key: 'city:pune', regionId: 42 }],
        { mappable: [existing({ id: 42, inTarget: false })] },
      )

      expect(result.ok).toBe(false)
      expect(result.ok ? '' : result.error).toContain('inside the one you are importing into')
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

  describe('mapping a state onto an existing region', () => {
    const BAVARIA = existing({ id: 40, level: 'region', name: 'Bavaria', slug: 'bavaria', parentId: 1 })
    const MUNICH = existing({ id: 41, name: 'Munich', slug: 'munich', mapboxId: 'manual-m', parentId: 40 })
    const bayern = () =>
      tree([
        node({ key: 'state:BY', name: 'Bayern', level: 'region', lines: [2, 3] }),
        node({ key: 'city:munich', name: 'munich', parentKey: 'state:BY', lines: [2] }),
        node({ key: 'city:passau', name: 'Passau', parentKey: 'state:BY', lines: [3] }),
      ])

    // ⚠ The proposal matched these cities while their state was new, when there
    // were no children to find them among.
    it('matches the new cities under it against that region’s own', () => {
      const { tree: edited } = unwrap(
        apply(bayern(), [{ kind: 'map', key: 'state:BY', regionId: 40 }], {
          mappable: [BAVARIA, MUNICH],
        }),
      )

      expect(nodeNamed(edited.nodes, 'munich').match).toMatchObject({ kind: 'existing', regionId: 41 })
      expect(nodeNamed(edited.nodes, 'munich').parentKey).toBeNull()
      expect(nodeNamed(edited.nodes, 'Passau').match).toEqual({ kind: 'create' })
    })

    it('slugs the cities left under it on the region’s name, not the proposal’s', () => {
      const { tree: edited } = unwrap(
        apply(bayern(), [{ kind: 'map', key: 'state:BY', regionId: 40 }], {
          mappable: [BAVARIA, MUNICH],
          takenSlugs: ['passau'],
        }),
      )

      expect(nodeNamed(edited.nodes, 'Passau').slug).toBe('passau-bavaria')
    })

    it('lets a city it matched be unmapped back under the state', () => {
      const mapped = unwrap(
        apply(bayern(), [{ kind: 'map', key: 'state:BY', regionId: 40 }], {
          mappable: [BAVARIA, MUNICH],
        }),
      ).tree
      const { tree: edited } = unwrap(apply(mapped, [{ kind: 'unmap', key: 'city:munich' }]))

      expect(nodeNamed(edited.nodes, 'munich')).toMatchObject({
        match: { kind: 'create' },
        parentKey: 'state:BY',
        location: { kind: 'mapbox', mapboxId: 'mbx.city:munich' },
      })
    })
  })

  describe('unmapping a node', () => {
    const PUNE = existing({ id: 42, name: 'Pune', slug: 'pune-existing' })

    it('restores the proposal a mapping replaced', () => {
      const input = tree([
        node({ key: 'state:MH', name: 'Maharashtra', level: 'region', lines: [2, 3] }),
        node({ key: 'city:pune', name: 'Poona', parentKey: 'state:MH' }),
        node({ key: 'city:nashik', name: 'Nashik', parentKey: 'state:MH', lines: [3] }),
      ])
      const mapped = unwrap(
        apply(input, [{ kind: 'map', key: 'city:pune', regionId: 42 }], { mappable: [PUNE] }),
      ).tree
      expect(nodeNamed(mapped.nodes, 'Poona').before).toEqual({
        name: 'Poona',
        parentKey: 'state:MH',
        location: { kind: 'mapbox', mapboxId: 'mbx.city:pune' },
      })

      const { tree: edited } = unwrap(apply(mapped, [{ kind: 'unmap', key: 'city:pune' }]))
      const pune = nodeNamed(edited.nodes, 'Poona')

      expect(pune.match).toEqual({ kind: 'create' })
      expect(pune.parentKey).toBe('state:MH')
      expect(pune.location).toEqual({ kind: 'mapbox', mapboxId: 'mbx.city:pune' })
      expect(pune.slug).toBe('poona')
      expect(pune.before).toBeUndefined()
    })

    // Its state went because nothing under it was new; only that state's own
    // unmap could say what it was, so the city hangs off the target.
    it('hangs a node off the target when the prune took its parent', () => {
      const mapped = unwrap(
        apply(
          tree([
            node({ key: 'state:MH', name: 'Maharashtra', level: 'region', lines: [2] }),
            node({ key: 'city:pune', name: 'Poona', parentKey: 'state:MH' }),
          ]),
          [{ kind: 'map', key: 'city:pune', regionId: 42 }],
          { mappable: [PUNE] },
        ),
      ).tree
      expect(mapped.nodes.map((n) => n.key)).toEqual(['city:pune'])

      const { tree: edited } = unwrap(apply(mapped, [{ kind: 'unmap', key: 'city:pune' }]))

      expect(edited.nodes[0]).toMatchObject({ match: { kind: 'create' }, parentKey: null })
    })

    // ⚠ A node the proposal matched has no proposal to go back to: creating
    // it would duplicate the region or fail `mapboxId`'s unique constraint.
    it('refuses a node the proposal matched itself', () => {
      const result = apply(
        tree([
          node({
            key: 'city:pune',
            name: 'Pune',
            match: { kind: 'existing', regionId: 7, name: 'Pune', slug: 'pune' },
            slug: null,
            location: null,
          }),
        ]),
        [{ kind: 'unmap', key: 'city:pune' }],
      )

      expect(result).toEqual({
        ok: false,
        error: '"Pune" was not mapped in this review, so there is nothing to undo.',
      })
    })

    it('refuses a node that is still to be created', () => {
      const result = apply(tree([node({ key: 'city:pune', name: 'Pune' })]), [
        { kind: 'unmap', key: 'city:pune' },
      ])

      expect(result.ok).toBe(false)
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

    // The wording says the node POINTS AT a region, not that the Atlas held it
    // first: a node this endpoint mapped a moment ago reaches the same refusal,
    // and "already a region in the Atlas" would be false of that one.
    it('refuses to rename a node that already points at a region', () => {
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
      expect(result.ok ? '' : result.error).toContain('already points at a region in the Atlas')
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
