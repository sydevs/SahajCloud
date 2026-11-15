import type { Condition, Field, TabsField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Regions, REGION_LEVEL_OPTIONS } from '@/collections/Regions/Regions'

const isTabs = (field: Field): field is TabsField => field.type === 'tabs'

/** Read off the tab, so this fails if the condition moves onto the join field. */
const eventsTabCondition = (): Condition => {
  const tab = Regions.fields.find(isTabs)?.tabs.find((candidate) => candidate.label === 'Events')
  const condition = tab?.admin?.condition

  if (!condition) throw new Error('the Regions Events tab carries no condition')
  return condition
}

describe('the Regions Events tab', () => {
  const condition = eventsTabCondition()

  it.each(REGION_LEVEL_OPTIONS.map((option) => option.value))('shows on a saved %s', (level) => {
    expect(condition({ id: 7, level }, {}, {} as never)).toBe(true)
  })

  it('hides before the first save, when nothing can point at the node yet', () => {
    expect(condition({ level: 'city' }, {}, {} as never)).toBe(false)
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
