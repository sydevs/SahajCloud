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
  it('returns null when there are no usable weights', () => {
    expect(meditationTitleNodeFromWeights(undefined)).toBeNull()
    expect(meditationTitleNodeFromWeights(null)).toBeNull()
    expect(meditationTitleNodeFromWeights({})).toBeNull()
    expect(meditationTitleNodeFromWeights(42)).toBeNull()
  })

  it('answers the dominant slug for every node in the closed set', () => {
    for (const { value } of SUBTLE_SYSTEM_NODE_OPTIONS) {
      expect(meditationTitleNodeFromWeights({ [value]: 5 })).toBe(value)
    }
  })

  it('picks the highest-weighted node', () => {
    expect(meditationTitleNodeFromWeights({ mooladhara: 10, anahat: 30, sahasrara: 20 })).toBe(
      'anahat',
    )
  })

  it('keeps the first-inserted slug on a weight tie', () => {
    expect(meditationTitleNodeFromWeights({ agnya: 10, anahat: 10 })).toBe('agnya')
  })

  // `title` falls back to the raw slug; this field cannot, or it would answer
  // outside its own `select` options.
  it('narrows away a slug the node set does not hold', () => {
    expect(meditationTitleNodeFromWeights({ mystery: 5 })).toBeNull()
    expect(meditationTitleFromWeights({ mystery: 5 })).toBe('Meditation for mystery')
  })

  // The slugs sit in a `Set`, not an object, so no inherited `Object` key can
  // answer the membership check and reach a caller as a node.
  it('narrows away an inherited Object key', () => {
    expect(meditationTitleNodeFromWeights({ toString: 5 })).toBeNull()
    expect(meditationTitleNodeFromWeights({ constructor: 5 })).toBeNull()
  })
})
