import type { Condition, Field, TabsField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Regions, REGION_LEVEL_OPTIONS } from '@/collections/Regions/Regions'
import { EVENT_REGION_LEVELS } from '@/lib/events/regionLevels'

const isTabs = (field: Field): field is TabsField => field.type === 'tabs'

/** Read off the tab, so this fails if the condition moves back onto the join field. */
const eventsTabCondition = (): Condition => {
  const tab = Regions.fields.find(isTabs)?.tabs.find((candidate) => candidate.label === 'Events')
  const condition = tab?.admin?.condition

  if (!condition) throw new Error('the Regions Events tab carries no condition')
  return condition
}

const otherLevels = REGION_LEVEL_OPTIONS.map((option) => option.value).filter(
  (level) => !EVENT_REGION_LEVELS.includes(level),
)

describe('the Regions Events tab', () => {
  const condition = eventsTabCondition()
  const saved = (level: string) => ({ id: 7, level })

  it.each([...EVENT_REGION_LEVELS])('shows on a %s, which an event can name', (level) => {
    expect(condition(saved(level), {}, {} as never)).toBe(true)
  })

  it.each(otherLevels)('hides on a %s, which no event can name', (level) => {
    expect(condition(saved(level), {}, {} as never)).toBe(false)
  })

  it('hides before the first save, when nothing can point at the node yet', () => {
    expect(condition({ level: 'city' }, {}, {} as never)).toBe(false)
  })

  // The tab's heading carries the "Import classes" link, so above a city that
  // link is not rendered at all. The edit menu is what a country and a region
  // keep it by, and `targetRegion` accepts both.
  it('leaves Import classes in the edit menu, which every level renders', () => {
    expect(Regions.admin?.components?.edit?.editMenuItems).toContain(
      '@/components/admin/EventImport/ImportClassesMenuItem',
    )
  })
})
