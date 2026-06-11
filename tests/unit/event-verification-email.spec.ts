import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { EventVerificationReminderEmail } from '@/emails/EventVerificationReminderEmail'
import { getEmailBrand, renderEmail } from '@/plugins/email'

const baseProps = {
  name: 'Jo Manager',
  eventTitle: 'Morning Meditation',
  verifyUrl: 'https://cloud.test/api/events/42/verify?token=TKN123',
}

describe('EventVerificationReminderEmail', () => {
  it.each(['due', 'escalated', 'expired'] as const)(
    'renders the %s reminder with the verify link + sahaj-atlas brand',
    async (level) => {
      const html = await renderEmail(
        createElement(EventVerificationReminderEmail, { ...baseProps, level }),
      )
      const brand = getEmailBrand('sahaj-atlas')

      expect(html).toContain('Morning Meditation')
      expect(html).toContain(baseProps.verifyUrl)
      expect(html).toContain(brand.productName) // "Sahaj Atlas"
      expect(html).toContain(brand.colors.primary) // "#4a8cd4"
    },
  )

  it('varies the copy by escalation level', async () => {
    const due = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'due' }),
    )
    const expired = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'expired' }),
    )

    expect(due).not.toBe(expired)
    expect(expired.toLowerCase()).toContain('unpublished')
  })
})
