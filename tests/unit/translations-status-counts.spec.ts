import { describe, expect, it } from 'vitest'

import {
  countLeafKeys,
  countNonEmptyKeys,
  type TranslationSchemaNode,
} from '@/globals/wemeditate-app/status/translationCounts'

const flatNode: TranslationSchemaNode = {
  type: 'object',
  properties: {
    home: { type: 'string', description: 'Home tab label' },
    settings: { type: 'string', description: 'Settings tab label' },
  },
}

const nestedNode: TranslationSchemaNode = {
  type: 'object',
  properties: {
    main: {
      type: 'object',
      properties: {
        start_now: { type: 'string', description: 'Start CTA' },
        cancel: { type: 'string', description: 'Cancel CTA' },
      },
    },
    common: {
      type: 'object',
      properties: {
        ok: { type: 'string', description: 'OK button' },
      },
    },
  },
}

describe('countLeafKeys', () => {
  it('returns 0 when properties is absent', () => {
    expect(countLeafKeys({ type: 'object' })).toBe(0)
  })

  it('returns 0 for an empty properties object', () => {
    expect(countLeafKeys({ type: 'object', properties: {} })).toBe(0)
  })

  it('counts string leaves in a flat group', () => {
    expect(countLeafKeys(flatNode)).toBe(2)
  })

  it('recurses into nested object properties', () => {
    expect(countLeafKeys(nestedNode)).toBe(3)
  })

  it('handles three levels of nesting', () => {
    const threeLevel: TranslationSchemaNode = {
      type: 'object',
      properties: {
        outer: {
          type: 'object',
          properties: {
            inner: {
              type: 'object',
              properties: {
                deep_key: { type: 'string' },
                another: { type: 'string' },
              },
            },
            sibling_string: { type: 'string' },
          },
        },
      },
    }
    expect(countLeafKeys(threeLevel)).toBe(3)
  })
})

describe('countNonEmptyKeys', () => {
  it('returns 0 when data is null', () => {
    expect(countNonEmptyKeys(flatNode, null)).toBe(0)
  })

  it('returns 0 when data is undefined', () => {
    expect(countNonEmptyKeys(flatNode, undefined)).toBe(0)
  })

  it('returns 0 when node has no properties', () => {
    expect(countNonEmptyKeys({ type: 'object' }, { home: 'x' })).toBe(0)
  })

  it('counts only non-empty trimmed strings in a flat group', () => {
    expect(
      countNonEmptyKeys(flatNode, {
        home: 'Home',
        settings: '   ',
      }),
    ).toBe(1)
  })

  it('ignores non-string values in a flat group', () => {
    expect(
      countNonEmptyKeys(flatNode, {
        home: 'Home',
        settings: 42 as unknown as string,
      }),
    ).toBe(1)
  })

  it('recurses into nested data matching the schema shape', () => {
    expect(
      countNonEmptyKeys(nestedNode, {
        main: { start_now: 'Start', cancel: 'Cancel' },
        common: { ok: 'OK' },
      }),
    ).toBe(3)
  })

  it('returns 0 for a sub-group missing entirely from data', () => {
    expect(
      countNonEmptyKeys(nestedNode, {
        main: { start_now: 'Start', cancel: 'Cancel' },
      }),
    ).toBe(2)
  })

  it('returns 0 for a sub-group whose data is null', () => {
    expect(
      countNonEmptyKeys(nestedNode, {
        main: { start_now: 'Start', cancel: 'Cancel' },
        common: null,
      }),
    ).toBe(2)
  })

  it('counts partially-filled sub-groups correctly', () => {
    expect(
      countNonEmptyKeys(nestedNode, {
        main: { start_now: 'Start', cancel: '' },
        common: { ok: 'OK' },
      }),
    ).toBe(2)
  })
})
