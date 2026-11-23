/**
 * What the Pages sidebar notice says about where a page is available
 * (`src/components/admin/PageAvailability`). Which configuration places a page
 * is `page-services.spec.ts`; this is only the wording that follows.
 */
import { describe, expect, it } from 'vitest'

import { availabilityNotice } from '@/components/admin/PageAvailability/notice'

const named = (service: 'app' | 'web') => ({ service, placement: { by: 'name' } }) as const
const tagged = (service: 'app' | 'web', tag: string) =>
  ({ service, placement: { by: 'tag', tag } }) as const

describe('the availability notice', () => {
  it('names both services a published page is placed in, and what placed it', () => {
    const notice = availabilityNotice(true, [tagged('web', 'wisdom'), named('app')])
    expect(notice.title).toBe(
      'Available on the website (tagged “wisdom”) and in the app (named in its configuration)',
    )
    expect(notice.type).toBe('default')
    // Placed in both, so there is nothing left to name it in.
    expect(notice.text).toBeUndefined()
  })

  it('says where to place a page one service is missing', () => {
    const notice = availabilityNotice(true, [named('web')])
    expect(notice.title).toBe('Available on the website (named in its configuration)')
    expect(notice.text).toContain('We Meditate App › Configuration')
    expect(notice.text).not.toContain('We Meditate Web')
  })

  it('warns when no configuration places a published page', () => {
    const notice = availabilityNotice(true, [])
    expect(notice.title).toBe('Not available on the website or in the app')
    expect(notice.type).toBe('warning')
    expect(notice.text).toContain('We Meditate Web › Configuration')
    expect(notice.text).toContain('We Meditate App › Configuration')
  })

  it('leads with the publish state, and still says where publishing would reach', () => {
    const notice = availabilityNotice(false, [tagged('app', 'technique')])
    expect(notice.title).toBe('Not published, so available nowhere')
    expect(notice.text).toContain(
      'Publishing it makes it available in the app (tagged “technique”).',
    )
    expect(notice.text).toContain('We Meditate Web › Configuration')
  })

  it('asks for a placement first when a draft has none', () => {
    const notice = availabilityNotice(false, [])
    expect(notice.title).toBe('Not published, so available nowhere')
    expect(notice.text).not.toContain('Publishing it')
  })
})
