import { describe, expect, it } from 'vitest'

import {
  meditationDominantNode,
  meditationTitleFromWeights,
  meditationTitleNodeFromWeights,
} from '@/collections/Meditations/hooks/fallbackTitle'
import { SUBTLE_SYSTEM_NODE_OPTIONS } from '@/lib/subtleSystem'

describe('meditationTitleFromWeights', () => {
  it('returns null when there are no weights', () => {
    expect(meditationTitleFromWeights(undefined)).toBeNull()
    expect(meditationTitleFromWeights(null)).toBeNull()
    expect(meditationTitleFromWeights({})).toBeNull()
  })

  it('returns null for non-object inputs', () => {
    expect(meditationTitleFromWeights('anahat')).toBeNull()
    expect(meditationTitleFromWeights(42)).toBeNull()
  })

  it('builds the title from a single node label', () => {
    expect(meditationTitleFromWeights({ anahat: 42 })).toBe('Meditation for Anahat')
  })

  it('picks the highest-weighted node', () => {
    expect(meditationTitleFromWeights({ mooladhara: 10, anahat: 30, sahasrara: 20 })).toBe(
      'Meditation for Anahat',
    )
  })

  it('maps channel slugs to their human labels', () => {
    expect(meditationTitleFromWeights({ pingala: 5 })).toBe('Meditation for Right Channel')
    expect(meditationTitleFromWeights({ ida: 5 })).toBe('Meditation for Left Channel')
    expect(meditationTitleFromWeights({ sushumna: 5 })).toBe('Meditation for Center Channel')
  })

  it('ignores non-numeric weights', () => {
    expect(meditationTitleFromWeights({ anahat: 'lots', nabhi: 5 })).toBe('Meditation for Nabhi')
    expect(meditationTitleFromWeights({ anahat: 'lots', nabhi: null })).toBeNull()
  })

  it('falls back to the raw slug for an unknown node', () => {
    expect(meditationTitleFromWeights({ mystery: 5 })).toBe('Meditation for mystery')
  })

  it('keeps the first-inserted slug on a weight tie', () => {
    expect(meditationTitleFromWeights({ agnya: 10, anahat: 10 })).toBe('Meditation for Agnya')
  })
})

describe('meditationDominantNode', () => {
  it('returns null when there are no usable weights', () => {
    expect(meditationDominantNode(undefined)).toBeNull()
    expect(meditationDominantNode({})).toBeNull()
    expect(meditationDominantNode('anahat')).toBeNull()
    expect(meditationDominantNode({ anahat: 'lots' })).toBeNull()
  })

  it('answers the raw slug, known or not', () => {
    expect(meditationDominantNode({ mooladhara: 10, anahat: 30 })).toBe('anahat')
    expect(meditationDominantNode({ mystery: 5 })).toBe('mystery')
  })

  // The one argmax both fields read. Were they to drift, a meditation's English
  // name and the slug a site words its own name from could name different nodes.
  it('is the argmax both public helpers agree on', () => {
    const weights = { mooladhara: 4, pingala: 9, anahat: 7 }
    expect(meditationDominantNode(weights)).toBe('pingala')
    expect(meditationTitleFromWeights(weights)).toBe('Meditation for Right Channel')
    expect(meditationTitleNodeFromWeights(weights)).toBe('pingala')
  })
})

describe('meditationTitleNodeFromWeights', () => {
  it('passes a null argmax through', () => {
    expect(meditationTitleNodeFromWeights({})).toBeNull()
  })

  /**
   * Reads as circular — the set `isSubtleSystemNodeSlug` tests is built from the
   * list this iterates. It is not: it is what catches an exclusion added to the
   * guard, which is the one way a node the data can hold stops answering. An
   * earlier pass deleted this case as a tautology and nothing went red.
   */
  it('answers every node in the closed set', () => {
    for (const { value } of SUBTLE_SYSTEM_NODE_OPTIONS) {
      expect(meditationTitleNodeFromWeights({ [value]: 5 })).toBe(value)
    }
  })

  // `title` falls back to the raw slug; this field cannot, or it would answer
  // outside its own `select` options.
  it('narrows away a slug the node set does not hold', () => {
    expect(meditationTitleNodeFromWeights({ mystery: 5 })).toBeNull()
    expect(meditationTitleFromWeights({ mystery: 5 })).toBe('Meditation for mystery')
  })

  // A stored key is matched against the node list, never read off an object
  // keyed by its slugs, so no inherited `Object` key answers as a node or as a
  // label. A label read off an object once answered the function's own source
  // text.
  it('never resolves an inherited Object key', () => {
    expect(meditationTitleNodeFromWeights({ toString: 5 })).toBeNull()
    expect(meditationTitleFromWeights({ toString: 5 })).toBe('Meditation for toString')
    expect(meditationTitleFromWeights({ constructor: 5 })).toBe('Meditation for constructor')
  })
})
