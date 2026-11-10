/**
 * The field-side half of the `select` repair: `collectVirtualFieldInputs`, and
 * the plugin that mounts a hook from what it finds.
 *
 * The declaration moved onto the field because a per-collection one is a thing
 * to forget, which is how #1084 happened. These cases are what says a mounted
 * field is enough — nothing else in the lane can, since a collection declares
 * no hook of its own any more.
 *
 * Fixture pre-mortem: the cases assume `custom` survives onto a field config
 * unread by Payload, and that a plugin receives the config before
 * sanitization, so the collections it walks carry the fields as written.
 * Verified against `payload`'s `Plugin` type and `src/payload.config.ts`.
 */
import type { CollectionConfig, Config, Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { virtualFieldInputs, virtualFieldsPlugin } from '@/plugins/virtualFields'
import { collectVirtualFieldInputs } from '@/plugins/virtualFields/collect'

const computed = (name: string, ...inputs: string[]): Field => ({
  name,
  type: 'text',
  virtual: true,
  custom: virtualFieldInputs(...inputs),
})

describe('collectVirtualFieldInputs', () => {
  it('reads the declaration off a field', () => {
    expect(collectVirtualFieldInputs([computed('webUrl', 'slug', '_status')])).toEqual({
      webUrl: ['slug', '_status'],
    })
  })

  it('leaves out a field that declares nothing', () => {
    const fields: Field[] = [
      { name: 'slug', type: 'text' },
      { name: 'appUrl', type: 'text', virtual: true, custom: virtualFieldInputs() },
      { name: 'webPath', type: 'text', virtual: true, custom: { somethingElse: true } },
    ]

    expect(collectVirtualFieldInputs(fields)).toEqual({})
  })

  it('reaches a field inside a wrapper that holds no data of its own', () => {
    // `publicUrlFields` wraps its three fields in a collapsible, and a tab is
    // how most of this repo's collections are laid out. A field in either is
    // still top-level in the data, so its inputs belong to the top-level
    // `select` the hook patches.
    const fields: Field[] = [
      { type: 'collapsible', label: 'Public Links', fields: [computed('webUrl', 'slug')] },
      { type: 'row', fields: [computed('durationMinutes', 'duration')] },
      { type: 'tabs', tabs: [{ label: 'Details', fields: [computed('status', 'job')] }] },
    ]

    expect(collectVirtualFieldInputs(fields)).toEqual({
      webUrl: ['slug'],
      durationMinutes: ['duration'],
      status: ['job'],
    })
  })

  it('does not reach a field inside a named level', () => {
    // `select` nests the way data does, so this field's inputs belong to
    // `usage`'s own select — not to the one the hook patches. Collecting it
    // would write a key the caller never asked about into the top level.
    const fields: Field[] = [
      { name: 'usage', type: 'group', fields: [computed('abuseScore', 'requests')] },
    ]

    expect(collectVirtualFieldInputs(fields)).toEqual({})
  })
})

describe('virtualFieldsPlugin', () => {
  const collection = (slug: string, fields: Field[]): CollectionConfig => ({ slug, fields })

  const build = (collections: CollectionConfig[]): CollectionConfig[] =>
    (virtualFieldsPlugin({ collections } as Config) as Config).collections ?? []

  it('mounts the repair on a collection whose field declares inputs', () => {
    const [mounted] = build([collection('pages', [computed('webUrl', 'slug')])])

    const args = { select: { webUrl: true } }
    mounted.hooks?.beforeOperation?.[0]?.({ operation: 'find', args } as never)

    expect(args.select).toEqual({ webUrl: true, slug: true })
  })

  it('mounts nothing on a collection that declares nothing', () => {
    const [mounted] = build([collection('images', [{ name: 'filename', type: 'text' }])])

    expect(mounted.hooks?.beforeOperation).toBeUndefined()
  })

  it('runs before a hook the collection declared itself', () => {
    // `excludeFinishedEvents` and `filterMeditationsByLocale` append a `where`.
    // Ordering the repair first keeps the `select` whole before either reads
    // the arguments, which is the order those two collections had by hand.
    const own = () => undefined
    const [mounted] = build([
      {
        slug: 'events',
        fields: [computed('webUrl', 'region')],
        hooks: { beforeOperation: [own] },
      },
    ])

    expect(mounted.hooks?.beforeOperation).toHaveLength(2)
    expect(mounted.hooks?.beforeOperation?.[1]).toBe(own)
  })
})
