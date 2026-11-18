'use client'

import type { UIFieldClientComponent } from 'payload'

import { useField, useFormFields } from '@payloadcms/ui'
import React, { useCallback } from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { ScheduleSummaryBanner } from '@/components/admin/ScheduleSummary'

/** `admin.custom` on the `ui` field — serialized, so names, never callbacks. */
interface EventScheduleNoticeConfig {
  /** The schedule group's path. */
  schedule: string
  /** The `repeats` control. */
  recurrenceFrom: string
  /** The tab holding the public contact, and the checkbox that opens it. */
  contactTab: string
  contactToggle: string
}

/**
 * The head of an event's Schedule tab: the schedule in a sentence, or — for an
 * on-demand class, which has none — whether a seeker can reach anyone, with a
 * way to the contact fields when they cannot.
 *
 * Reads live form state, so it answers for the choice just made, unsaved.
 */
export const EventScheduleNotice: UIFieldClientComponent = ({ field }) => {
  const config = (field?.admin?.custom ?? {}) as EventScheduleNoticeConfig
  const repeats = useFormFields(([fields]) => fields[config.recurrenceFrom]?.value)

  if (repeats === 'inactive') return <OnDemandContactNotice config={config} />
  return (
    <ScheduleSummaryBanner recurrenceFrom={config.recurrenceFrom} schedulePath={config.schedule} />
  )
}

function OnDemandContactNotice({ config }: { config: EventScheduleNoticeConfig }) {
  const { value: allowContact, setValue: setAllowContact } = useField<boolean>({
    path: config.contactToggle,
  })
  const phone = useFormFields(([fields]) => fields.contactPhone?.value)
  const email = useFormFields(([fields]) => fields.contactEmail?.value)
  const name = useFormFields(([fields]) => fields.contactName?.value)

  const reachable = Boolean(allowContact && (phone || email))

  const openContact = useCallback(() => {
    if (!allowContact) setAllowContact(true)
    revealField(config.contactTab, `field-${config.contactToggle}`)
  }, [allowContact, setAllowContact, config.contactTab, config.contactToggle])

  if (!reachable) {
    return (
      <InfoBanner
        action={{ label: 'Add contact details', onClick: openContact }}
        title="Add a public contact"
        type="warning"
      >
        An on-demand class has no schedule to show, so a phone number or an email address is the
        only way seekers can reach you. It can&rsquo;t be saved without one.
      </InfoBanner>
    )
  }

  const routes =
    phone && email
      ? 'a phone number and an email address'
      : phone
        ? 'a phone number'
        : 'an email address'
  return (
    <InfoBanner
      action={{ label: 'Edit public contact', onClick: openContact }}
      title={`Seekers will contact ${typeof name === 'string' && name ? name : 'you'} to arrange a time`}
    >
      The listing shows no schedule. It shows {routes} instead, so seekers can get in touch.
    </InfoBanner>
  )
}

/**
 * Switch to another tab of the form and bring one field into view.
 *
 * shortcut: Payload's `Tabs` field keeps its active tab in component state and
 * exposes no way to set it, so this clicks the tab's own button. Upgrade if
 * Payload ships a tab API or URL-addressable tabs.
 */
function revealField(tabLabel: string, fieldId: string) {
  const scroll = () => {
    const target = document.getElementById(fieldId)
    if (!target) return false
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.focus({ preventScroll: true })
    return true
  }
  if (scroll()) return

  const tab = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.tabs-field__tab-button'),
  ).find((button) => button.textContent?.trim() === tabLabel)
  tab?.click()
  // The tab's fields mount after the click; give them a few frames.
  let attempts = 0
  const retry = () => {
    if (scroll() || ++attempts > 20) return
    requestAnimationFrame(retry)
  }
  requestAnimationFrame(retry)
}

export default EventScheduleNotice
