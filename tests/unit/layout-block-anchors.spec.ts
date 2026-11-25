import type { ArrayField, FieldHook, TextField } from 'payload'

import { describe, expect, it } from 'vitest'

import { LayoutBlock } from '@/lib/richEditor/blocks/LayoutBlock'

/**
 * The wiring, not the spelling — `slugify.spec.ts` owns the matrix. These two
 * anchors are read verbatim by a consumer that folds an umlaut to a bare
 * vowel, so the slug spelling here would point at an id nobody emits.
 */
const field = <T>(name: string) => LayoutBlock.fields.find((f) => 'name' in f && f.name === name) as T

const items = field<ArrayField>('items')
const defaultTab = field<TextField>('defaultTab')

const firstHook = (hooks: FieldHook[] | undefined) => hooks?.[0] as (args: never) => unknown

describe('layout tab anchors', () => {
  it('spells a tab title the way the consumer emits its id', () => {
    const computed = firstHook(items.hooks?.beforeChange)({
      value: [{ title: 'Über uns' }],
      siblingData: { style: 'tabs' },
    } as never) as Array<{ titleUrl?: string }>

    expect(computed[0].titleUrl).toBe('#uber-uns')
  })

  it('stores the default tab under the same spelling', () => {
    expect(firstHook(defaultTab.hooks?.beforeChange)({ value: 'Über uns' } as never)).toBe(
      '#uber-uns',
    )
  })
})
