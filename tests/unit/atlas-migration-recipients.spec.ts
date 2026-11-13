import { describe, expect, it } from 'vitest'

import { cmsHighlights } from '@/emails/AtlasMigrationEmail'

import { selectRecipients } from '../../scripts/atlas-migration-recipients'

const manager = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  email: `M${id}@Example.com `,
  name: `Manager ${id}`,
  type: 'manager',
  legacyId: 1000 + id,
  ...extra,
})

describe('selectRecipients', () => {
  const select = (args: Partial<Parameters<typeof selectRecipients>[0]>) =>
    selectRecipients({
      managers: [],
      liveEventManagers: [],
      regionManagers: [],
      alreadySent: new Set(),
      ...args,
    })

  it('mails Atlas managers named on a live event, a region or a service, and no admin', () => {
    const recipients = select({
      managers: [manager(1), manager(2), manager(3, { type: 'admin' }), manager(4)],
      liveEventManagers: [1, 1, 3, null],
      regionManagers: [[2], [2, 1]],
      serviceManagers: [[4]],
    })

    expect(recipients.map((r) => [r.id, r.holds])).toEqual([
      [1, { events: 2, regions: 1, services: 0 }],
      [2, { events: 0, regions: 2, services: 0 }],
      [4, { events: 0, regions: 0, services: 1 }],
    ])
  })

  it('skips accounts the import did not create, inactive ones, and anyone already sent', () => {
    const recipients = select({
      managers: [manager(1, { legacyId: null }), manager(2, { type: 'inactive' }), manager(3)],
      liveEventManagers: [1, 2, 3],
      alreadySent: new Set(['m3@example.com']),
    })

    expect(recipients).toEqual([])
  })

  it('normalises the address the ledger compares against', () => {
    const [recipient] = select({ managers: [manager(5)], liveEventManagers: [5] })

    expect(recipient?.email).toBe('m5@example.com')
  })
})

describe('cmsHighlights', () => {
  const holds = { events: 1, regions: 0, services: 0 }
  const mentions = (lines: { text: string }[], text: string) =>
    lines.some((line) => line.text.includes(text))

  it('speaks of the area only to a region manager', () => {
    expect(mentions(cmsHighlights(holds), 'in your area')).toBe(false)
    expect(mentions(cmsHighlights({ ...holds, regions: 1 }), 'in your area')).toBe(true)
  })

  it('offers map customisation only to someone who looks after a website', () => {
    expect(mentions(cmsHighlights({ ...holds, regions: 1 }), 'your website')).toBe(false)
    expect(mentions(cmsHighlights({ ...holds, services: 1 }), 'your website')).toBe(true)
  })

  it('offers the registrations list only to someone who runs a class', () => {
    expect(mentions(cmsHighlights(holds), 'signed up')).toBe(true)
    expect(mentions(cmsHighlights({ ...holds, events: 0, regions: 1 }), 'signed up')).toBe(false)
  })
})
