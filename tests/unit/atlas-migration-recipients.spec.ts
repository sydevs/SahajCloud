import { describe, expect, it } from 'vitest'

import { describeHoldings } from '@/emails/AtlasMigrationEmail'

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

  it('mails Atlas managers named on a live event or a region, and every Atlas admin', () => {
    const recipients = select({
      managers: [manager(1), manager(2), manager(3, { type: 'admin' }), manager(4)],
      liveEventManagers: [1, 1, null],
      regionManagers: [[2], [2, 1]],
    })

    expect(recipients.map((r) => [r.id, r.holds])).toEqual([
      [1, { admin: false, events: 2, regions: 1 }],
      [2, { admin: false, events: 0, regions: 2 }],
      [3, { admin: true, events: 0, regions: 0 }],
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

describe('describeHoldings', () => {
  it('names classes and regions, singular where there is one', () => {
    expect(describeHoldings({ admin: false, events: 1, regions: 2 })).toBe('1 class and 2 regions')
    expect(describeHoldings({ admin: false, events: 0, regions: 0 })).toBeNull()
  })
})
