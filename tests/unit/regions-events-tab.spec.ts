import type { CollectionConfig, Field, TabsField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Regions } from '@/collections/Regions/Regions'

/**
 * An event names a city or a venue in `events.region`, and that field's
 * `filterOptions` admits no other level — so a country's or a region's Events
 * tab had nothing it could ever list.
 *
 * The condition is read off the tab rather than called directly, because the
 * tab is what has to carry it: on the join field alone it hides the list and
 * leaves the empty tab to click.
 */
const isTabs = (field: Field): field is TabsField => field.type === 'tabs'

const eventsTabCondition = () => {
  const tabs = (Regions as CollectionConfig).fields.filter(isTabs).flatMap((field) => field.tabs)
  const events = tabs.find((tab) => tab.label === 'Events')

  if (!events) throw new Error('Regions declares no Events tab')
  return events.admin?.condition
}

describe('the Regions Events tab', () => {
  const condition = eventsTabCondition()
  const saved = (level: string) => ({ id: 7, level })

  it('is conditional at all', () => {
    expect(condition).toBeTypeOf('function')
  })

  it.each(['city', 'venue'])('shows on a %s, which an event can name', (level) => {
    expect(condition?.(saved(level), {}, {} as never)).toBe(true)
  })

  it.each(['country', 'region'])('hides on a %s, which no event can name', (level) => {
    expect(condition?.(saved(level), {}, {} as never)).toBe(false)
  })

  it('hides before the first save, when nothing can point at the node yet', () => {
    expect(condition?.({ level: 'city' }, {}, {} as never)).toBe(false)
  })
})
