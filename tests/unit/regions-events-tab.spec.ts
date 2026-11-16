import type { Condition, Field, JoinField, TabsField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Regions, REGION_LEVEL_OPTIONS } from '@/collections/Regions/Regions'

const isTabs = (field: Field): field is TabsField => field.type === 'tabs'

const eventsTab = () =>
  Regions.fields.find(isTabs)?.tabs.find((candidate) => candidate.label === 'Events')

/** Read off the tab, so this fails if the condition moves onto the join field. */
const eventsTabCondition = (): Condition => {
  const condition = eventsTab()?.admin?.condition

  if (!condition) throw new Error('the Regions Events tab carries no condition')
  return condition
}

const eventsJoin = (): JoinField => {
  const join = eventsTab()?.fields.find((field): field is JoinField => field.type === 'join')

  if (!join) throw new Error('the Regions Events tab carries no join')
  return join
}

describe('the Regions Events tab', () => {
  const condition = eventsTabCondition()

  it.each(REGION_LEVEL_OPTIONS.map((option) => option.value))('shows on a saved %s', (level) => {
    expect(condition({ id: 7, level }, {}, {} as never)).toBe(true)
  })

  it('hides before the first save, when nothing can point at the node yet', () => {
    expect(condition({ level: 'city' }, {}, {} as never)).toBe(false)
  })

  // A join resolves `on: 'region'` alone, and `events.region` takes a city or
  // a venue — so the native table is empty on a country and a region, which is
  // the emptiness #1145 answered by hiding the tab. RegionEvents is what makes
  // the tab worth showing there: it re-queries the whole subtree.
  it('renders the table through RegionEvents, not the direct join', () => {
    expect(eventsJoin().admin?.components?.Field).toBe('@/components/admin/RegionEvents')
  })

  // The Events tab's heading carries the other "Import classes" link, and a
  // heading renders only while its own tab is open. The edit menu is what
  // offers the link from every other tab.
  it('keeps Import classes in the edit menu, which every tab renders', () => {
    expect(Regions.admin?.components?.edit?.editMenuItems).toContain(
      '@/components/admin/EventImport/ImportClassesMenuItem',
    )
  })
})
