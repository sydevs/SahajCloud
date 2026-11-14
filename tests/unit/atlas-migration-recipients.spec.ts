import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { AtlasInstallEmail, atlasInstallSubject } from '@/emails/AtlasInstallEmail'
import { cmsHighlights } from '@/emails/AtlasMigrationEmail'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import { selectInstallRecipients, selectRecipients } from '../../scripts/atlas-migration-recipients'

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

describe('selectInstallRecipients', () => {
  const service = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    label: `Service ${id}`,
    legacyId: id,
    enabled: true,
    roles: ['sahaj-atlas-client'],
    site: { domain: `site${id}.example`, track: null },
    managers: [1],
    ...extra,
  })
  const select = (args: Partial<Parameters<typeof selectInstallRecipients>[0]>) =>
    selectInstallRecipients({
      managers: [manager(1), manager(2), manager(3, { type: 'admin' })],
      services: [],
      adopted: new Set(),
      alreadySent: new Set(),
      ...args,
    })

  it('mails each manager of an imported service still on the old map, once per service', () => {
    const recipients = select({ services: [service(10, { managers: [1, { id: 2 }, 3] })] })

    expect(recipients.map((r) => [r.managerId, r.service, r.key])).toEqual([
      [1, { id: 10, label: 'Service 10', domain: 'site10.example' }, 'm1@example.com clients/10'],
      [2, { id: 10, label: 'Service 10', domain: 'site10.example' }, 'm2@example.com clients/10'],
    ])
  })

  it('skips a service with nothing to install, or whose install is already in hand', () => {
    const recipients = select({
      services: [
        service(11, { legacyId: null }),
        service(12, { enabled: false }),
        service(13, { roles: ['wemeditate-web-client'] }),
        service(14, { site: { domain: null } }),
        service(15, { site: { domain: 'site15.example', track: 'wix' } }),
        service(16),
      ],
      adopted: new Set([16]),
    })

    expect(recipients).toEqual([])
  })

  it('skips a service the new widget has already reported, whatever its track says', () => {
    const reported = { 'https://site17.example/classes': { mode: 'inline' } }
    const recipients = select({ services: [service(17, { embedMetadata: reported })] })

    expect(recipients).toEqual([])
  })

  it('skips a pair the ledger already holds', () => {
    const recipients = select({
      services: [service(20), service(21)],
      alreadySent: new Set(['m1@example.com clients/20']),
    })

    expect(recipients.map((r) => r.service.id)).toEqual([21])
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

describe('AtlasInstallEmail', () => {
  /** A stored host keeps its `www.`, and the subject and the body must not disagree over it. */
  it('names the site the same way in the subject and the body', async () => {
    const { html } = await renderEmail(
      createElement(AtlasInstallEmail, {
        brand: getEmailBrand('sahaj-atlas'),
        name: 'Jo',
        email: 'jo@example.org',
        domain: 'www.example.org',
        installUrl: 'https://cloud.test/x?t=1',
        installTabUrl: 'https://cloud.test/x',
        validFor: '7 days',
        signInUrl: 'https://cloud.test/admin/login',
        mapUrl: 'https://cloud.test/map',
      }),
    )

    expect(atlasInstallSubject('www.example.org')).toContain('Upgrade example.org')
    expect(html).toContain('example.org')
    expect(html).not.toContain('www.example.org')
  })
})
